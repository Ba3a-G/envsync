import { beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import {
	checkServiceHealth,
	type E2ESeed,
	seedE2EOrg,
} from "../helpers/real-auth";

let seed: E2ESeed;

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();
});

describe("GPG Lifecycle E2E", () => {
	let originalId: string;
	let rotatedId: string;

	test("extend expiry updates key lifetime before rotation", async () => {
		const generateRes = await testRequest("/api/gpg_key/generate", {
			method: "PUT",
			token: seed.masterUser.token,
			body: {
				name: "Lifecycle Signing Key",
				email: "gpg-lifecycle@test.local",
				algorithm: "ecc-curve25519",
				usage_flags: ["sign"],
				expires_in_days: 30,
				is_default: true,
			},
		});
		expect(generateRes.status).toBe(201);
		const generated = await generateRes.json<{ id: string; expires_at: string | null; is_default: boolean }>();
		originalId = generated.id;
		expect(generated.is_default).toBe(true);

		const extendRes = await testRequest(`/api/gpg_key/${originalId}/extend-expiry`, {
			method: "POST",
			token: seed.masterUser.token,
			body: { expires_in_days: 365 },
		});
		expect(extendRes.status).toBe(200);
		const extended = await extendRes.json<{ id: string; expires_at: string | null; status: string }>();
		expect(extended.id).toBe(originalId);
		expect(extended.expires_at).toBeTruthy();
		expect(extended.status).toBe("active");
	});

	test("rotate creates a successor key and supersedes the previous default", async () => {
		const rotateRes = await testRequest(`/api/gpg_key/${originalId}/rotate`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				expires_in_days: 180,
				revoke_previous: true,
				set_new_default: true,
			},
		});
		expect(rotateRes.status).toBe(200);
		const rotated = await rotateRes.json<{
			id: string;
			supersedes_gpg_key_id?: string | null;
			is_default: boolean;
			status: string;
		}>();
		rotatedId = rotated.id;
		expect(rotated.id).not.toBe(originalId);
		expect(rotated.supersedes_gpg_key_id).toBe(originalId);
		expect(rotated.is_default).toBe(true);
		expect(rotated.status).toBe("active");

		const originalRes = await testRequest(`/api/gpg_key/${originalId}`, {
			token: seed.masterUser.token,
		});
		expect(originalRes.status).toBe(200);
		const original = await originalRes.json<{ id: string; status: string; is_default: boolean }>();
		expect(original.id).toBe(originalId);
		expect(original.status).toBe("superseded");
		expect(original.is_default).toBe(false);
	});
});
