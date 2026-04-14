import { expect, type Page } from "@playwright/test";

export async function gotoAudit(page: Page) {
	await page.goto("/audit", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: "Activity" }).first()).toBeVisible();
}

export async function searchAudit(page: Page, term: string) {
	await gotoAudit(page);
	await page.getByPlaceholder("Search audit logs...").fill(term);
	await page.waitForTimeout(750);
}

export async function expectAuditEntry(page: Page, term: string | RegExp) {
	await expect(page.getByText(term, { exact: false }).first()).toBeVisible();
}
