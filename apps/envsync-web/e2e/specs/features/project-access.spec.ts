import { expect, test } from "../../fixtures/test";
import { createProject } from "../../helpers/project-flows";

test.describe("feature: project access", () => {
	test("grants and revokes team access on a project", async ({ page, makeName }) => {
		const project = await createProject(page, makeName("UI_ACCESS_APP"));
		const teamName = makeName("UI_ACCESS_TEAM");

		await page.goto("/teams", { waitUntil: "domcontentloaded" });
		await page.getByRole("button", { name: "New Team" }).click();
		const teamDialog = page.getByRole("dialog");
		await teamDialog.locator("input").first().fill(teamName);
		await teamDialog.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("tr").filter({ hasText: teamName }).first()).toBeVisible();

		await page.goto(`/applications/${project.appId}/access`, { waitUntil: "domcontentloaded" });
		const combos = page.getByRole("combobox");
		await combos.nth(0).click();
		await page.getByRole("option", { name: "Team" }).click();
		await combos.nth(1).click();
		await page.getByRole("option", { name: teamName }).click();
		await combos.nth(2).click();
		await page.getByRole("option", { name: "Editor" }).click();
		await page.getByRole("button", { name: /Grant access/i }).click();

		const grantRow = page.locator("tr").filter({ hasText: teamName }).first();
		await expect(grantRow).toBeVisible();
		await grantRow.getByRole("button", { name: "Revoke" }).click();
		await expect(page.locator("tr").filter({ hasText: teamName })).toHaveCount(0);
	});
});
