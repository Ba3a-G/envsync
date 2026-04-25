import { beforeEach, describe, expect, test } from "bun:test";

import { generateKeyPair } from "@/helpers/key-store";
import { testRequest } from "../helpers/request";
import { cleanupDB, seedApp, seedEnvType, seedOrg, type SeedOrgResult } from "../helpers/db";
import { MockFGAClient, resetFGA, setupUserOrgTuples } from "../helpers/fga";
import { resetVaultStore } from "../helpers/kms";

interface HistoryEntry {
	id: string;
	created_at: string;
	changes_count: number;
	change_request_message: string;
}

interface SeededSecretPitScenario {
	seed: SeedOrgResult;
	appId: string;
	envTypeId: string;
	history: HistoryEntry[];
}

async function seedScenario(): Promise<SeededSecretPitScenario> {
	await cleanupDB();
	resetFGA();
	resetVaultStore();

	const seed = await seedOrg();
	setupUserOrgTuples(seed.masterUser.id, seed.org.id, {
		is_master: true,
		is_admin: true,
		can_view: true,
		can_edit: true,
		have_api_access: true,
		have_billing_options: true,
		have_webhook_access: true,
	});

	const keyPair = generateKeyPair();
	const app = await seedApp(seed.org.id, {
		name: "PiT Range Secret App",
		enableSecrets: true,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});
	const envType = await seedEnvType(seed.org.id, app.id, { name: "pit-range-secret" });

	await MockFGAClient.writeTuples([
		{ user: `app:${app.id}`, relation: "app", object: `env_type:${envType.id}` },
		{ user: `org:${seed.org.id}`, relation: "org", object: `env_type:${envType.id}` },
		{ user: `org:${seed.org.id}`, relation: "org", object: `app:${app.id}` },
	]);

	await testRequest("/api/secret/batch", {
		method: "PUT",
		token: seed.masterUser.token,
		body: {
			app_id: app.id,
			env_type_id: envType.id,
			envs: [
				{ key: "A", value: "1" },
				{ key: "B", value: "1" },
			],
		},
	});

	await Bun.sleep(25);

	await testRequest("/api/secret/i/A", {
		method: "PATCH",
		token: seed.masterUser.token,
		body: {
			app_id: app.id,
			env_type_id: envType.id,
			value: "2",
		},
	});

	await Bun.sleep(25);

	await testRequest("/api/secret/single", {
		method: "PUT",
		token: seed.masterUser.token,
		body: {
			app_id: app.id,
			env_type_id: envType.id,
			key: "C",
			value: "1",
		},
	});

	await Bun.sleep(25);

	await testRequest("/api/secret", {
		method: "DELETE",
		token: seed.masterUser.token,
		body: {
			app_id: app.id,
			env_type_id: envType.id,
			key: "B",
		},
	});

	const historyRes = await testRequest("/api/secret/history", {
		method: "POST",
		token: seed.masterUser.token,
		body: {
			app_id: app.id,
			env_type_id: envType.id,
			page: 1,
			per_page: 20,
		},
	});

	const historyBody = await historyRes.json<{ pits: HistoryEntry[] }>();

	return {
		seed,
		appId: app.id,
		envTypeId: envType.id,
		history: historyBody.pits,
	};
}

beforeEach(async () => {
	await cleanupDB();
	resetFGA();
	resetVaultStore();
});

