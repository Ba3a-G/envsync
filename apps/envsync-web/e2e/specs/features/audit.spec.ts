import { expect, test } from "../../fixtures/test";

test.describe("feature: audit", () => {
	test("loads activity log and filters by search", async ({ page, makeName }) => {
		await page.goto("/audit", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Activity" }).first()).toBeVisible();

		const searchInput = page.getByPlaceholder("Search audit logs...");
		await searchInput.fill(makeName("UI_AUDIT_SEARCH"));
		await expect(searchInput).toHaveValue(/UI_AUDIT_SEARCH/);

		const filterCombo = page.getByRole("combobox").first();
		await filterCombo.click();
		await page.getByRole("option").first().click();
	});
});
