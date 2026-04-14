import { expect, test } from "../../fixtures/test";
import { waitForTrackedResponse } from "../../helpers/network";

test.describe("feature: users and invitations", () => {
	test("invites a member and manages pending invitation", async ({ page, makeName }) => {
		const email = `${makeName("ui-invite").toLowerCase()}@envsync.local`;

		await page.goto("/users", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("button", { name: "Invite Member" })).toBeVisible();

		await page.getByRole("button", { name: "Invite Member" }).click();
		const inviteDialog = page.getByRole("dialog");
		await inviteDialog.locator("#invite-email").fill(email);
		await inviteDialog.getByRole("combobox").click();
		await page.getByRole("option").first().click();

		const inviteResponse = waitForTrackedResponse(page, {
			method: "POST",
			pathFragment: "/api/onboarding/user",
			expectedStatus: 201,
		}).catch(() =>
			waitForTrackedResponse(page, {
				method: "POST",
				pathFragment: "/api/onboarding/user",
				expectedStatus: 200,
			}),
		);
		await inviteDialog.getByRole("button", { name: /Send Invitation/i }).click();
		await inviteResponse;
		if (await inviteDialog.isVisible().catch(() => false)) {
			await page.keyboard.press("Escape");
		}

		await page.getByRole("button", { name: "Manage Invitations" }).click();
		const modal = page.getByRole("dialog");
		await expect(modal.getByText("Manage Invitations")).toBeVisible();
		await expect(modal.getByText(email).first()).toBeVisible();
	});
});
