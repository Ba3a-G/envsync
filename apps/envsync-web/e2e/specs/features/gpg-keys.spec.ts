import { expect, test } from "../../fixtures/test";
import { waitForTrackedResponse } from "../../helpers/network";

test.describe("feature: gpg keys", () => {
	test("generates a key and opens sign/verify surfaces", async ({ page, makeName }) => {
		const keyName = makeName("UI_GPG");
		const email = `${makeName("ui-gpg").toLowerCase()}@envsync.local`;

		await page.goto("/gpgkeys", { waitUntil: "domcontentloaded" });
		await expect(page.getByRole("heading", { name: "GPG Keys" })).toBeVisible();

		await page.getByRole("button", { name: /Generate Key/i }).first().click();
		const dialog = page.getByRole("dialog");
		await dialog.getByPlaceholder("My Signing Key").fill(keyName);
		await dialog.getByPlaceholder("dev@example.com").fill(email);

		const createResponse = waitForTrackedResponse(page, {
			method: "PUT",
			pathFragment: "/api/gpg_key/generate",
			expectedStatus: 201,
		}).catch(() =>
			waitForTrackedResponse(page, {
				method: "PUT",
				pathFragment: "/api/gpg_key/generate",
				expectedStatus: 200,
			}),
		);
		await dialog.getByRole("button", { name: /^Generate$/i }).click();
		await createResponse;

		await expect(page.getByText(keyName).first()).toBeVisible();

		await page.getByRole("button", { name: /^Sign$/i }).first().click();
		await expect(page.getByRole("heading", { name: "Sign Data" })).toBeVisible();
		await page.keyboard.press("Escape");

		await page.getByRole("button", { name: /^Verify$/i }).first().click();
		await expect(page.getByRole("heading", { name: "Verify Signature" })).toBeVisible();
		await page.keyboard.press("Escape");
	});
});
