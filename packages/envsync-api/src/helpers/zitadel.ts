import { config } from "@/utils/env";

const connectBase = () => (config.ZITADEL_CONNECT_URL ?? config.ZITADEL_URL).replace(/\/$/, "");
const mgmt = () => `${base()}/management/v1`;
const v2 = () => `${base()}/v2`;

export const getZitadelIssuer = () => (config.ZITADEL_EXTERNAL_URL ?? config.ZITADEL_URL).replace(/\/$/, "");
export const getZitadelConnectBase = () => connectBase();
export const getZitadelJwksUrl = () => `${connectBase()}/oauth/v2/keys`;

const base = () => connectBase();

export function getZitadelRequestHeaders(headers: Record<string, string> = {}): Record<string, string> {
	if (config.ZITADEL_REQUEST_HOST && !headers.Host && !headers.host) {
		return {
			...headers,
			Host: config.ZITADEL_REQUEST_HOST,
		};
	}
	return headers;
}

function getPat(): string {
	const pat = config.ZITADEL_PAT;
	if (!pat) {
		throw new Error("ZITADEL_PAT is required for Management API operations");
	}
	return pat;
}

async function mgmtFetch(path: string, options: RequestInit = {}) {
	const url = `${mgmt()}${path}`;
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${getPat()}`,
			"Content-Type": "application/json",
			...getZitadelRequestHeaders(options.headers as Record<string, string>),
		},
		signal: options.signal ?? AbortSignal.timeout(10_000),
	});
	return res;
}

/** User Service v2: same Bearer PAT, base path /v2 */
async function v2Fetch(path: string, options: RequestInit = {}) {
	const url = `${v2()}${path}`;
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${getPat()}`,
			"Content-Type": "application/json",
			...getZitadelRequestHeaders(options.headers as Record<string, string>),
		},
		signal: options.signal ?? AbortSignal.timeout(10_000),
	});
	return res;
}

export interface ZitadelUserCreate {
	userName: string;
	email: string;
	firstName: string;
	lastName: string;
	password: string;
}

/** Zitadel requires profile givenName/familyName to be 1–200 runes; never send empty. */
function ensureNonEmptyName(value: string, fallback: string): string {
	const s = String(value ?? "").trim();
	return s.length > 0 ? s.slice(0, 200) : fallback;
}

export async function createZitadelUser(payload: ZitadelUserCreate) {
	const givenName = ensureNonEmptyName(payload.firstName, "User");
	const familyName = ensureNonEmptyName(payload.lastName, "-");
	const body = {
		username: payload.userName,
		profile: {
			givenName,
			familyName,
		},
		email: {
			email: payload.email,
			isVerified: true,
		},
		password: {
			password: payload.password,
			changeRequired: false,
		},
	};
	const res = await v2Fetch("/users/human", {
		method: "POST",
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Zitadel create user failed: ${res.status} ${text}`);
	}
	const data = (await res.json()) as { userId: string };
	return { id: data.userId };
}

export async function updateZitadelUser(
	userId: string,
	payload: { firstName?: string; lastName?: string; email?: string },
) {
	const body: Record<string, unknown> = {};
	if (payload.firstName != null || payload.lastName != null) {
		body.profile = {
			givenName: ensureNonEmptyName(payload.firstName ?? "", "User"),
			familyName: ensureNonEmptyName(payload.lastName ?? "", "-"),
		};
	}
	if (payload.email != null) {
		body.email = { email: payload.email, isVerified: true };
	}
	if (Object.keys(body).length === 0) return;

	// Use User Service v2 for human updates.
	// The old Management v1 generic /users/{id} update endpoint is not available.
	const res = await v2Fetch(`/users/human/${userId}`, {
		method: "PUT",
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Zitadel update user failed: ${res.status} ${text}`);
	}
}

export async function deleteZitadelUser(userId: string) {
	const res = await mgmtFetch(`/users/${userId}`, { method: "DELETE" });
	if (!res.ok && res.status !== 404) {
		const text = await res.text();
		throw new Error(`Zitadel delete user failed: ${res.status} ${text}`);
	}
}

export async function sendZitadelPasswordReset(userId: string) {
	const res = await mgmtFetch(`/users/${userId}/password/_reset`, { method: "POST" });
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Zitadel password reset failed: ${res.status} ${text}`);
	}
}

/** Exchange authorization code for tokens */
export async function zitadelTokenExchange(
	code: string,
	redirectUri: string,
	clientId: string,
	clientSecret: string,
): Promise<{ id_token?: string; access_token: string }> {
	const res = await fetch(`${base()}/oauth/v2/token`, {
		method: "POST",
		headers: getZitadelRequestHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
			client_secret: clientSecret,
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Zitadel token exchange failed: ${res.status} ${text}`);
	}
	return (await res.json()) as { id_token?: string; access_token: string };
}
