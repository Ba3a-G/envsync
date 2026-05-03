/**
 * Test request wrapper — uses Hono's app.request() for in-process testing.
 *
 * Import the app lazily so Bun's preload can populate process.env before the
 * application's config module parses it.
 */

export interface TestRequestOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: unknown;
	token?: string;
	apiKey?: string;
	query?: Record<string, string>;
	surface?: "core" | "management";
}

export interface TestResponse {
	status: number;
	json: <T = any>() => Promise<T>;
	text: () => Promise<string>;
	headers: Headers;
	raw: Response;
}

export async function testRequest(
	path: string,
	options: TestRequestOptions = {},
): Promise<TestResponse> {
	if (process.env.TEST_MODE === "e2e") {
		const { ensureE2EEnv } = await import("../e2e/helpers/bootstrap-env");
		ensureE2EEnv();
	}
	const { surface = "core", method = "GET", headers = {}, body, token, apiKey, query } = options;
	const app = surface === "management"
		? (await import("@/app/management")).managementApp
		: (await import("@/app")).app;

	const reqHeaders: Record<string, string> = { ...headers };
	if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
	if (apiKey) reqHeaders["X-API-Key"] = apiKey;
	if (body && !reqHeaders["Content-Type"]) reqHeaders["Content-Type"] = "application/json";

	let url = `http://localhost${path}`;
	if (query) {
		const qs = new URLSearchParams(query).toString();
		url += `?${qs}`;
	}

	const res = await app.request(url, {
		method,
		headers: reqHeaders,
		body: body ? JSON.stringify(body) : undefined,
	});

	return {
		status: res.status,
		json: <T = any>() => res.json() as Promise<T>,
		text: () => res.text(),
		headers: res.headers,
		raw: res,
	};
}
