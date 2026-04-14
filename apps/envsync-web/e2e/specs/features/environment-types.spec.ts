import { expect, test } from "../../fixtures/test";
import {
	createEnvironmentType,
	createProject,
	deleteEnvironmentType,
	setEnvironmentProtected,
} from "../../helpers/project-flows";

test.describe("feature: environment types", () => {
	test("creates a custom environment type and toggles protection on production", async ({ page, makeName }) => {
		const project = await createProject(page, makeName("UI_FEATURE_ENV_APP"));
		const envName = makeName("Sandbox");

		await createEnvironmentType(page, project.appId, envName);
		await setEnvironmentProtected(page, project.appId, "Production", true);
		await deleteEnvironmentType(page, project.appId, envName);

		await page.goto(`/applications/${project.appId}/manage-environments`, { waitUntil: "domcontentloaded" });
		await expect(page.getByText("Production").first()).toBeVisible();
	});
});

