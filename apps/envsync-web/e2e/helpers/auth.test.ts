import { describe, expect, test } from "bun:test";

import { getSessionCookieInspectionUrls, hasAccessTokenCookie, hasCsrfCookie } from "./auth";

describe("auth helper cookie detection", () => {
	test("inspects the API auth path so /api-scoped cookies are visible", () => {
		expect(
			getSessionCookieInspectionUrls("http://app.lvh.me:8001", "http://api.lvh.me:4000"),
		).toEqual([
			"http://app.lvh.me:8001",
			"http://api.lvh.me:4000/api/auth/me",
		]);
	});

	test("detects the API access token only when it matches the API host and /api path", () => {
		expect(
			hasAccessTokenCookie(
				[{ name: "access_token", domain: "api.lvh.me", path: "/api" }],
				"http://api.lvh.me:4000",
			),
		).toBe(true);

		expect(
			hasAccessTokenCookie(
				[{ name: "access_token", domain: "api.lvh.me", path: "/" }],
				"http://api.lvh.me:4000",
			),
		).toBe(false);

		expect(
			hasAccessTokenCookie(
				[{ name: "access_token", domain: "app.lvh.me", path: "/api" }],
				"http://api.lvh.me:4000",
			),
		).toBe(false);
	});

	test("detects the shared-domain csrf cookie on the app host", () => {
		expect(
			hasCsrfCookie(
				[{ name: "envsync_csrf", domain: ".lvh.me", path: "/" }],
				"http://app.lvh.me:8001",
			),
		).toBe(true);
	});
});
