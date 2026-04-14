import { expect, type Page } from "@playwright/test";

export async function gotoPit(page: Page, appId: string, envName = "production") {
	await page.goto(`/applications/pit/${appId}?env=${encodeURIComponent(envName.toLowerCase())}`, {
		waitUntil: "domcontentloaded",
	});
	await expect(page.getByText("Point-in-Time History")).toBeVisible();
}

export async function expectPitHistory(page: Page) {
	await expect(page.locator("code").filter({ hasText: /.+/ }).first()).toBeVisible();
}

export async function compareFirstTwoPits(page: Page) {
	await page.getByRole("button", { name: "Compare Changes" }).first().click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Compare Point-in-Time Snapshots")).toBeVisible();

	const triggers = dialog.getByRole("combobox");
	const triggerCount = await triggers.count();
	if (triggerCount < 2) {
		throw new Error("PiT compare dialog did not render both PIT selectors");
	}

	await triggers.nth(1).click();
	const options = page.locator('[role="option"]');
	if (await options.count() === 0) {
		throw new Error("PiT compare dialog did not render any PIT options");
	}
	await options.first().click();
	await dialog.getByRole("button", { name: "Compare PITs" }).click();
	await expect(dialog.getByText(/Change Summary|No changes found|Added Variables/i)).toBeVisible();
}

export async function rollbackCurrentPit(page: Page) {
	page.once("dialog", dialog => dialog.accept());
	const primaryRollback = page.getByRole("button", { name: /Rollback to this PIT/i }).first();
	if (await primaryRollback.isVisible().catch(() => false)) {
		await primaryRollback.click();
		await page.waitForTimeout(1000);
		return true;
	}

	const rowActions = page.locator("button").filter({ has: page.locator("svg.lucide-more-vertical") }).first();
	if (await rowActions.isVisible().catch(() => false)) {
		await rowActions.click();
		await page.getByRole("menuitem", { name: /Rollback to this PIT/i }).first().click();
		await page.waitForTimeout(1000);
		return true;
	}

	return false;
}
