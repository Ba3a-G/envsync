import { expect, test } from "../../fixtures/test";
import { expectLocatorMissing } from "../../helpers/permissions";

test.describe("permissions: viewer restrictions", () => {
	test("viewer cannot access management actions", async ({ roleFactory }) => {
		const context = await roleFactory("viewer");
		const page = await context.newPage();
		try {
			await page.goto("/teams", { waitUntil: "domcontentloaded" });
			await expect(page.getByRole("heading", { name: "Teams" }).first()).toBeVisible();
			await expectLocatorMissing(page.getByRole("button", { name: "New Team" }));

			await page.goto("/users", { waitUntil: "domcontentloaded" });
			await expect(page.getByRole("heading", { name: "Team" }).first()).toBeVisible();
			await expectLocatorMissing(page.getByRole("button", { name: "Invite Member" }));

		} finally {
			await context.close();
		}
	});
});
