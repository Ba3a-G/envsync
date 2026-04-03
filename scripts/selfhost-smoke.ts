#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const smokeRoot = path.join(rootDir, ".tmp", "selfhost-smoke");
const runId = Date.now().toString(36);
const stackName = `envsync-smoke-${runId}`;
const tmpRoot = path.join(smokeRoot, stackName);
const hostRoot = path.join(tmpRoot, "opt");
const etcRoot = path.join(tmpRoot, "etc");
const traefikStateRoot = path.join(tmpRoot, "var", "lib", "envsync", "traefik");
const deployRoot = path.join(hostRoot, "deploy");
const releasesRoot = path.join(hostRoot, "releases");
const deployEnvPath = path.join(etcRoot, "deploy.env");
const deployYamlPath = path.join(etcRoot, "deploy.yaml");
const internalConfigPath = path.join(deployRoot, "config.json");
const traefikDynamicPath = path.join(deployRoot, "traefik-dynamic.yaml");
const stackPath = path.join(deployRoot, "docker-stack.yaml");
const keepFailed = process.argv.includes("--keep-failed");
const version = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version as string;
const rootDomain = "127.0.0.1.sslip.io";
const otelEndpoint = `https://obs.${rootDomain}`;
let publicHttpPort = 18080;
let publicHttpsPort = 18443;
const managedVolumes = [
	"postgres_data",
	"redis_data",
	"rustfs_data",
	"keycloak_db_data",
	"openfga_db_data",
	"minikms_db_data",
	"clickstack_data",
	"clickstack_ch_data",
	"clickstack_ch_logs",
];

function run(cmd: string, args: string[], options: { stdio?: "inherit" | "pipe"; env?: Record<string, string> } = {}) {
	const result = spawnSync(cmd, args, {
		cwd: rootDir,
		stdio: options.stdio ?? "inherit",
		encoding: "utf8",
		env: { ...process.env, ...options.env },
	});
	if (result.status !== 0) {
		const stderr = typeof result.stderr === "string" ? result.stderr : "";
		throw new Error(`Command failed: ${cmd} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`);
	}
	return result.stdout?.trim() ?? "";
}

function tryRun(cmd: string, args: string[], options: { stdio?: "inherit" | "pipe"; env?: Record<string, string> } = {}) {
	const result = spawnSync(cmd, args, {
		cwd: rootDir,
		stdio: options.stdio ?? "pipe",
		encoding: "utf8",
		env: { ...process.env, ...options.env },
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout?.trim() ?? "",
		stderr: result.stderr?.trim() ?? "",
	};
}

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir: string) {
	fs.rmSync(dir, { recursive: true, force: true });
}

