import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";

type LicenseStatus = "active" | "inactive" | "expired" | "locked";

type LicenseStore = {
	licenses: Array<{
		key: string;
		label: string;
		edition: "oss" | "enterprise" | "any";
		status: LicenseStatus;
		max_activations: number;
		expires_at: string | null;
		notes: string | null;
	}>;
	activations: Array<{
		license_key: string;
		install_fingerprint: string;
		edition: "oss" | "enterprise";
		root_domain: string | null;
		stack_name: string | null;
		release_version: string | null;
		activated_at: string;
		last_verified_at: string;
		last_lease_expires_at: string | null;
	}>;
};

export interface LocalLicenseServer {
	baseUrl: string;
	accessKey: string;
	storePath: string;
	readStore: () => LicenseStore;
	setLicenseStatus: (status: LicenseStatus) => void;
	stop: () => Promise<void>;
}

async function findFreePort() {
	return await new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to allocate free port for local license server."));
				return;
			}
			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

function waitForExit(child: ChildProcess) {
	return new Promise<void>((resolve) => {
		child.once("exit", () => resolve());
	});
}

async function waitForHealth(baseUrl: string, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/health`);
			if (response.ok) {
				return;
			}
			lastError = new Error(`Health check failed with status ${response.status}`);
		} catch (error) {
			lastError = error;
		}
		await Bun.sleep(100);
	}

	throw new Error(`Timed out waiting for local license server health: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function startLocalLicenseServer(input: {
	accessKey?: string;
	installFingerprint?: string;
	licenseKey?: string;
	licenseStatus?: LicenseStatus;
	leaseTtlSeconds?: number;
} = {}): Promise<LocalLicenseServer> {
	const accessKey = input.accessKey ?? "envsync-license-test-access-key";
	const installFingerprint = input.installFingerprint ?? "envsync-e2e-install";
	const licenseKey = input.licenseKey ?? "envsync-enterprise-dev";
	const licenseStatus = input.licenseStatus ?? "active";
	const leaseTtlSeconds = input.leaseTtlSeconds ?? 1;
	const port = await findFreePort();
	const tempRoot = mkdtempSync(path.join(tmpdir(), "envsync-license-server-"));
	const storePath = path.join(tempRoot, "data", "license-store.json");

	mkdirSync(path.dirname(storePath), { recursive: true });
	writeFileSync(storePath, JSON.stringify({
		licenses: [
			{
				key: licenseKey,
				label: "E2E Enterprise License",
				edition: "enterprise",
				status: licenseStatus,
				max_activations: 1,
				expires_at: null,
				notes: "Generated for E2E tests.",
			},
		],
		activations: [
			{
				license_key: licenseKey,
				install_fingerprint: installFingerprint,
				edition: "enterprise",
				root_domain: null,
				stack_name: "envsync-e2e",
				release_version: "e2e",
				activated_at: new Date().toISOString(),
				last_verified_at: new Date().toISOString(),
				last_lease_expires_at: null,
			},
		],
	} satisfies LicenseStore, null, 2));

	const repoRoot = path.resolve(import.meta.dir, "../../../../../");
	const child = spawn(
		process.execPath,
		["run", path.join(repoRoot, "packages/license-server/src/index.ts")],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				PORT: String(port),
				LICENSE_SERVER_ACCESS_KEY: accessKey,
				LICENSE_SERVER_SIGNING_SECRET: "envsync-license-test-secret",
				LICENSE_SERVER_LEASE_TTL_SECONDS: String(leaseTtlSeconds),
				LICENSE_SERVER_STORE_FILE: storePath,
				LICENSE_SERVER_DEV_LICENSE_KEY: licenseKey,
			},
			stdio: "ignore",
		},
	);

	if (!child.pid) {
		throw new Error("Failed to start local license server process.");
	}

	const baseUrl = `http://127.0.0.1:${port}`;
	await waitForHealth(baseUrl);

	const readStore = () => JSON.parse(readFileSync(storePath, "utf8")) as LicenseStore;
	const setLicenseStatus = (status: LicenseStatus) => {
		const store = readStore();
		store.licenses[0].status = status;
		writeFileSync(storePath, JSON.stringify(store, null, 2));
	};

	return {
		baseUrl,
		accessKey,
		storePath,
		readStore,
		setLicenseStatus,
		stop: async () => {
			child.kill("SIGTERM");
			await Promise.race([
				waitForExit(child),
				Bun.sleep(2_000).then(() => {
					if (child.exitCode === null) {
						child.kill("SIGKILL");
					}
				}),
			]);
			rmSync(tempRoot, { recursive: true, force: true });
		},
	};
}
