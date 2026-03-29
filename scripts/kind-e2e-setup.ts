#!/usr/bin/env bun

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { bootstrapZitadelProject } from "../packages/envsync-api/tests/e2e/helpers/zitadel-bootstrap";

interface PortForwardHandle {
	name: string;
	child: ChildProcess;
	localPort: number;
	remotePort: number;
	stdoutPath: string;
	stderrPath: string;
}

interface PortForwardState {
	name: string;
	pid: number;
	localPort: number;
	remotePort: number;
}

interface KindE2EState {
	portForwards: PortForwardState[];
	mailpitContainerName: string;
}

const repoRoot = path.resolve(import.meta.dir, "..");
const tmpDir = path.join(repoRoot, ".tmp", "kind-e2e");
const statePath = path.join(tmpDir, "state.json");
const apiEnvPath = path.join(repoRoot, "packages", "envsync-api", ".env.kind.e2e.test");
const namespace = "envsync";
const release = "envsync";
const mailpitContainerName = "envsync-kind-e2e-mailpit";
const zitadelPatReaderPodName = "envsync-zitadel-pat-reader";
const helperPorts = {
	api: 14000,
	zitadel: 18080,
	openfga: 18090,
	postgres: 25432,
	rustfs: 29001,
	minikms: 15051,
	smtp: 11025,
	mailpitUi: 18025,
} as const;

function portAvailable(port: number): boolean {
	const server = Bun.listen({
		hostname: "127.0.0.1",
		port,
		socket: {
			data() {},
		},
	});
	server.stop(true);
	return true;
}

function resolvePort(preferred: number, fallback: number): number {
	try {
		return portAvailable(preferred) ? preferred : fallback;
	} catch {
		return fallback;
	}
}

function run(command: string, args: string[], capture = false): string {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: capture ? "pipe" : "inherit",
	});
	if ((result.status ?? 1) !== 0) {
		const stderr = result.stderr?.toString() ?? "";
		throw new Error(`Command failed: ${command} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`);
	}
	return result.stdout?.toString() ?? "";
}

function runAllowFailure(command: string, args: string[]): void {
	spawnSync(command, args, {
		cwd: repoRoot,
		stdio: "ignore",
	});
}

function runCapture(command: string, args: string[], cwd = repoRoot): { status: number; stdout: string; stderr: string } {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "pipe",
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout?.toString() ?? "",
		stderr: result.stderr?.toString() ?? "",
	};
}

function decodeSecret(data: Record<string, string>, key: string): string {
	const raw = data[key];
	if (!raw) {
		throw new Error(`Missing secret key: ${key}`);
	}
	return Buffer.from(raw, "base64").toString("utf8");
}

function decodeSecretOptional(data: Record<string, string>, key: string, fallback = ""): string {
	const raw = data[key];
	if (!raw) {
		return fallback;
	}
	return Buffer.from(raw, "base64").toString("utf8");
}

function readZitadelPatFromPvc(filename: "admin.pat" | "login-client.pat"): string {
	const manifestPath = path.join(tmpDir, `${zitadelPatReaderPodName}.yaml`);
	fs.mkdirSync(tmpDir, { recursive: true });
	fs.writeFileSync(
		manifestPath,
		[
			"apiVersion: v1",
			"kind: Pod",
			"metadata:",
			`  name: ${zitadelPatReaderPodName}`,
			`  namespace: ${namespace}`,
			"spec:",
			"  restartPolicy: Never",
			"  containers:",
			"    - name: reader",
			"      image: busybox:1.36",
			'      command: ["sh", "-lc", "sleep 300"]',
			"      volumeMounts:",
			"        - name: zitadel-data",
			"          mountPath: /current-dir",
			"  volumes:",
			"    - name: zitadel-data",
			"      persistentVolumeClaim:",
			`        claimName: ${release}-zitadel-data`,
			"",
		].join("\n"),
	);

	runAllowFailure("kubectl", ["delete", "pod", zitadelPatReaderPodName, "-n", namespace, "--ignore-not-found=true"]);
	run("kubectl", ["apply", "-f", manifestPath]);
	run("kubectl", [
		"wait",
		"--for=condition=Ready",
		`pod/${zitadelPatReaderPodName}`,
		"-n",
		namespace,
		"--timeout=120s",
	]);
	const pat = run(
		"kubectl",
		[
			"exec",
			"-n",
			namespace,
			zitadelPatReaderPodName,
			"--",
			"sh",
			"-lc",
			`cat /current-dir/${filename}`,
		],
		true,
	).trim();
	runAllowFailure("kubectl", ["delete", "pod", zitadelPatReaderPodName, "-n", namespace, "--ignore-not-found=true"]);
	if (!pat) {
		throw new Error(`Failed to read ${filename} from Zitadel PVC`);
	}
	return pat;
}

