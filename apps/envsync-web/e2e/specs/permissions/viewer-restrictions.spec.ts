import { expect, test } from "../../fixtures/test";
import { expectLocatorMissing } from "../../helpers/permissions";

test.describe("permissions: viewer restrictions", () => {
	test("viewer cannot access management actions", async ({ roleFactory }) => {
		const context = await roleFactory("viewer");
		const page = await context.newPage();
	try {
			await page.goto("/teams", { waitUntil: "domcontentloaded" });
			await expect(page.getByRole("heading", { name: "Teams" }).first()).toBeVisible();
			await expectLocatorMissing(page.getByTestId("teams-create"));

			await page.goto("/users", { waitUntil: "domcontentloaded" });
			await expect(page.getByRole("heading", { name: "Users" }).first()).toBeVisible();
			await expectLocatorMissing(page.getByTestId("users-invite-member"));

		} finally {
			await context.close();
		}
	});
});