async function reserveFreePort() {
	return await new Promise<number>((resolve, reject) => {
		const server = net.createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Could not resolve free TCP port")));
				return;
			}
			const { port } = address;
			server.close(error => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

function envForSmoke() {
	return {
		ENVSYNC_HOST_ROOT: hostRoot,
		ENVSYNC_ETC_ROOT: etcRoot,
		ENVSYNC_TRAEFIK_STATE_ROOT: traefikStateRoot,
		ENVSYNC_REPO_ROOT: rootDir,
	};
}

function writeConfig() {
	ensureDir(etcRoot);
	ensureDir(traefikStateRoot);
	ensureDir(path.join(hostRoot, "backups"));
	ensureDir(path.join(releasesRoot, "web", "current"));
	ensureDir(path.join(releasesRoot, "landing", "current"));
	const config = {
		source: {
			repo_url: "https://github.com/EnvSync-Cloud/envsync.git",
			ref: `v${version}`,
		},
		release: {
			version,
		},
		domain: {
			root_domain: rootDomain,
			acme_email: "smoke@127.0.0.1.sslip.io",
		},
		services: {
			stack_name: stackName,
			api_port: 4000,
			public_http_port: publicHttpPort,
			public_https_port: publicHttpsPort,
			clickstack_ui_port: 8080,
			clickstack_otlp_http_port: 4318,
			clickstack_otlp_grpc_port: 4317,
			keycloak_port: 8080,
			rustfs_port: 9000,
			rustfs_console_port: 9001,
		},
		auth: {
			keycloak_realm: "envsync",
			admin_user: "admin",
			admin_password: "envsync-smoke-admin",
			web_client_id: "envsync-web",
			api_client_id: "envsync-api",
			cli_client_id: "envsync-cli",
		},
		observability: {
			retention_days: 7,
			public_obs: true,
		},
		backup: {
			output_dir: path.join(hostRoot, "backups"),
			encrypted: true,
		},
		smtp: {
			host: "smtp.example.com",
			port: 587,
			secure: true,
			user: "",
			pass: "",
			from: "noreply@127.0.0.1.sslip.io",
		},
		exposure: {
			public_auth: true,
			public_obs: true,
			mailpit_enabled: false,
			s3_public: true,
			s3_console_public: true,
		},
	};
	fs.writeFileSync(deployYamlPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function ensureSwarmManager() {
	const state = tryRun("docker", ["info", "--format", "{{.Swarm.LocalNodeState}}|{{.Swarm.ControlAvailable}}"]);
	const current = state.stdout.trim();
	if (current === "active|true") return;
	if (!current || current === "inactive|false") {
		run("docker", ["swarm", "init"]);
		return;
	}
	throw new Error(`Docker Swarm manager is required for selfhost smoke. Current state: ${current || "unknown"}`);
}

function runCli(args: string[], capture = false) {
	return run("bun", ["run", "packages/deploy-cli/src/index.ts", ...args], {
		stdio: capture ? "pipe" : "inherit",
		env: envForSmoke(),
	});
}

function buildLocalReleaseImages() {
	console.log("Building local self-host smoke images\n");
	run("docker", ["build", "-t", `ghcr.io/envsync-cloud/envsync-api:${version}`, "packages/envsync-api"]);
	run("bun", ["run", "--filter", "@envsync-cloud/envsync-ts-sdk", "build"]);
	run("bun", ["run", "--filter", "envsync-web", "build"], {
		env: {
			VITE_API_BASE_URL: "https://placeholder.invalid",
			VITE_HYPERDX_DISABLED: "true",
		},
	});
	run("docker", [
		"build",
		"-t",
		`ghcr.io/envsync-cloud/envsync-web-static:${version}`,
		"-f",
		"docker/frontend-static.Dockerfile",
		"apps/envsync-web",
	]);
	run("bun", ["run", "--filter", "envsync-landing", "build"], {
		env: {
			VITE_API_BASE_URL: "https://placeholder.invalid",
			VITE_HYPERDX_DISABLED: "true",
		},
	});
	run("docker", [
		"build",
		"-t",
		`ghcr.io/envsync-cloud/envsync-landing-static:${version}`,
		"-f",
		"docker/frontend-static.Dockerfile",
		"apps/envsync-landing",
	]);
}

function readJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readRuntimeConfig(filePath: string) {
	const source = fs.readFileSync(filePath, "utf8").trim();
	const prefix = "window.__ENVSYNC_RUNTIME_CONFIG__ = ";
	if (!source.startsWith(prefix) || !source.endsWith(";")) {
		throw new Error(`Unexpected runtime-config format in ${filePath}`);
	}
	return JSON.parse(source.slice(prefix.length, -1)) as { otelEndpoint?: string };
}

function assert(condition: unknown, message: string) {
	if (!condition) {
		throw new Error(message);
	}
}

function assertBootstrapArtifacts(expectedOtelEndpoint: string) {
	const deployEnv = fs.readFileSync(deployEnvPath, "utf8");
	const internal = readJson<{
		generated: {
			openfga: { store_id: string; model_id: string };
			bootstrap: { completed_at: string };
		};
	}>(internalConfigPath);
	const traefikDynamic = fs.readFileSync(traefikDynamicPath, "utf8");
	const stackFile = fs.readFileSync(stackPath, "utf8");
	const webRuntime = readRuntimeConfig(path.join(releasesRoot, "web", "current", "runtime-config.js"));
	const landingRuntime = readRuntimeConfig(path.join(releasesRoot, "landing", "current", "runtime-config.js"));
	assert(/OPENFGA_STORE_ID=.+/.test(deployEnv), "deploy.env is missing OPENFGA_STORE_ID");
	assert(/OPENFGA_MODEL_ID=.+/.test(deployEnv), "deploy.env is missing OPENFGA_MODEL_ID");
	assert(internal.generated.openfga.store_id.length > 0, "config.json is missing generated OpenFGA store_id");
	assert(internal.generated.openfga.model_id.length > 0, "config.json is missing generated OpenFGA model_id");
	assert(internal.generated.bootstrap.completed_at.length > 0, "bootstrap completion timestamp was not persisted");
	assert(traefikDynamic.includes("obs-ui-router"), "traefik-dynamic.yaml is missing obs-ui-router");
	assert(traefikDynamic.includes("obs-api-router"), "traefik-dynamic.yaml is missing obs-api-router");
	assert(traefikDynamic.includes("obs-otlp-router"), "traefik-dynamic.yaml is missing obs-otlp-router");
	assert(stackFile.includes(`${stackName}-s3-router`), "stack file is missing explicit S3 router name");
	assert(stackFile.includes(`${stackName}-s3-console-router`), "stack file is missing explicit S3 console router name");
	assert(webRuntime.otelEndpoint === expectedOtelEndpoint, "web runtime-config has the wrong OTel endpoint");
	assert(landingRuntime.otelEndpoint === expectedOtelEndpoint, "landing runtime-config has the wrong OTel endpoint");
}

function runDiagnostics() {
	console.error("\nSelf-host smoke diagnostics\n");
	const commands: Array<[string, string[]]> = [
		["docker", ["service", "ls"]],
		["docker", ["service", "ps", `${stackName}_traefik`, "--no-trunc"]],
		["docker", ["service", "ps", `${stackName}_clickstack`, "--no-trunc"]],
		["docker", ["service", "ps", `${stackName}_keycloak`, "--no-trunc"]],
		["docker", ["service", "ps", `${stackName}_openfga`, "--no-trunc"]],
		["docker", ["ps", "--filter", `name=${stackName}`]],
		["docker", ["service", "logs", `${stackName}_traefik`, "--tail", "100"]],
		["docker", ["service", "logs", `${stackName}_clickstack`, "--tail", "100"]],
		["docker", ["service", "logs", `${stackName}_keycloak`, "--tail", "100"]],
		["docker", ["service", "logs", `${stackName}_openfga`, "--tail", "100"]],
	];
	for (const [cmd, args] of commands) {
		console.error(`\n$ ${cmd} ${args.join(" ")}`);
		const result = tryRun(cmd, args);
		if (result.stdout) console.error(result.stdout);
		if (result.stderr) console.error(result.stderr);
	}
}

function cleanup() {
	const stackList = tryRun("docker", ["stack", "ls", "--format", "{{.Name}}"]);
	if (stackList.stdout.split(/\r?\n/).includes(stackName)) {
		tryRun("docker", ["stack", "rm", stackName]);
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			const remaining = tryRun("docker", ["stack", "ls", "--format", "{{.Name}}"]).stdout.split(/\r?\n/);
			if (!remaining.includes(stackName)) break;
			spawnSync("sleep", ["2"], { stdio: "ignore" });
		}
	}
	tryRun("docker", ["network", "rm", `${stackName}_envsync`]);
	for (const volume of managedVolumes) {
		tryRun("docker", ["volume", "rm", "-f", `${stackName}_${volume}`]);
	}
	removeDir(tmpRoot);
}

async function main() {
	console.log("Self-host smoke test\n");
	ensureSwarmManager();
	publicHttpPort = await reserveFreePort();
	publicHttpsPort = await reserveFreePort();
	buildLocalReleaseImages();
	writeConfig();

	let firstStoreId = "";
	try {
		runCli(["bootstrap", "--force"]);
		runCli(["deploy"]);
		const health = JSON.parse(runCli(["health", "--json"], true)) as {
			bootstrap: { completed: boolean };
		};
		assert(health.bootstrap.completed === true, "health --json did not report bootstrap completed");
		assertBootstrapArtifacts(otelEndpoint);
		firstStoreId = readJson<{ generated: { openfga: { store_id: string } } }>(internalConfigPath).generated.openfga.store_id;
		assert(firstStoreId.length > 0, "first bootstrap did not persist an OpenFGA store ID");
		runCli(["bootstrap", "--force"]);
		const secondStoreId = readJson<{ generated: { openfga: { store_id: string } } }>(internalConfigPath).generated.openfga.store_id;
		assert(secondStoreId.length > 0, "second bootstrap did not persist an OpenFGA store ID");
		assert(secondStoreId !== firstStoreId, "second destructive bootstrap reused the previous OpenFGA store ID");
		console.log("\nSelf-host smoke test passed");
	} catch (error) {
		runDiagnostics();
		throw error;
	} finally {
		if (!keepFailed) {
			cleanup();
		} else {
			console.log(`\nKeeping failed smoke state at ${tmpRoot}`);
		}
	}
}

main().catch(error => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