function readJson(command: string, args: string[]): any {
	return JSON.parse(run(command, args, true));
}

function ensureBootstrapComplete(): void {
	const status = run(
		"kubectl",
		["get", "configmap", `${release}-bootstrap-lock`, "-n", namespace, "-o", "jsonpath={.data.status}"],
		true,
	).trim();
	if (status !== "complete") {
		throw new Error(`Bootstrap lock is not complete. Current status: ${status || "missing"}`);
	}
}

async function waitForTcp(host: string, port: number, attempts = 30): Promise<void> {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const ready = await new Promise<boolean>(resolve => {
			const socket = net.createConnection({ host, port }, () => {
				socket.destroy();
				resolve(true);
			});
			socket.setTimeout(1500, () => {
				socket.destroy();
				resolve(false);
			});
			socket.on("error", () => resolve(false));
		});
		if (ready) {
			return;
		}
		await Bun.sleep(1000);
	}
	throw new Error(`Timed out waiting for TCP ${host}:${port}`);
}

async function waitForHttp(url: string, attempts = 30, headers?: Record<string, string>): Promise<void> {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
			if (response.ok) {
				return;
			}
		} catch {}
		await Bun.sleep(1000);
	}
	throw new Error(`Timed out waiting for HTTP ${url}`);
}

function startPortForward(name: string, namespaceArg: string, resource: string, localPort: number, remotePort: number): PortForwardHandle {
	fs.mkdirSync(tmpDir, { recursive: true });
	const stdoutPath = path.join(tmpDir, `${name}.log`);
	const stderrPath = path.join(tmpDir, `${name}.err.log`);
	fs.writeFileSync(stdoutPath, "");
	fs.writeFileSync(stderrPath, "");
	const stdout = fs.openSync(stdoutPath, "a");
	const stderr = fs.openSync(stderrPath, "a");
	const child = spawn("kubectl", ["-n", namespaceArg, "port-forward", resource, `${localPort}:${remotePort}`], {
		cwd: repoRoot,
		stdio: ["ignore", stdout, stderr],
	});
	return {
		name,
		child,
		localPort,
		remotePort,
		stdoutPath,
		stderrPath,
	};
}

function readState(): KindE2EState | null {
	if (!fs.existsSync(statePath)) {
		return null;
	}
	return JSON.parse(fs.readFileSync(statePath, "utf8")) as KindE2EState;
}

