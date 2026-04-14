import { expect, test } from "../../fixtures/test";

test.describe("feature: teams", () => {
	test("creates, edits, and deletes a team", async ({ page, makeName }) => {
		const teamName = makeName("UI_TEAM");
		const updatedName = makeName("UI_TEAM_EDITED");

		await page.goto("/teams", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Teams" }).first()).toBeVisible();

		await page.getByRole("button", { name: "New Team" }).click();
		let dialog = page.getByRole("dialog");
		await dialog.locator("input").first().fill(teamName);
		await dialog.locator("textarea").first().fill("Created by UI feature test");
		await dialog.getByRole("button", { name: "Save" }).click();

		const row = page.locator("tr").filter({ hasText: teamName }).first();
		await expect(row).toBeVisible();
		await row.click();

		await page.getByRole("button", { name: "Edit" }).click();
		dialog = page.getByRole("dialog");
		await dialog.locator("input").first().fill(updatedName);
		await dialog.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("tr").filter({ hasText: updatedName }).first()).toBeVisible();

		await page.getByRole("button", { name: "Delete" }).click();
		await expect(page.locator("tr").filter({ hasText: updatedName })).toHaveCount(0);
	});
});
