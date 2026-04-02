#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { OpenFgaClient } from "@openfga/sdk";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

import { authorizationModelDef } from "../src/libs/openfga/model";
import { updateRootEnv } from "../src/utils/load-root-env";
import { config } from "../src/utils/env";

const args = new Set(process.argv.slice(2));
const jsonMode = args.has("--json");
const noWriteRootEnv = args.has("--no-write-root-env");

function formatErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function log(message: string) {
	if (jsonMode) {
		console.error(message);
		return;
	}
	console.log(message);
}

function assertCompleteOpenFgaState() {
	if ((config.OPENFGA_STORE_ID && !config.OPENFGA_MODEL_ID) || (!config.OPENFGA_STORE_ID && config.OPENFGA_MODEL_ID)) {
		throw new Error("Partial OpenFGA bootstrap state detected. Set both OPENFGA_STORE_ID and OPENFGA_MODEL_ID, or neither.");
	}
}

async function initOpenFGA() {
	assertCompleteOpenFgaState();

	try {
		if (config.OPENFGA_STORE_ID && config.OPENFGA_MODEL_ID) {
			const existing = new OpenFgaClient({
				apiUrl: config.OPENFGA_API_URL,
				storeId: config.OPENFGA_STORE_ID,
				authorizationModelId: config.OPENFGA_MODEL_ID,
			});
			await existing.getStore();
			await existing.readAuthorizationModel({
				storeId: config.OPENFGA_STORE_ID,
				authorizationModelId: config.OPENFGA_MODEL_ID,
			});
			return {
				storeId: config.OPENFGA_STORE_ID,
				modelId: config.OPENFGA_MODEL_ID,
			};
		}

		const client = new OpenFgaClient({ apiUrl: config.OPENFGA_API_URL });
		const store = await client.createStore({ name: "envsync" });
		const model = await client.writeAuthorizationModel(authorizationModelDef, { storeId: store.id });

		if (!store.id || !model.authorization_model_id) {
			throw new Error("OpenFGA bootstrap failed to return store/model IDs");
		}

		if (!noWriteRootEnv) {
			updateRootEnv({
				OPENFGA_STORE_ID: store.id,
				OPENFGA_MODEL_ID: model.authorization_model_id,
			});
		}

		return {
			storeId: store.id,
			modelId: model.authorization_model_id,
		};
	} catch (error) {
		const message = formatErrorMessage(error);
		if (message.includes("status code 500") || message.includes("Internal Server Error")) {
			throw new Error(
				"OpenFGA is reachable but not initialized correctly. Verify the OpenFGA datastore migration completed successfully before running prod-init.",
			);
		}
		throw new Error(`OpenFGA bootstrap failed: ${message}`);
	}
}

async function initRustfs() {
	const client = new S3Client({
		region: config.S3_REGION,
		endpoint: config.S3_ENDPOINT,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.S3_ACCESS_KEY,
			secretAccessKey: config.S3_SECRET_KEY,
		},
	});
	try {
		await client.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET, ACL: "public-read" }));
	} catch {
	}
}

function runMigrations() {
	const result = spawnSync("bun", ["run", "scripts/migrate.ts", "latest"], {
		cwd: fileURLToPath(new URL("..", import.meta.url)),
		stdio: "inherit",
		env: process.env,
	});
	if (result.status !== 0) throw new Error("DB migrations failed");
}

async function main() {
	log("=== Keycloak ===");
	log(`KEYCLOAK_URL=${config.KEYCLOAK_URL}`);
	log(`KEYCLOAK_REALM=${config.KEYCLOAK_REALM}`);
	log(`KEYCLOAK_WEB_CLIENT_ID=${config.KEYCLOAK_WEB_CLIENT_ID}`);
	log(`KEYCLOAK_API_CLIENT_ID=${config.KEYCLOAK_API_CLIENT_ID}`);
	log(`KEYCLOAK_CLI_CLIENT_ID=${config.KEYCLOAK_CLI_CLIENT_ID}`);

	log("\n=== OpenFGA ===");
	const openfga = await initOpenFGA();

	log("\n=== Database ===");
	runMigrations();

	log("\n=== RustFS ===");
	await initRustfs();

	log("\n=== ClickStack ===");
	log("CLICKSTACK_URL=http://clickstack:8080");
	log("OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-agent:4318");

	if (jsonMode) {
		console.log(
			JSON.stringify({
				openfgaStoreId: openfga.storeId,
				openfgaModelId: openfga.modelId,
			}),
		);
		return;
	}

	console.log(`OPENFGA_STORE_ID=${openfga.storeId}`);
	console.log(`OPENFGA_MODEL_ID=${openfga.modelId}`);
}

await main().catch(error => {
	const message = formatErrorMessage(error);
	if (jsonMode) {
		console.error(message);
	} else {
		console.error(error instanceof Error ? error : message);
	}
	process.exit(1);
});
