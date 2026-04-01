#!/usr/bin/env bun
/**
 * E2E Test Environment Manager.
 *
 * Subcommands:
 *   init    — Start docker services, wait for health, create e2e database,
 *             write .env.e2e.test
 *   cleanup — Drop e2e database, remove .env.e2e.test
 *
 * Usage:
 *   bun run scripts/e2e-setup.ts init
 *   bun run scripts/e2e-setup.ts cleanup
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	loadEnvFile,
	updateEnvFile,
	waitForPostgres,
	waitForOpenFGA,
	waitForMailpit,
	waitForKeycloak,
	waitForMiniKMS,
} from "./lib/services";
import { bootstrapKeycloakClient } from "../packages/envsync-api/tests/e2e/helpers/keycloak-bootstrap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const apiDir = path.join(rootDir, "packages/envsync-api");
const envE2EPath = path.join(apiDir, ".env.e2e.test");

const E2E_DB_NAME = "envsync_e2e_test";
const E2E_MINIKMS_ROOT_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// ── Docker Compose helpers ──────────────────────────────────────────

function dockerComposeBuildKeycloak(): void {
	console.log("\nBuilding local Keycloak image for E2E...");
	const result = spawnSync(
		"docker",
		["compose", "build", "keycloak"],
		{ cwd: rootDir, stdio: "inherit", env: process.env },
	);
	if (result.status !== 0) throw new Error("Docker Compose build for Keycloak failed.");
}

function dockerComposeUp(): void {
	process.env.MINIKMS_ROOT_KEY ||= E2E_MINIKMS_ROOT_KEY;
	console.log("\nStarting Docker Compose services for E2E...");
	const result = spawnSync(
		"docker",
		[
			"compose",
			"up",
			"-d",
			"postgres",
			"redis",
			"openfga_db",
			"openfga_migrate",
			"openfga",
			"mailpit",
			"keycloak_db",
			"keycloak",
			"minikms_db",
			"minikms_migrate",
			"minikms",
			"clickstack",
			"otel-agent",
		],
		{ cwd: rootDir, stdio: "inherit", env: process.env },
	);
	if (result.status !== 0) throw new Error("Docker Compose up failed.");
}

function ensureKeycloakHttpAdminSupport(adminUser: string, adminPassword: string): void {
	console.log("\nConfiguring Keycloak admin realm for local HTTP...");
	const login = spawnSync(
		"docker",
		[
			"exec",
			"monorepo-keycloak-1",
			"/opt/keycloak/bin/kcadm.sh",
			"config",
			"credentials",
			"--server",
			"http://localhost:8080",
			"--realm",
			"master",
			"--user",
			adminUser,
			"--password",
			adminPassword,
		],
		{ cwd: rootDir, stdio: "inherit", env: process.env },
	);
	if (login.status !== 0) {
		throw new Error("Failed to authenticate to Keycloak via kcadm.");
	}

	const update = spawnSync(
		"docker",
		[
			"exec",
			"monorepo-keycloak-1",
			"/opt/keycloak/bin/kcadm.sh",
			"update",
			"realms/master",
			"-s",
			"sslRequired=NONE",
		],
		{ cwd: rootDir, stdio: "inherit", env: process.env },
	);
	if (update.status !== 0) {
		throw new Error("Failed to relax Keycloak master realm SSL requirement for local E2E.");
	}
}

function ensureMiniKmsSchema(): void {
	console.log("\nEnsuring miniKMS schema...");

	const check = spawnSync(
		"docker",
		[
			"exec",
			"monorepo-minikms_db-1",
			"psql",
			"-U",
			process.env.MINIKMS_DB_USER ?? "postgres",
			"-d",
			"minikms",
			"-tAc",
			"SELECT to_regclass('public.certificates') IS NOT NULL",
		],
		{ cwd: rootDir, encoding: "utf8", env: process.env },
	);

	if (check.status === 0 && check.stdout.trim() === "t") {
		console.log("  miniKMS schema already present.");
		return;
	}

	const migrate = spawnSync(
		"docker",
		["compose", "run", "--rm", "minikms_migrate"],
		{ cwd: rootDir, stdio: "inherit", env: process.env },
	);
	if (migrate.status !== 0) {
		throw new Error("miniKMS migration failed.");
	}

	const restart = spawnSync("docker", ["restart", "monorepo-minikms-1"], {
		cwd: rootDir,
		stdio: "inherit",
		env: process.env,
	});
	if (restart.status !== 0) {
		throw new Error("Failed to restart miniKMS after migration.");
	}
}

// ── Database helpers ────────────────────────────────────────────────

function createE2EDatabase(): void {
	const host = process.env.DATABASE_HOST ?? "localhost";
	const port = process.env.DATABASE_PORT ?? "5432";
	const user = process.env.DATABASE_USER ?? "postgres";

	console.log(`\nCreating E2E database '${E2E_DB_NAME}'...`);

	// Check if database already exists
	const checkResult = spawnSync(
		"psql",
		["-h", host, "-p", port, "-U", user, "-tAc", `SELECT 1 FROM pg_database WHERE datname='${E2E_DB_NAME}'`],
		{ encoding: "utf8", env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD ?? "postgres" } },
	);

	if (checkResult.stdout?.trim() === "1") {
		console.log(`  Database '${E2E_DB_NAME}' already exists.`);
		return;
	}

	const result = spawnSync(
		"createdb",
		["-h", host, "-p", port, "-U", user, E2E_DB_NAME],
		{ stdio: "inherit", env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD ?? "postgres" } },
	);
	if (result.status !== 0) {
		throw new Error(`Failed to create database '${E2E_DB_NAME}'.`);
	}
	console.log(`  Database '${E2E_DB_NAME}' created.`);
}

function dropE2EDatabase(): void {
	const host = process.env.DATABASE_HOST ?? "localhost";
	const port = process.env.DATABASE_PORT ?? "5432";
	const user = process.env.DATABASE_USER ?? "postgres";

	console.log(`\nDropping E2E database '${E2E_DB_NAME}'...`);

	const result = spawnSync(
		"dropdb",
		["-h", host, "-p", port, "-U", user, "--if-exists", E2E_DB_NAME],
		{ stdio: "inherit", env: { ...process.env, PGPASSWORD: process.env.DATABASE_PASSWORD ?? "postgres" } },
	);
	if (result.status !== 0) {
		console.log(`  Warning: Failed to drop database '${E2E_DB_NAME}' (may not exist).`);
	} else {
		console.log(`  Database '${E2E_DB_NAME}' dropped.`);
	}
}

// ── Init ────────────────────────────────────────────────────────────

async function init(): Promise<void> {
	console.log("E2E Environment Setup\n");

	// Load root .env for docker-compose port overrides
	const rootEnvPath = path.join(rootDir, ".env");
	if (fs.existsSync(rootEnvPath)) {
		loadEnvFile(rootEnvPath);
	}
	process.env.MINIKMS_ROOT_KEY ||= E2E_MINIKMS_ROOT_KEY;

	// Start docker services
	dockerComposeBuildKeycloak();
	dockerComposeUp();

	// Wait for services
	console.log("\nWaiting for services...");
	await new Promise(r => setTimeout(r, 3000));
	await waitForPostgres();
	await waitForOpenFGA();
	await waitForMailpit();
	await waitForKeycloak();
	await waitForMiniKMS();

	const keycloakUrl = process.env.KEYCLOAK_URL ?? "http://localhost:8080";
	const keycloakRealm = process.env.KEYCLOAK_REALM ?? "envsync";
	const keycloakAdminUser = process.env.KEYCLOAK_ADMIN_USER ?? "admin";
	const keycloakAdminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "admin";

	ensureKeycloakHttpAdminSupport(keycloakAdminUser, keycloakAdminPassword);
	ensureMiniKmsSchema();

	console.log("\nBootstrapping Keycloak client for E2E...");
	const keycloakClient = await bootstrapKeycloakClient(
		keycloakUrl,
		keycloakRealm,
		keycloakAdminUser,
		keycloakAdminPassword,
	);
	console.log(`  Client: ${keycloakClient.clientId}`);

	// Create E2E database
	createE2EDatabase();

	// Resolve OpenFGA URL
	const openfgaUrl = (
		process.env.OPENFGA_API_URL ?? `http://localhost:${process.env.OPENFGA_HTTP_PORT ?? "8090"}`
	).replace(/\/$/, "");

	// Write .env.e2e.test
	const e2eEnv: Record<string, string> = {
		MINIKMS_ROOT_KEY: process.env.MINIKMS_ROOT_KEY,
		MINIKMS_GRPC_ADDR: "localhost:50051",
		MINIKMS_TLS_ENABLED: "false",
		OPENFGA_API_URL: openfgaUrl,
		KEYCLOAK_URL: keycloakUrl,
		KEYCLOAK_REALM: keycloakRealm,
		KEYCLOAK_ADMIN_USER: keycloakAdminUser,
		KEYCLOAK_ADMIN_PASSWORD: keycloakAdminPassword,
		KEYCLOAK_WEB_REDIRECT_URI: process.env.KEYCLOAK_WEB_REDIRECT_URI ?? "http://api.lvh.me:4000/api/access/web/callback",
		KEYCLOAK_WEB_CALLBACK_URL: process.env.KEYCLOAK_WEB_CALLBACK_URL ?? "http://app.lvh.me:8001/auth/callback",
		KEYCLOAK_API_REDIRECT_URI: process.env.KEYCLOAK_API_REDIRECT_URI ?? "http://api.lvh.me:4000/api/access/api/callback",
		KEYCLOAK_E2E_CLIENT_ID: keycloakClient.clientId,
		KEYCLOAK_E2E_CLIENT_SECRET: keycloakClient.clientSecret,
		LANDING_PAGE_URL: process.env.LANDING_PAGE_URL ?? "http://localhost:8002",
		DASHBOARD_URL: process.env.DASHBOARD_URL ?? "http://app.lvh.me:8001",
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:14318",
		OTEL_SERVICE_NAME: "envsync-api",
	};

	updateEnvFile(envE2EPath, e2eEnv);
	console.log(`\n.env.e2e.test written to ${envE2EPath}`);

	console.log("\nE2E environment setup complete!");
	console.log("Run tests with: cd packages/envsync-api && bun run test:e2e");
}

// ── Cleanup ─────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
	console.log("E2E Environment Cleanup\n");

	// Load root .env for database connection info
	const rootEnvPath = path.join(rootDir, ".env");
	if (fs.existsSync(rootEnvPath)) {
		loadEnvFile(rootEnvPath);
	}

	// Drop E2E database
	dropE2EDatabase();

	// Remove .env.e2e.test
	if (fs.existsSync(envE2EPath)) {
		fs.unlinkSync(envE2EPath);
		console.log(`Removed ${envE2EPath}`);
	} else {
		console.log(`.env.e2e.test not found (already removed?).`);
	}

	console.log("\nE2E cleanup complete!");
}

// ── CLI ─────────────────────────────────────────────────────────────

const cmd = process.argv[2];
if (cmd === "init") {
	init().catch(err => {
		console.error(err);
		process.exit(1);
	});
} else if (cmd === "cleanup") {
	cleanup().catch(err => {
		console.error(err);
		process.exit(1);
	});
} else {
	console.log("Usage: bun run scripts/e2e-setup.ts <init|cleanup>");
	process.exit(cmd ? 1 : 0);
}
