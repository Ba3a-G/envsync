import { expect, test } from "../../fixtures/test";
import { waitForTrackedResponse } from "../../helpers/network";
import { createProject, setEnvironmentProtected } from "../../helpers/project-flows";

test.describe("feature: change requests", () => {
	test("creates and cancels a direct protected change request", async ({ page, makeName }) => {
		const projectName = makeName("UI_FEATURE_CR_APP");
		const project = await createProject(page, projectName);
		await setEnvironmentProtected(page, project.appId, "Production", true);

		const title = makeName("UI_FEATURE_CR");
		const value = makeName("UI_FEATURE_CR_VALUE");

		await page.goto("/change-requests", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Change Requests" })).toBeVisible();

		const combos = page.getByRole("combobox");
		await combos.nth(1).click();
		await page.getByRole("option", { name: projectName }).first().click();
		await combos.nth(2).click();
		await page.getByRole("option", { name: /Production/i }).first().click();

		const createRequestCard = page.locator("div").filter({ hasText: "Create Request" }).first();
		await createRequestCard.locator("input").first().fill(title);
		await createRequestCard.locator("textarea").first().fill("Protected env update through CR.");
		await page.getByPlaceholder("DATABASE_URL").fill(makeName("UI_FEATURE_CR_KEY"));
		await page.getByPlaceholder("postgres://...").fill(value);

		const createResponse =
			waitForTrackedResponse(page, {
				method: "POST",
				pathFragment: "/api/change_request/direct",
				expectedStatus: 201,
			}).catch(() =>
				waitForTrackedResponse(page, {
					method: "POST",
					pathFragment: "/api/change_request/direct",
					expectedStatus: 200,
				}),
			);
		await page.getByRole("button", { name: "Submit request" }).click();
		await createResponse;

		const row = page.locator("tr").filter({ hasText: title }).first();
		await expect(row).toBeVisible();

		const cancelResponse = waitForTrackedResponse(page, {
			method: "POST",
			pathFragment: "/api/change_request/",
			expectedStatus: 200,
		});
		await row.getByRole("button", { name: /Cancel/i }).click();
		await cancelResponse;
	});
});
