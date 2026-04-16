import { beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import {
	checkServiceHealth,
	seedE2EOrg,
	type E2ESeed,
} from "../helpers/real-auth";

let seed: E2ESeed;
let appId: string;
let envTypeId: string;

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();

	const appRes = await testRequest("/api/app", {
		method: "POST",
		token: seed.masterUser.token,
		body: {
			name: "E2E Vault Read After Write App",
			description: "Focused read-after-write regression coverage",
			enable_secrets: true,
		},
	});
	expect(appRes.status).toBe(201);
	const appBody = await appRes.json<{ id: string }>();
	appId = appBody.id;

	const envTypeRes = await testRequest("/api/env_type", {
		method: "POST",
		token: seed.masterUser.token,
		body: { name: "development", app_id: appId },
	});
	expect(envTypeRes.status).toBe(201);
	const envTypeBody = await envTypeRes.json<{ id: string }>();
	envTypeId = envTypeBody.id;
});

describe("Vault read-after-write E2E", () => {
	test("env write is immediately visible in list and app summary", async () => {
		const createRes = await testRequest("/api/env/single", {
			method: "PUT",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				key: "E2E_CURRENT_ENV",
				value: "env-current-value",
			},
		});
		expect(createRes.status).toBe(201);

		const listRes = await testRequest("/api/env", {
			method: "POST",
			token: seed.masterUser.token,
			body: { app_id: appId, env_type_id: envTypeId },
		});
		expect(listRes.status).toBe(200);
		const envs = await listRes.json<Array<{ key: string; value: string }>>();
		expect(envs.find(env => env.key === "E2E_CURRENT_ENV")?.value).toBe("env-current-value");

		const appRes = await testRequest(`/api/app/${appId}`, {
			method: "GET",
			token: seed.masterUser.token,
		});
		expect(appRes.status).toBe(200);
		const app = await appRes.json<{ envCount: number }>();
		expect(app.envCount).toBeGreaterThan(0);
	});

	test("secret write is immediately visible in list and app summary", async () => {
		const createRes = await testRequest("/api/secret/single", {
			method: "PUT",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				key: "E2E_CURRENT_SECRET",
				value: "super-secret-value",
			},
		});
		expect(createRes.status).toBe(201);

		const listRes = await testRequest("/api/secret", {
			method: "POST",
			token: seed.masterUser.token,
			body: { app_id: appId, env_type_id: envTypeId },
		});
		expect(listRes.status).toBe(200);
		const secrets = await listRes.json<Array<{ key: string; value: string }>>();
		expect(secrets.some(secret => secret.key === "E2E_CURRENT_SECRET")).toBe(true);

		const appRes = await testRequest(`/api/app/${appId}`, {
			method: "GET",
			token: seed.masterUser.token,
		});
		expect(appRes.status).toBe(200);
		const app = await appRes.json<{ secretCount: number }>();
		expect(app.secretCount).toBeGreaterThan(0);
	});

	test("env delete removes key from the current state list", async () => {
		const deleteRes = await testRequest("/api/env", {
			method: "DELETE",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				key: "E2E_CURRENT_ENV",
			},
		});
		expect(deleteRes.status).toBe(200);

		const listRes = await testRequest("/api/env", {
			method: "POST",
			token: seed.masterUser.token,
			body: { app_id: appId, env_type_id: envTypeId },
		});
		expect(listRes.status).toBe(200);
		const envs = await listRes.json<Array<{ key: string }>>();
		expect(envs.some(env => env.key === "E2E_CURRENT_ENV")).toBe(false);
	});

	test("secret delete removes key from the current state list", async () => {
		const deleteRes = await testRequest("/api/secret", {
			method: "DELETE",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				key: "E2E_CURRENT_SECRET",
			},
		});
		expect(deleteRes.status).toBe(200);

		const listRes = await testRequest("/api/secret", {
			method: "POST",
			token: seed.masterUser.token,
			body: { app_id: appId, env_type_id: envTypeId },
		});
		expect(listRes.status).toBe(200);
		const secrets = await listRes.json<Array<{ key: string }>>();
		expect(secrets.some(secret => secret.key === "E2E_CURRENT_SECRET")).toBe(false);
	});
});
