import type { Page, Response } from "@playwright/test";

export type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [key: string]: JsonValue };

export interface TrackedResponse {
	response: Response;
	requestBody: JsonValue | null;
	responseBody: JsonValue | null;
}

type ExpectedBodyMatch = Record<string, JsonValue> | undefined;

function parseJsonBody(rawBody: string | null): JsonValue | null {
	if (!rawBody) {
		return null;
	}

	try {
		return JSON.parse(rawBody) as JsonValue;
	} catch {
		return null;
	}
}

function stringifyBody(body: JsonValue | null): string {
	if (body === null) {
		return "null";
	}

	try {
		return JSON.stringify(body);
	} catch {
		return String(body);
	}
}

function valueMatch(actual: JsonValue | null, expected: JsonValue): boolean {
	if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
		return actual === expected;
	}

	if (typeof actual !== "object" || actual === null || Array.isArray(actual)) {
		return false;
	}

	for (const [key, expectedValue] of Object.entries(expected)) {
		const actualValue = (actual as Record<string, JsonValue>)[key];
		if (!deepEqual(actualValue, expectedValue)) {
			return false;
		}
	}

	return true;
}

function deepEqual(a: JsonValue, b: JsonValue): boolean {
	if (a === b) {
		return true;
	}

	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
		return false;
	}

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
			return false;
		}

		for (let index = 0; index < a.length; index += 1) {
			if (!deepEqual(a[index], b[index])) {
				return false;
			}
		}

		return true;
	}

	const left = a as Record<string, JsonValue>;
	const right = b as Record<string, JsonValue>;
	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

	for (const key of keys) {
		if (!deepEqual(left[key], right[key])) {
			return false;
		}
	}

	return true;
}

export async function waitForTrackedResponse(
	page: Page,
	options: {
		method: string;
		pathFragment: string;
		expectedStatus: number | number[];
		expectedRequestBody?: ExpectedBodyMatch;
		expectedResponseBody?: ExpectedBodyMatch;
		failOnUnexpectedStatus?: boolean;
		timeoutMs?: number;
	},
	): Promise<TrackedResponse> {
	const timeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30_000;
	const startAt = Date.now();
	const method = options.method.toUpperCase();
	const strictStatus = options.failOnUnexpectedStatus ?? false;
	const expectedStatuses = Array.isArray(options.expectedStatus)
		? options.expectedStatus
		: [options.expectedStatus];
	let lastMismatchedResponse: TrackedResponse | null = null;

	while (Date.now() - startAt < timeout) {
		const remaining = timeout - (Date.now() - startAt);
		const response = await page.waitForResponse((candidate) => {
			if (candidate.request().method() !== method) {
				return false;
			}

			if (!candidate.url().includes(options.pathFragment)) {
				return false;
			}

			const requestBody = parseJsonBody(candidate.request().postData());
			if (options.expectedRequestBody && !valueMatch(requestBody, options.expectedRequestBody)) {
				return false;
			}

			return true;
		}, { timeout: remaining }).catch(() => null);

		if (!response) {
			continue;
		}

		const requestBody = parseJsonBody(response.request().postData());
		let responseBody: JsonValue | null = null;
		try {
			responseBody = await response.json() as JsonValue;
		} catch {
			responseBody = null;
		}

		if (!expectedStatuses.includes(response.status())) {
			lastMismatchedResponse = {
				response,
				requestBody,
				responseBody,
			};
			if (strictStatus) {
				throw new Error(
					`Tracked response ${options.method} ${options.pathFragment} returned ${response.status()} instead of ${expectedStatuses.join(" or ")} ` +
					`for ${response.url()} request=${stringifyBody(requestBody)} response=${stringifyBody(responseBody)}`,
				);
			}
			continue;
		}

		if (options.expectedResponseBody && !valueMatch(responseBody, options.expectedResponseBody)) {
			continue;
		}

		return { response, requestBody, responseBody } satisfies TrackedResponse;
	}

	if (lastMismatchedResponse) {
		throw new Error(
			`Timed out waiting for tracked response ${options.method} ${options.pathFragment} (${expectedStatuses.join(" or ")}); ` +
			`last seen ${lastMismatchedResponse.response.status()} for ${lastMismatchedResponse.response.url()} ` +
			`request=${stringifyBody(lastMismatchedResponse.requestBody)} ` +
			`response=${stringifyBody(lastMismatchedResponse.responseBody)}`,
		);
	}

	throw new Error(`Timed out waiting for tracked response ${options.method} ${options.pathFragment} (${expectedStatuses.join(" or ")})`);
}