describe("Secret PiT range APIs", () => {
	test("history without filters still works and includes changes_count", async () => {
		const { seed, appId, envTypeId, history } = await seedScenario();

		const res = await testRequest("/api/secret/history", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				page: 1,
				per_page: 20,
			},
		});

		expect(res.status).toBe(200);
		const body = await res.json<{ pits: HistoryEntry[]; totalPages: number }>();
		expect(body.totalPages).toBe(1);
		expect(body.pits.length).toBe(4);
		expect(body.pits[body.pits.length - 1].changes_count).toBe(2);
		expect(body.pits.map(pit => pit.id)).toEqual(history.map(pit => pit.id));
	});

	test("history supports lower bound, upper bound, both bounds, and filtered totalPages", async () => {
		const { seed, appId, envTypeId, history } = await seedScenario();
		const newest = history[0];
		const newer = history[1];
		const older = history[2];
		const oldest = history[3];

		const lowerBoundRes = await testRequest("/api/secret/history", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				page: 1,
				per_page: 20,
				from_created_at: older.created_at,
			},
		});
		const lowerBoundBody = await lowerBoundRes.json<{ pits: HistoryEntry[] }>();
		expect(lowerBoundBody.pits.map(pit => pit.id)).toEqual(history.slice(0, 3).map(pit => pit.id));

		const upperBoundRes = await testRequest("/api/secret/history", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				page: 1,
				per_page: 20,
				to_created_at: older.created_at,
			},
		});
		const upperBoundBody = await upperBoundRes.json<{ pits: HistoryEntry[] }>();
		expect(upperBoundBody.pits.map(pit => pit.id)).toEqual([older.id, oldest.id]);

		const boundedRes = await testRequest("/api/secret/history", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				page: 1,
				per_page: 1,
				from_created_at: older.created_at,
				to_created_at: newer.created_at,
			},
		});
		const boundedBody = await boundedRes.json<{ pits: HistoryEntry[]; totalPages: number }>();
		expect(boundedBody.pits.length).toBe(1);
		expect(boundedBody.totalPages).toBe(2);

		const invalidRangeRes = await testRequest("/api/secret/history", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				page: 1,
				per_page: 20,
				from_created_at: newer.created_at,
				to_created_at: older.created_at,
			},
		});
		expect(invalidRangeRes.status).toBe(400);
	});

	test("timestamp-range diff handles added, modified, deleted, mixed, and no-op ranges", async () => {
		const { seed, appId, envTypeId, history } = await seedScenario();
		const pit1 = history[3];
		const pit2 = history[2];
		const pit3 = history[1];
		const pit4 = history[0];

		const addedRes = await testRequest("/api/secret/diff/timestamp-range", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				from_timestamp: "1970-01-01T00:00:00.000Z",
				to_timestamp: pit1.created_at,
			},
		});
		const addedBody = await addedRes.json<{ added: Array<{ key: string }>; modified: unknown[]; deleted: unknown[] }>();
		expect(addedBody.added.map(change => change.key).sort()).toEqual(["A", "B"]);
		expect(addedBody.modified).toHaveLength(0);
		expect(addedBody.deleted).toHaveLength(0);

		const modifiedRes = await testRequest("/api/secret/diff/timestamp-range", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				from_timestamp: pit1.created_at,
				to_timestamp: pit2.created_at,
			},
		});
		const modifiedBody = await modifiedRes.json<{
			added: unknown[];
			modified: Array<{ key: string; old_value: string; new_value: string }>;
			deleted: unknown[];
		}>();
		expect(modifiedBody.added).toHaveLength(0);
		expect(modifiedBody.deleted).toHaveLength(0);
		expect(modifiedBody.modified).toHaveLength(1);
		expect(modifiedBody.modified[0]?.key).toBe("A");
		expect(modifiedBody.modified[0]?.old_value).toEqual(expect.any(String));
		expect(modifiedBody.modified[0]?.new_value).toEqual(expect.any(String));
		expect(modifiedBody.modified[0]?.old_value).not.toBe(modifiedBody.modified[0]?.new_value);

		const deletedRes = await testRequest("/api/secret/diff/timestamp-range", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				from_timestamp: pit3.created_at,
				to_timestamp: pit4.created_at,
			},
		});
		const deletedBody = await deletedRes.json<{ added: unknown[]; modified: unknown[]; deleted: Array<{ key: string }> }>();
		expect(deletedBody.added).toHaveLength(0);
		expect(deletedBody.modified).toHaveLength(0);
		expect(deletedBody.deleted).toHaveLength(1);
		expect(deletedBody.deleted[0]).toMatchObject({ key: "B" });
		expect((deletedBody.deleted[0] as { value?: string }).value).toEqual(expect.any(String));

		const mixedRes = await testRequest("/api/secret/diff/timestamp-range", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				from_timestamp: pit1.created_at,
				to_timestamp: pit4.created_at,
			},
		});
		const mixedBody = await mixedRes.json<{
			added: Array<{ key: string; value: string }>;
			modified: Array<{ key: string; old_value: string; new_value: string }>;
			deleted: Array<{ key: string; value: string }>;
		}>();
		expect(mixedBody.added).toHaveLength(1);
		expect(mixedBody.added[0]).toMatchObject({ key: "C" });
		expect(mixedBody.added[0]?.value).toEqual(expect.any(String));
		expect(mixedBody.modified).toHaveLength(1);
		expect(mixedBody.modified[0]?.key).toBe("A");
		expect(mixedBody.modified[0]?.old_value).toEqual(expect.any(String));
		expect(mixedBody.modified[0]?.new_value).toEqual(expect.any(String));
		expect(mixedBody.modified[0]?.old_value).not.toBe(mixedBody.modified[0]?.new_value);
		expect(mixedBody.deleted).toHaveLength(1);
		expect(mixedBody.deleted[0]).toMatchObject({ key: "B" });
		expect(mixedBody.deleted[0]?.value).toEqual(expect.any(String));

		const noopRes = await testRequest("/api/secret/diff/timestamp-range", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				app_id: appId,
				env_type_id: envTypeId,
				from_timestamp: pit2.created_at,
				to_timestamp: pit2.created_at,
			},
		});
		const noopBody = await noopRes.json<{ added: unknown[]; modified: unknown[]; deleted: unknown[] }>();
		expect(noopBody.added).toHaveLength(0);
		expect(noopBody.modified).toHaveLength(0);
		expect(noopBody.deleted).toHaveLength(0);
	});
});
