import { expect, type Locator, type Page } from "@playwright/test";

export async function expectActionUnavailable(page: Page, name: string | RegExp) {
	const target = page.getByRole("button", { name });
	const count = await target.count();
	if (count === 0) {
		return;
	}

	await expect(target.first()).toBeDisabled();
}

export async function expectTextNotVisible(page: Page, value: string | RegExp) {
	await expect(page.getByText(value).first()).toHaveCount(0);
}

export async function expectLocatorMissing(locator: Locator) {
	await expect(locator).toHaveCount(0);
}
