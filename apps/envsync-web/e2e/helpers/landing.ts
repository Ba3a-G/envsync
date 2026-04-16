import { expect, type Page } from "@playwright/test";

import { getUiHarnessConfig } from "./config";

export async function gotoLanding(page: Page, path = "/") {
	const { landingUrl } = getUiHarnessConfig();
	await page.goto(new URL(path, landingUrl).toString(), { waitUntil: "domcontentloaded" });
}

export async function submitLandingOrgInvite(page: Page, email: string) {
	await gotoLanding(page, "/onboarding");
	await expect(page.getByRole("heading", { name: "Start your EnvSync journey" })).toBeVisible();
	await page.locator("#email").fill(email);
	const formSubmit = page.locator("#onboarding-form").getByRole("button", { name: /Get Started/i });
	if (await formSubmit.isVisible().catch(() => false)) {
		await formSubmit.click();
	} else {
		await page.getByRole("button", { name: /Get Started/i }).last().click();
	}
	await expect(page.getByText("Welcome to EnvSync!")).toBeVisible();
}

export async function acceptOrgInvite(
	page: Page,
	inviteUrl: string,
	input: {
		orgName: string;
		companySize: string;
		website: string;
		fullName: string;
		password: string;
	},
) {
	await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: "Complete Organization Setup" })).toBeVisible();
	await page.locator("#orgName").fill(input.orgName);
	await page.getByRole("combobox").first().click();
	await page.getByRole("option", { name: input.companySize }).click();
	await page.locator("#website").fill(input.website);
	await page.locator("#fullName").fill(input.fullName);
	await page.locator("#password").fill(input.password);
	await page.getByRole("button", { name: "Complete Setup" }).click();
	await expect(page.getByText("Welcome to EnvSync!")).toBeVisible();
	await expect(page.getByText("system-generated EnvSync certificates", { exact: false })).toBeVisible();
}

export async function acceptUserInvite(
	page: Page,
	inviteUrl: string,
	input: {
		fullName: string;
		password: string;
	},
) {
	await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: "Join the Team" })).toBeVisible();
	await page.locator("#fullName").fill(input.fullName);
	await page.locator("#password").fill(input.password);
	await page.getByRole("button", { name: "Join Organization" }).click();
	await expect(page.getByText("Welcome to the Team!")).toBeVisible();
	await expect(page.getByText("system-generated EnvSync certificates", { exact: false })).toBeVisible();
}

export async function clickStartWorking(page: Page) {
	const candidates = [
		page.getByRole("button", { name: /Start Working/i }),
		page.getByRole("button", { name: /Get Started/i }),
	];

	for (const button of candidates) {
		if (await button.isVisible().catch(() => false)) {
			await button.click();
			return;
		}
	}

	throw new Error("Unable to find start button on onboarding success screen");
}
