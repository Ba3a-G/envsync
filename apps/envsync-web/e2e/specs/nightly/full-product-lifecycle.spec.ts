import { expect, test } from "../../fixtures/test";
import { getAppByName } from "../../helpers/app-data";

test.describe("nightly: full product lifecycle", () => {
	test("visits all top-level product surfaces in one authenticated session", async ({ page }) => {
		const seeded = await getAppByName(page, "Core Platform");
		expect(seeded).toBeTruthy();

		const routes = [
			"/dashboard",
			"/applications",
			"/applications/create",
			`/applications/${seeded!.id}`,
			`/applications/${seeded!.id}/secrets`,
			`/applications/${seeded!.id}/manage-environments`,
			`/applications/${seeded!.id}/access`,
			`/applications/pit/${seeded!.id}`,
			"/roles",
			"/users",
			"/teams",
			"/change-requests",
			"/apikeys",
			"/webhooks",
			"/gpgkeys",
			"/certificates",
			"/audit",
			"/settings",
			"/organisation",
		];

		for (const route of routes) {
			await page.goto(route, { waitUntil: "domcontentloaded" });
			await expect(page.locator("h1").first()).toBeVisible();
		}
	});
});

