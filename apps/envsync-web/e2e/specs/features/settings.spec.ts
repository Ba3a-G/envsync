import { expect, test } from "../../fixtures/test";

test.describe("feature: settings", () => {
	test("loads account and organization settings", async ({ page }) => {
		await page.goto("/settings", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Account Settings" }).first()).toBeVisible();

		await page.goto("/organisation", { waitUntil: "domcontentloaded" });
		await expect(page.getByText(/Organization Settings|Organisation Settings/i)).toBeVisible();
	});
});

