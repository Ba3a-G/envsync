import { beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import {
	checkServiceHealth,
	type E2ESeed,
	seedE2EOrg,
	seedE2EUser,
} from "../helpers/real-auth";

let seed: E2ESeed;
let memberUser: { id: string; token: string; email: string };

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();
	memberUser = await seedE2EUser(seed.org.id, seed.roles.developer.id);
});

describe("Certificate Lifecycle E2E", () => {
	let originalId: string;
	let renewedId: string;

	test("renewing a member certificate links lineage and supersedes the original", async () => {
		const issueRes = await testRequest("/api/certificate/issue", {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				member_email: memberUser.email,
				role: "developer",
				description: "Lifecycle original cert",
			},
		});
		expect(issueRes.status).toBe(201);
		const issued = await issueRes.json<{ id: string; subject_email: string | null }>();
		originalId = issued.id;
		expect(issued.subject_email).toBe(memberUser.email);

		const renewRes = await testRequest(`/api/certificate/${originalId}/renew`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				description: "Lifecycle renewed cert",
				revoke_previous: true,
			},
		});
		expect(renewRes.status).toBe(200);
		const renewed = await renewRes.json<{ id: string; subject_email: string | null }>();
		renewedId = renewed.id;
		expect(renewed.id).not.toBe(originalId);
		expect(renewed.subject_email).toBe(memberUser.email);

		const listRes = await testRequest("/api/certificate", {
			token: seed.masterUser.token,
		});
		expect(listRes.status).toBe(200);
		const certs = await listRes.json<Array<{
			id: string;
			status: string;
			supersedes_certificate_id?: string | null;
		}>>();
		const original = certs.find((cert) => cert.id === originalId);
		const replacement = certs.find((cert) => cert.id === renewedId);
		expect(original?.status).toBe("superseded");
		expect(replacement?.supersedes_certificate_id).toBe(originalId);
	});

	test("rotate endpoint issues another replacement certificate", async () => {
		const rotateRes = await testRequest(`/api/certificate/${renewedId}/rotate`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				description: "Lifecycle rotated cert",
				revoke_previous: false,
			},
		});
		expect(rotateRes.status).toBe(200);
		const rotated = await rotateRes.json<{ id: string }>();
		expect(rotated.id).not.toBe(renewedId);

		const listRes = await testRequest("/api/certificate", {
			token: seed.masterUser.token,
		});
		expect(listRes.status).toBe(200);
		const certs = await listRes.json<Array<{
			id: string;
			supersedes_certificate_id?: string | null;
		}>>();
		const replacement = certs.find((cert) => cert.id === rotated.id);
		expect(replacement?.supersedes_certificate_id).toBe(renewedId);
	});
});
