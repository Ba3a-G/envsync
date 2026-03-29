/**
 * Kind-backed E2E test preload.
 *
 * Uses the Kind-installed Kubernetes stack, with local port-forwards and a
 * generated env file written by `scripts/kind-e2e-setup.ts`.
 */

import fs from "node:fs";
import path from "node:path";

process.env.SKIP_ROOT_ENV = "1";

const projectRoot = findProjectRoot();
const envPath = path.join(projectRoot, ".env.kind.e2e.test");
if (fs.existsSync(envPath)) {
	loadEnvFileSimple(envPath);
	console.log(`[Kind E2E Setup] Loaded credentials from ${envPath}`);
} else {
	console.log(`[Kind E2E Setup] WARNING: ${envPath} not found. Run 'bun run ../../scripts/kind-e2e-setup.ts init' first.`);
}

Object.assign(process.env, {
	NODE_ENV: process.env.NODE_ENV ?? "development",
	PORT: process.env.PORT ?? "0",
	DB_LOGGING: process.env.DB_LOGGING ?? "false",
	DB_AUTO_MIGRATE: process.env.DB_AUTO_MIGRATE ?? "true",
	DATABASE_SSL: process.env.DATABASE_SSL ?? "false",
	CACHE_ENV: process.env.CACHE_ENV ?? "development",
	SMTP_SECURE: process.env.SMTP_SECURE ?? "false",
	MINIKMS_TLS_ENABLED: process.env.MINIKMS_TLS_ENABLED ?? "false",
});

const { CacheClient } = await import("@/libs/cache");
CacheClient.init(process.env.CACHE_ENV ?? "development");

const { DB } = await import("@/libs/db");
await DB.getInstance();
console.log("[Kind E2E Setup] Database initialized and migrations applied.");
console.log("[Kind E2E Setup] All dependencies are sourced from the Kind-installed stack.");

function findProjectRoot(): string {
	let dir = path.resolve(import.meta.dir, "../../..");
	for (;;) {
		if (fs.existsSync(path.join(dir, "package.json"))) {
			try {
				const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
				if (pkg.name === "envsync-api") return dir;
			} catch {}
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return path.resolve(import.meta.dir, "../../..");
}

function loadEnvFileSimple(filePath: string): void {
	const content = fs.readFileSync(filePath, "utf8");
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim();
		if (key) process.env[key] = value;
	}
}
