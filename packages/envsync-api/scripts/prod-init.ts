#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { OpenFgaClient } from "@openfga/sdk";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

import { authorizationModelDef } from "../src/libs/openfga/model";
import { updateRootEnv } from "../src/utils/load-root-env";
import { config } from "../src/utils/env";

async function initOpenFGA() {
	const client = new OpenFgaClient({ apiUrl: config.OPENFGA_API_URL });
	const store = await client.createStore({ name: "envsync" });
	const model = await client.writeAuthorizationModel(authorizationModelDef, { storeId: store.id });
	updateRootEnv({
		OPENFGA_STORE_ID: store.id,
		OPENFGA_MODEL_ID: model.authorization_model_id,
	});
	console.log(`OPENFGA_STORE_ID=${store.id}`);
	console.log(`OPENFGA_MODEL_ID=${model.authorization_model_id}`);
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
	console.log("=== Keycloak ===");
	console.log(`KEYCLOAK_URL=${config.KEYCLOAK_URL}`);
	console.log(`KEYCLOAK_REALM=${config.KEYCLOAK_REALM}`);
	console.log(`KEYCLOAK_WEB_CLIENT_ID=${config.KEYCLOAK_WEB_CLIENT_ID}`);
	console.log(`KEYCLOAK_API_CLIENT_ID=${config.KEYCLOAK_API_CLIENT_ID}`);
	console.log(`KEYCLOAK_CLI_CLIENT_ID=${config.KEYCLOAK_CLI_CLIENT_ID}`);

	console.log("\n=== OpenFGA ===");
	await initOpenFGA();

	console.log("\n=== Database ===");
	runMigrations();

	console.log("\n=== RustFS ===");
	await initRustfs();

	console.log("\n=== ClickStack ===");
	console.log("CLICKSTACK_URL=http://clickstack:8080");
	console.log("OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-agent:4318");
}

await main();
