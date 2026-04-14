import { test, expect } from "../../fixtures/test";
import { waitForTrackedResponse } from "../../helpers/network";

test.describe("admin surfaces", () => {
	test("creates an API key", async ({ page, makeName }) => {
		await page.goto("/apikeys", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "API Keys" }).first()).toBeVisible();

		await page.getByRole("button", { name: "Create API Key" }).click();
		await page.locator("#description").fill(makeName("UI_REGRESSION_KEY"));

		const createResponse = waitForTrackedResponse(page, {
			method: "POST",
			pathFragment: "/api/api_key",
			expectedStatus: 201,
		});
		await page.getByRole("button", { name: /Create|Creating/i }).last().click();
		await createResponse;
		await expect(page.getByRole("heading", { name: "API Key Created" }).first()).toBeVisible();
		await page.getByRole("button", { name: "Close" }).first().click();
	});

	test("opens certificate issue and revoke surfaces", async ({ page }) => {
		await page.goto("/certificates", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Certificates" }).first()).toBeVisible();

		await page.getByRole("button", { name: /Issue Certificate/i }).click();
		await expect(page.getByRole("heading", { name: "Issue Member Certificate" }).first()).toBeVisible();
		await page.keyboard.press("Escape");

		const revokeButton = page.getByTitle("Revoke").first();
		if (await revokeButton.isVisible().catch(() => false)) {
			await revokeButton.click();
			await expect(page.getByRole("heading", { name: "Revoke Certificate" }).first()).toBeVisible();
			await page.keyboard.press("Escape");
		}
	});

	test("covers teams and users management surfaces", async ({ page }) => {
		await page.goto("/teams", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Teams" }).first()).toBeVisible();
		await page.getByRole("button", { name: "New Team" }).click();
		await expect(page.getByRole("heading", { name: /Create Team|Edit Team/i }).first()).toBeVisible();
		await page.keyboard.press("Escape");

		await page.goto("/users", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("button", { name: "Invite Member" })).toBeVisible();
		await page.getByRole("button", { name: "Invite Member" }).click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
	});
});
