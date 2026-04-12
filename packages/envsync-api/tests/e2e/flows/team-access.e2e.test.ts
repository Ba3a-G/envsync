import { beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import {
	checkServiceHealth,
	type E2ESeed,
	seedE2EOrg,
	seedE2EUser,
	setupE2EUserPermissions,
} from "../helpers/real-auth";

let seed: E2ESeed;
let teamId: string;
let appId: string;
let bothUser: { id: string; token: string; email: string };
let teamOnlyUser: { id: string; token: string; email: string };
let directOnlyUser: { id: string; token: string; email: string };

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();

	bothUser = await seedE2EUser(seed.org.id, seed.roles.viewer.id);
	teamOnlyUser = await seedE2EUser(seed.org.id, seed.roles.viewer.id);
	directOnlyUser = await seedE2EUser(seed.org.id, seed.roles.viewer.id);

	for (const user of [bothUser, teamOnlyUser, directOnlyUser]) {
		await setupE2EUserPermissions(user.id, seed.org.id, { can_view: true });
	}

	const teamRes = await testRequest("/api/team", {
		method: "POST",
		token: seed.masterUser.token,
		body: {
			name: "E2E Platform Team",
			description: "Inherited access tests",
			color: "#1ED38A",
		},
	});
	expect(teamRes.status).toBe(201);
	teamId = (await teamRes.json<{ id: string }>()).id;

	for (const user of [bothUser, teamOnlyUser]) {
		const addMemberRes = await testRequest(`/api/team/${teamId}/members`, {
			method: "POST",
			token: seed.masterUser.token,
			body: { user_id: user.id },
		});
		expect(addMemberRes.status).toBe(201);
	}

	const assignRoleRes = await testRequest(`/api/team/${teamId}/assign-role`, {
		method: "POST",
		token: seed.masterUser.token,
		body: { role_id: seed.roles.developer.id },
	});
	expect(assignRoleRes.status).toBe(200);

	const appRes = await testRequest("/api/app", {
		method: "POST",
		token: seed.masterUser.token,
		body: { name: "E2E Access App", description: "Direct + team app access tests" },
	});
	expect(appRes.status).toBe(201);
	appId = (await appRes.json<{ id: string }>()).id;
});

describe("Team Access E2E", () => {
	test("team role grants inherited org permissions to members", async () => {
		const teamPermsRes = await testRequest(`/api/team/${teamId}/effective-permissions`, {
			token: seed.masterUser.token,
		});
		expect(teamPermsRes.status).toBe(200);
		const teamPerms = await teamPermsRes.json<{ can_view: boolean; can_edit: boolean }>();
		expect(teamPerms.can_view).toBe(true);
		expect(teamPerms.can_edit).toBe(true);

		const memberPermsRes = await testRequest("/api/permission/me", {
			token: bothUser.token,
		});
		expect(memberPermsRes.status).toBe(200);
		const memberPerms = await memberPermsRes.json<{ can_view: boolean; can_edit: boolean }>();
		expect(memberPerms.can_view).toBe(true);
		expect(memberPerms.can_edit).toBe(true);
	});

	test("effective app access unions direct user grants and inherited team grants", async () => {
		const teamGrantRes = await testRequest(`/api/permission/app/${appId}/grant`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				subject_type: "team",
				subject_id: teamId,
				relation: "viewer",
			},
		});
		expect(teamGrantRes.status).toBe(200);

		const bothGrantRes = await testRequest(`/api/permission/app/${appId}/grant`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				subject_type: "user",
				subject_id: bothUser.id,
				relation: "admin",
			},
		});
		expect(bothGrantRes.status).toBe(200);

		const directGrantRes = await testRequest(`/api/permission/app/${appId}/grant`, {
			method: "POST",
			token: seed.masterUser.token,
			body: {
				subject_type: "user",
				subject_id: directOnlyUser.id,
				relation: "editor",
			},
		});
		expect(directGrantRes.status).toBe(200);

		const grantsRes = await testRequest(`/api/permission/app/${appId}/grants`, {
			token: seed.masterUser.token,
		});
		expect(grantsRes.status).toBe(200);
		const grants = await grantsRes.json<Array<{ subject_id: string; subject_type: string; relation: string }>>();
		expect(grants).toContainEqual({ subject_id: teamId, subject_type: "team", relation: "viewer" });
		expect(grants).toContainEqual({ subject_id: bothUser.id, subject_type: "user", relation: "admin" });
		expect(grants).toContainEqual({ subject_id: directOnlyUser.id, subject_type: "user", relation: "editor" });

		const effectiveRes = await testRequest(`/api/permission/app/${appId}/effective-access`, {
			token: seed.masterUser.token,
		});
		expect(effectiveRes.status).toBe(200);
		const effective = await effectiveRes.json<Array<{
			user_id: string;
			email: string;
			relation: "admin" | "editor" | "viewer" | null;
			source: "direct" | "team" | "both" | null;
			teams: string[];
		}>>();

		const bothEntry = effective.find((entry) => entry.user_id === bothUser.id);
		expect(bothEntry).toBeDefined();
		expect(bothEntry?.relation).toBe("admin");
		expect(bothEntry?.source).toBe("both");
		expect(bothEntry?.teams).toContain("E2E Platform Team");

		const teamOnlyEntry = effective.find((entry) => entry.user_id === teamOnlyUser.id);
		expect(teamOnlyEntry).toBeDefined();
		expect(teamOnlyEntry?.relation).toBe("viewer");
		expect(teamOnlyEntry?.source).toBe("team");
		expect(teamOnlyEntry?.teams).toContain("E2E Platform Team");

		const directOnlyEntry = effective.find((entry) => entry.user_id === directOnlyUser.id);
		expect(directOnlyEntry).toBeDefined();
		expect(directOnlyEntry?.relation).toBe("editor");
		expect(directOnlyEntry?.source).toBe("direct");
	});
});
