/**
 * Keycloak bootstrap and token helpers for E2E tests.
 */

async function getAdminToken(url: string, username: string, password: string): Promise<string> {
	const base = url.replace(/\/$/, "");
	const res = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "password",
			client_id: "admin-cli",
			username,
			password,
		}),
	});
	if (!res.ok) {
		throw new Error(`Failed to get Keycloak admin token: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

function adminHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
}

export interface BootstrapResult {
	clientId: string;
	clientSecret: string;
}

export async function bootstrapKeycloakClient(
	url: string,
	realm: string,
	adminUser: string,
	adminPassword: string,
): Promise<BootstrapResult> {
	const base = url.replace(/\/$/, "");
	const token = await getAdminToken(base, adminUser, adminPassword);
	const clientId = `envsync-e2e-${Date.now()}`;

	const createRes = await fetch(`${base}/admin/realms/${realm}/clients`, {
		method: "POST",
		headers: adminHeaders(token),
		body: JSON.stringify({
			clientId,
			name: "EnvSync E2E",
			protocol: "openid-connect",
			publicClient: false,
			secret: crypto.randomUUID(),
			standardFlowEnabled: true,
			directAccessGrantsEnabled: true,
			serviceAccountsEnabled: false,
			redirectUris: ["http://api.lvh.me:4000/api/access/api/callback"],
			webOrigins: ["*"],
			defaultClientScopes: ["basic", "profile", "email", "roles"],
		}),
	});

	if (!createRes.ok && createRes.status !== 201) {
		throw new Error(`Failed to create Keycloak E2E client: ${createRes.status} ${await createRes.text()}`);
	}

	const listRes = await fetch(`${base}/admin/realms/${realm}/clients?clientId=${encodeURIComponent(clientId)}`, {
		headers: adminHeaders(token),
	});
	if (!listRes.ok) {
		throw new Error(`Failed to look up Keycloak E2E client: ${listRes.status} ${await listRes.text()}`);
	}
	const clients = (await listRes.json()) as Array<{ id: string }>;
	const internalId = clients[0]?.id;
	if (!internalId) throw new Error("Created Keycloak E2E client but could not resolve internal id");

	const secretRes = await fetch(`${base}/admin/realms/${realm}/clients/${internalId}/client-secret`, {
		headers: adminHeaders(token),
	});
	if (!secretRes.ok) {
		throw new Error(`Failed to fetch Keycloak E2E client secret: ${secretRes.status} ${await secretRes.text()}`);
	}
	const secretData = (await secretRes.json()) as { value: string };

	return {
		clientId,
		clientSecret: secretData.value,
	};
}

export interface TestUserResult {
	keycloakUserId: string;
	email: string;
	password: string;
}

export async function createKeycloakTestUser(
	url: string,
	realm: string,
	adminUser: string,
	adminPassword: string,
	opts: { email: string; firstName: string; lastName: string; password: string },
): Promise<TestUserResult> {
	const base = url.replace(/\/$/, "");
	const token = await getAdminToken(base, adminUser, adminPassword);
	const res = await fetch(`${base}/admin/realms/${realm}/users`, {
		method: "POST",
		headers: adminHeaders(token),
		body: JSON.stringify({
			username: opts.email,
			email: opts.email,
			emailVerified: true,
			enabled: true,
			firstName: opts.firstName,
			lastName: opts.lastName,
			credentials: [
				{
					type: "password",
					value: opts.password,
					temporary: false,
				},
			],
		}),
	});
	if (!res.ok && res.status !== 201) {
		throw new Error(`Failed to create Keycloak test user: ${res.status} ${await res.text()}`);
	}
	const lookup = await fetch(`${base}/admin/realms/${realm}/users?username=${encodeURIComponent(opts.email)}&exact=true`, {
		headers: adminHeaders(token),
	});
	if (!lookup.ok) {
		throw new Error(`Failed to look up Keycloak test user: ${lookup.status} ${await lookup.text()}`);
	}
	const users = (await lookup.json()) as Array<{ id: string }>;
	const user = users[0];
	if (!user?.id) throw new Error("Created Keycloak test user but could not resolve id");
	return {
		keycloakUserId: user.id,
		email: opts.email,
		password: opts.password,
	};
}

export async function getKeycloakAccessToken(
	url: string,
	realm: string,
	clientId: string,
	clientSecret: string,
	loginName: string,
	password: string,
): Promise<string> {
	const base = url.replace(/\/$/, "");
	const res = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "password",
			client_id: clientId,
			client_secret: clientSecret,
			username: loginName,
			password,
			scope: "openid profile email",
		}),
	});
	if (!res.ok) {
		throw new Error(`Failed to get Keycloak access token: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}
