import { expect, test } from "../../fixtures/test";
import { waitForTrackedResponse } from "../../helpers/network";

test.describe("feature: certificates", () => {
	test("opens issue/revoke certificate flows", async ({ page }) => {
		await page.goto("/certificates", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "Certificates" }).first()).toBeVisible();

		const issueButton = page.getByRole("button", { name: /Issue Certificate/i }).first();
		if (await issueButton.isVisible().catch(() => false)) {
			await issueButton.click();
			const issueDialog = page.getByRole("dialog");
			await expect(issueDialog.getByRole("heading", { name: "Issue Member Certificate" })).toBeVisible();
			await issueDialog.locator("input[list='certificate-user-emails']").fill("editor-ui@envsync.local");

			const issueResponse = waitForTrackedResponse(page, {
				method: "POST",
				pathFragment: "/api/certificate/issue",
				expectedStatus: 201,
			});
			await issueDialog.getByRole("button", { name: /^Issue$/i }).click();
			await issueResponse;
			await expect(page.getByText(/(Member )?certificate issued successfully/i).first()).toBeVisible();
			await page.keyboard.press("Escape");
		}

		const revokeButton = page.getByTitle("Revoke").first();
		if (await revokeButton.isVisible().catch(() => false)) {
			await revokeButton.click();
			const revokeDialog = page.getByRole("dialog");
			await expect(revokeDialog.getByRole("heading", { name: "Revoke Certificate" })).toBeVisible();
			await revokeDialog.getByRole("button", { name: /^Revoke$/i }).click();
		}
	});
});