function writeState(portForwards: PortForwardHandle[]): void {
	fs.mkdirSync(tmpDir, { recursive: true });
	const state: KindE2EState = {
		portForwards: portForwards.map(portForward => ({
			name: portForward.name,
			pid: portForward.child.pid ?? -1,
			localPort: portForward.localPort,
			remotePort: portForward.remotePort,
		})),
		mailpitContainerName,
	};
	fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function killPid(pid: number): void {
	try {
		process.kill(pid, "SIGTERM");
	} catch {}
}

async function stopPortForward(handle: PortForwardHandle): Promise<void> {
	if (!handle.child.pid) return;
	if (handle.child.exitCode !== null) return;
	handle.child.kill("SIGTERM");
	for (let attempt = 1; attempt <= 10; attempt += 1) {
		if (handle.child.exitCode !== null) {
			return;
		}
		await Bun.sleep(200);
	}
	handle.child.kill("SIGKILL");
}

function stopProcess(pid: number): void {
	if (pid > 0) {
		killPid(pid);
	}
}

async function waitForPortForward(portForward: PortForwardHandle): Promise<void> {
	for (let attempt = 1; attempt <= 30; attempt += 1) {
		if (portForward.child.exitCode !== null) {
			const stderr = fs.existsSync(portForward.stderrPath) ? fs.readFileSync(portForward.stderrPath, "utf8").trim() : "";
			const stdout = fs.existsSync(portForward.stdoutPath) ? fs.readFileSync(portForward.stdoutPath, "utf8").trim() : "";
			throw new Error(
				`Port-forward ${portForward.name} exited early.${stderr ? `\n${stderr}` : stdout ? `\n${stdout}` : ""}`,
			);
		}

		const stdout = fs.existsSync(portForward.stdoutPath) ? fs.readFileSync(portForward.stdoutPath, "utf8") : "";
		if (stdout.includes(`Forwarding from 127.0.0.1:${portForward.localPort}`)) {
			return;
		}

		await Bun.sleep(500);
	}

	throw new Error(`Port-forward ${portForward.name} did not become ready on localhost:${portForward.localPort}`);
}

async function startMailpit(): Promise<{ smtpPort: number; uiPort: number }> {
	const smtpPort = resolvePort(helperPorts.smtp, helperPorts.smtp + 1000);
	const uiPort = resolvePort(helperPorts.mailpitUi, helperPorts.mailpitUi + 1000);
	runAllowFailure("docker", ["rm", "-f", mailpitContainerName]);
	run("docker", [
		"run",
		"-d",
		"--name",
		mailpitContainerName,
		"-p",
		`${smtpPort}:1025`,
		"-p",
		`${uiPort}:8025`,
		"axllent/mailpit:latest",
		"--smtp",
		"0.0.0.0:1025",
		"--listen",
		"0.0.0.0:8025",
	]);
	await waitForHttp(`http://127.0.0.1:${uiPort}/`);
	return { smtpPort, uiPort };
}

async function buildKindEnv(portForwards: PortForwardHandle[], smtpPort: number): Promise<void> {
	run("kubectl", ["get", "namespace", namespace]);
	ensureBootstrapComplete();

	const getPort = (name: string) => {
		const portForward = portForwards.find(candidate => candidate.name === name);
		if (!portForward) {
			throw new Error(`Missing port-forward: ${name}`);
		}
		return portForward.localPort;
	};

	const apiPort = getPort("api");
	const zitadelPort = getPort("zitadel");
	const openfgaPort = getPort("openfga");
	const postgresPort = getPort("postgres");
	const rustfsPort = getPort("rustfs");
	const minikmsPort = getPort("minikms");

	await waitForHttp(`http://127.0.0.1:${apiPort}/health`);
	await waitForHttp(`http://127.0.0.1:${zitadelPort}/debug/ready`);
	await waitForHttp(`http://127.0.0.1:${openfgaPort}/healthz`);
	await waitForTcp("127.0.0.1", postgresPort);
	await waitForTcp("127.0.0.1", minikmsPort);
	await waitForTcp("127.0.0.1", rustfsPort);

	const apiSecret = readJson("kubectl", ["get", "secret", `${release}-api-secret`, "-n", namespace, "-o", "json"]);
	const bootstrapSecret = readJson("kubectl", ["get", "secret", `${release}-bootstrap`, "-n", namespace, "-o", "json"]);
	const apiConfig = readJson("kubectl", ["get", "configmap", `${release}-api-config`, "-n", namespace, "-o", "json"]);

	const apiSecretData = apiSecret.data as Record<string, string>;
	const bootstrapData = bootstrapSecret.data as Record<string, string>;
	const configData = apiConfig.data as Record<string, string>;
	const adminPat = readZitadelPatFromPvc("admin.pat");
	const loginPat = readZitadelPatFromPvc("login-client.pat");
	process.env.ZITADEL_REQUEST_HOST = "auth.envsync.local";
	const e2eClient = await bootstrapZitadelProject(
		`http://127.0.0.1:${zitadelPort}`,
		adminPat,
	);

	const envFile = [
		"SKIP_ROOT_ENV=1",
		"NODE_ENV=development",
		"PORT=0",
		"DB_LOGGING=false",
		"DB_AUTO_MIGRATE=true",
		"DATABASE_SSL=false",
		"DATABASE_HOST=127.0.0.1",
		`DATABASE_PORT=${postgresPort}`,
		`DATABASE_USER=${decodeSecret(apiSecretData, "DATABASE_USER")}`,
		`DATABASE_PASSWORD=${decodeSecret(apiSecretData, "DATABASE_PASSWORD")}`,
		`DATABASE_NAME=${configData.DATABASE_NAME}`,
		`S3_BUCKET=${configData.S3_BUCKET}`,
		`S3_REGION=${configData.S3_REGION}`,
		`S3_ACCESS_KEY=${decodeSecret(apiSecretData, "S3_ACCESS_KEY")}`,
		`S3_SECRET_KEY=${decodeSecret(apiSecretData, "S3_SECRET_KEY")}`,
		`S3_BUCKET_URL=http://127.0.0.1:${rustfsPort}/${configData.S3_BUCKET}`,
		`S3_ENDPOINT=http://127.0.0.1:${rustfsPort}`,
		"CACHE_ENV=development",
		"SMTP_HOST=127.0.0.1",
		`SMTP_PORT=${smtpPort}`,
		"SMTP_SECURE=false",
		`SMTP_FROM=${configData.SMTP_FROM}`,
		`ZITADEL_URL=http://127.0.0.1:${zitadelPort}`,
		`ZITADEL_CONNECT_URL=http://127.0.0.1:${zitadelPort}`,
		"ZITADEL_EXTERNAL_URL=http://auth.envsync.local",
		"ZITADEL_REQUEST_HOST=auth.envsync.local",
		`ZITADEL_PAT=${adminPat}`,
		`ZITADEL_LOGIN_PAT=${loginPat}`,
		`ZITADEL_WEB_CLIENT_ID=${decodeSecret(bootstrapData, "ZITADEL_WEB_CLIENT_ID")}`,
		`ZITADEL_WEB_CLIENT_SECRET=${decodeSecret(bootstrapData, "ZITADEL_WEB_CLIENT_SECRET")}`,
		`ZITADEL_CLI_CLIENT_ID=${decodeSecret(bootstrapData, "ZITADEL_CLI_CLIENT_ID")}`,
		`ZITADEL_CLI_CLIENT_SECRET=${decodeSecretOptional(bootstrapData, "ZITADEL_CLI_CLIENT_SECRET")}`,
		`ZITADEL_API_CLIENT_ID=${decodeSecret(bootstrapData, "ZITADEL_API_CLIENT_ID")}`,
		`ZITADEL_API_CLIENT_SECRET=${decodeSecret(bootstrapData, "ZITADEL_API_CLIENT_SECRET")}`,
		`ZITADEL_WEB_REDIRECT_URI=${configData.ZITADEL_WEB_REDIRECT_URI}`,
		`ZITADEL_WEB_CALLBACK_URL=${configData.ZITADEL_WEB_CALLBACK_URL}`,
		`ZITADEL_API_REDIRECT_URI=${configData.ZITADEL_API_REDIRECT_URI}`,
		`LANDING_PAGE_URL=${configData.LANDING_PAGE_URL}`,
		`DASHBOARD_URL=${configData.DASHBOARD_URL}`,
		`OPENFGA_API_URL=http://127.0.0.1:${openfgaPort}`,
		`OPENFGA_STORE_ID=${decodeSecret(bootstrapData, "OPENFGA_STORE_ID")}`,
		`OPENFGA_MODEL_ID=${decodeSecret(bootstrapData, "OPENFGA_MODEL_ID")}`,
		`MINIKMS_GRPC_ADDR=127.0.0.1:${minikmsPort}`,
		"MINIKMS_TLS_ENABLED=false",
		`ZITADEL_E2E_CLIENT_ID=${e2eClient.appClientId}`,
		`ZITADEL_E2E_CLIENT_SECRET=${e2eClient.appClientSecret}`,
	].join("\n");

	fs.writeFileSync(apiEnvPath, `${envFile}\n`);
	console.log(`Kind E2E environment ready: ${apiEnvPath}`);
}

async function startKindDependencies(): Promise<{ portForwards: PortForwardHandle[]; smtpPort: number }> {
	const { smtpPort } = await startMailpit();

	const apiPort = resolvePort(helperPorts.api, helperPorts.api + 1000);
	const zitadelPort = resolvePort(helperPorts.zitadel, helperPorts.zitadel + 1000);
	const openfgaPort = resolvePort(helperPorts.openfga, helperPorts.openfga + 1000);
	const postgresPort = resolvePort(helperPorts.postgres, helperPorts.postgres + 1000);
	const rustfsPort = resolvePort(helperPorts.rustfs, helperPorts.rustfs + 1000);
	const minikmsPort = resolvePort(helperPorts.minikms, helperPorts.minikms + 1000);

	const portForwards: PortForwardHandle[] = [
		startPortForward("api", namespace, `svc/${release}-api`, apiPort, 4000),
		startPortForward("zitadel", namespace, `svc/${release}-zitadel`, zitadelPort, 8080),
		startPortForward("openfga", namespace, `svc/${release}-openfga`, openfgaPort, 8090),
		startPortForward("postgres", namespace, `svc/${release}-postgresql`, postgresPort, 5432),
		startPortForward("rustfs", namespace, `svc/${release}-rustfs`, rustfsPort, 9000),
		startPortForward("minikms", namespace, `svc/${release}-minikms`, minikmsPort, 50051),
	];

	writeState(portForwards);
	for (const portForward of portForwards) {
		await waitForPortForward(portForward);
	}

	return { portForwards, smtpPort };
}

async function cleanupHandles(handles: PortForwardHandle[] = []): Promise<void> {
	for (const handle of handles) {
		await stopPortForward(handle);
	}
}

async function init(): Promise<void> {
	await cleanup();
	const { portForwards, smtpPort } = await startKindDependencies();
	try {
		await buildKindEnv(portForwards, smtpPort);
	} catch (error) {
		await cleanupHandles(portForwards);
		runAllowFailure("docker", ["rm", "-f", mailpitContainerName]);
		throw error;
	}
}

async function cleanup(): Promise<void> {
	const state = readState();
	if (state) {
		for (const portForward of state.portForwards) {
			stopProcess(portForward.pid);
		}
	}
	runAllowFailure("docker", ["rm", "-f", mailpitContainerName]);
	if (fs.existsSync(apiEnvPath)) {
		fs.unlinkSync(apiEnvPath);
	}
	if (fs.existsSync(statePath)) {
		fs.unlinkSync(statePath);
	}
}

async function runTests(): Promise<void> {
	await cleanup();
	const portForwards: PortForwardHandle[] = [];
	try {
		runAllowFailure("make", ["kind-delete"]);
		run("make", ["kind-smoke-test"]);

		const deps = await startKindDependencies();
		portForwards.push(...deps.portForwards);
		await buildKindEnv(portForwards, deps.smtpPort);

		const result = runCapture("bun", ["run", "test:e2e:kind"], path.join(repoRoot, "packages", "envsync-api"));
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		if (result.status !== 0) {
			throw new Error(`Kind application E2E failed with exit code ${result.status}`);
		}
	} finally {
		await cleanupHandles(portForwards);
		await cleanup();
	}
}

const command = process.argv[2] || "init";

if (command === "init") {
	await init();
} else if (command === "cleanup") {
	await cleanup();
} else if (command === "run-tests") {
	await runTests();
} else {
	console.error("Usage: bun run scripts/kind-e2e-setup.ts <init|cleanup|run-tests>");
	process.exit(1);
}
