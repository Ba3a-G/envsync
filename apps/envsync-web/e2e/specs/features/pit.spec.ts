import { expect, test } from "../../fixtures/test";
import { compareFirstTwoPits, expectPitHistory, gotoPit, rollbackCurrentPit } from "../../helpers/pit";
import { createProject, createVariable, updateVariable } from "../../helpers/project-flows";

test.describe("feature: point in time", () => {
	test("creates PiT snapshots, compares them, and triggers rollback", async ({ page, makeName }) => {
		const project = await createProject(page, makeName("UI_FEATURE_PIT_APP"));
		const key = makeName("UI_FEATURE_PIT_VAR");
		const value = makeName("PIT_VALUE");

		await page.goto(`/applications/${project.appId}`, { waitUntil: "domcontentloaded" });
		const envTypeId = await createVariable(page, project.appId, "Development", key, value);
		await updateVariable(page, project.appId, envTypeId, key, `${value}_V2`);
		await updateVariable(page, project.appId, envTypeId, key, `${value}_V3`);

		await gotoPit(page, project.appId, "development");
		await expectPitHistory(page);
		await compareFirstTwoPits(page);
		await rollbackCurrentPit(page);

		await page.goto(`/applications/${project.appId}`, { waitUntil: "domcontentloaded" });
		await expect(page.locator("tr").filter({ hasText: key }).first()).toBeVisible();
	});
});

