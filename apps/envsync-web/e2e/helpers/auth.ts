import { existsSync, mkdirSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";

import { getStorageStatePath, getUiHarnessConfig, type RoleCredential, type UiRole, VIEWPORT } from "./config";

export interface AuthCredential {
	email: string;
	password: string;
}

function ensureParentDir(filePath: string) {
	mkdirSync(filePath.replace(/\/[^/]+$/, ""), { recursive: true });
}

export async function waitForService(url: string, label: string) {
	const startedAt = Date.now();
	const timeoutMs = 60_000;

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url, { redirect: "manual" });
			if (response.ok || response.status < 500) {
				return;
			}
		} catch {
			// Service still starting.
		}

		await Bun.sleep(1_000);
	}

	throw new Error(`${label} did not become reachable at ${url} within ${timeoutMs}ms`);
}

export async function waitForUiServices() {
	const config = getUiHarnessConfig();
	await waitForService(`${config.apiBaseUrl}/api/health`, "API");
	await waitForService(config.baseUrl, "Web app");
}

export async function isAuthenticated(page: Page) {
	const { apiBaseUrl } = getUiHarnessConfig();
	try {
		return await page.evaluate(async currentApiBaseUrl => {
			try {
				const response = await fetch(`${currentApiBaseUrl}/api/auth/me`, {
					credentials: "include",
				});
				return response.ok;
			} catch {
				return false;
			}
		}, apiBaseUrl);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("Execution context was destroyed") || message.includes("Target page, context or browser has been closed")) {
			return false;
		}
		throw error;
	}
}

async function attemptLocalAutologin(page: Page, role: UiRole) {
	const config = getUiHarnessConfig();
	return attemptLocalAutologinWithCredential(page, config.roleCredentials[role]);
}

async function attemptLocalAutologinWithCredential(page: Page, credential: AuthCredential) {
	const config = getUiHarnessConfig();
	if (!config.allowLocalAutologin) {
		return false;
	}

	let currentUrl = "";
	try {
		currentUrl = page.url();
	} catch {
		return false;
	}

	if (!currentUrl) {
		return false;
	}

	const isLocalKeycloakPage = new URL(currentUrl).origin === new URL(config.authUrl).origin;
	if (!isLocalKeycloakPage) {
		return false;
	}

	const username = page.locator("#username");
	const password = page.locator("#password");
	const submit = page.locator("#kc-login");
	if (!await username.isVisible().catch(() => false)) {
		return false;
	}

	await username.fill(credential.email);
	await password.fill(credential.password);
	await Promise.all([
		page.waitForLoadState("domcontentloaded"),
		submit.click(),
	]);
	return true;
}

async function saveStorageState(context: BrowserContext, role: UiRole) {
	const storageStatePath = getStorageStatePath(role);
	ensureParentDir(storageStatePath);
	await context.storageState({ path: storageStatePath });
	return storageStatePath;
}

async function ensureFreshCredentialContext(
	browser: Browser,
	storageKey: string,
	credential: AuthCredential,
) {
	const config = getUiHarnessConfig();
	const context = await browser.newContext({ viewport: VIEWPORT });
	const page = await context.newPage();
	page.setDefaultTimeout(config.actionTimeoutMs);
	await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });

	const startedAt = Date.now();
	while (Date.now() - startedAt < config.loginTimeoutMs) {
		if (await isAuthenticated(page)) {
			await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			await saveStorageState(context, storageKey);
			return { context, page };
		}

		await attemptLocalAutologinWithCredential(page, credential);
		await page.waitForTimeout(1_000);
	}

	throw new Error(`Timed out waiting for login for ${credential.email} after ${config.loginTimeoutMs}ms`);
}

async function ensureFreshRoleContext(browser: Browser, role: UiRole) {
	const config = getUiHarnessConfig();
	return ensureFreshCredentialContext(browser, role, config.roleCredentials[role]);
}

export async function ensureRoleStorageState(role: UiRole) {
	const config = getUiHarnessConfig();
	return ensureCredentialStorageState(role, config.roleCredentials[role]);
}

export async function ensureCredentialStorageState(storageKey: string, credential: AuthCredential) {
	const config = getUiHarnessConfig();
	const storageStatePath = getStorageStatePath(storageKey);
	let browser: Browser | null = null;

	try {
		browser = await chromium.launch({
			headless: config.headless,
			slowMo: config.slowMoMs > 0 ? config.slowMoMs : undefined,
		});

		if (!config.freshLogin && existsSync(storageStatePath)) {
			const context = await browser.newContext({
				storageState: storageStatePath,
				viewport: VIEWPORT,
			});
			const page = await context.newPage();
			page.setDefaultTimeout(config.actionTimeoutMs);
			await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			if (await isAuthenticated(page)) {
				await context.close();
				return storageStatePath;
			}
			await context.close();
		}

		const { context } = await ensureFreshCredentialContext(browser, storageKey, credential);
		await context.close();
		return storageStatePath;
	} finally {
		if (browser && !config.keepOpen) {
			await browser.close();
		}
	}
}

export async function ensureRoleStorageStates(roles: UiRole[]) {
	for (const role of roles) {
		await ensureRoleStorageState(role);
	}
}

export async function createRoleContext(browser: Browser, role: UiRole) {
	return createStoredContext(browser, role);
}

export async function createStoredContext(browser: Browser, storageKey: string) {
	return browser.newContext({
		storageState: getStorageStatePath(storageKey),
		viewport: VIEWPORT,
	});
}

export async function ensureAuthenticatedPage(page: Page, role: UiRole = "master") {
	const config = getUiHarnessConfig();
	await ensureAuthenticatedPageWithCredential(page, role, config.roleCredentials[role]);
}

export async function ensureAuthenticatedPageWithCredential(
	page: Page,
	storageKey: string,
	credential: AuthCredential,
) {
	const config = getUiHarnessConfig();
	page.setDefaultTimeout(config.actionTimeoutMs);
	await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
	if (await isAuthenticated(page)) {
		return;
	}

	const startedAt = Date.now();
	while (Date.now() - startedAt < config.loginTimeoutMs) {
		if (await isAuthenticated(page)) {
			await saveStorageState(page.context(), storageKey);
			return;
		}
		await attemptLocalAutologinWithCredential(page, credential);
		await page.waitForTimeout(1_000);
	}

	throw new Error("Authenticated Playwright session is missing and local auto-login could not restore it.");
}

export function getSeededCredential(role: UiRole): RoleCredential {
	return getUiHarnessConfig().roleCredentials[role];
}
