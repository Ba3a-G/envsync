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

function isOnOrigin(url: string, origin: string) {
	try {
		return new URL(url).origin === new URL(origin).origin;
	} catch {
		return false;
	}
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
	await waitForService(`${config.apiBaseUrl}/health`, "API");
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

function isOnAuthOrigin(page: Page) {
	const config = getUiHarnessConfig();
	try {
		const currentUrl = page.url();
		if (!currentUrl) {
			return false;
		}
		return new URL(currentUrl).origin === new URL(config.authUrl).origin;
	} catch {
		return false;
	}
}

function isOnCallbackUrl(page: Page) {
	const config = getUiHarnessConfig();
	try {
		const currentUrl = page.url();
		if (!currentUrl) {
			return false;
		}
		return currentUrl.startsWith(`${config.apiBaseUrl}/api/access/web/callback`)
			|| currentUrl.startsWith(`${config.baseUrl}/auth/callback`);
	} catch {
		return false;
	}
}

async function hasRequiredSessionCookies(context: BrowserContext) {
	const config = getUiHarnessConfig();
	const cookies = await context.cookies([config.baseUrl, config.apiBaseUrl]);
	const hasAccessToken = cookies.some(cookie => cookie.name === "access_token");
	const hasCsrfToken = cookies.some(cookie => cookie.name === "envsync_csrf");
	return hasAccessToken && hasCsrfToken;
}

async function isSessionReady(page: Page) {
	return await isAuthenticated(page) && await hasRequiredSessionCookies(page.context());
}

async function settleAuthenticatedPage(page: Page) {
	const config = getUiHarnessConfig();
	const deadline = Date.now() + 15_000;

	while (Date.now() < deadline) {
		if (await isSessionReady(page)) {
			const currentUrl = page.url();
			if (currentUrl && isOnOrigin(currentUrl, config.baseUrl) && !isOnCallbackUrl(page)) {
				return;
			}

			try {
				await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			} catch {
				// Continue retrying until redirect chain settles.
			}
		}

		await page.waitForTimeout(500);
	}
}

async function startWebLogin(page: Page) {
	const config = getUiHarnessConfig();
	const response = await page.goto(`${config.apiBaseUrl}/api/access/web`, { waitUntil: "commit" });
	if (!response) {
		throw new Error("Failed to create web login: missing navigation response");
	}
	if (!response.ok()) {
		throw new Error(`Failed to create web login: ${response.status()} ${await response.text()}`);
	}
	const payload = await response.json() as { loginUrl?: string };
	if (!payload.loginUrl) {
		throw new Error("Web login response did not include a loginUrl");
	}
	const loginUrl = payload.loginUrl;

	await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
}

async function startLocalDevSession(page: Page, credential: AuthCredential) {
	const config = getUiHarnessConfig();
	try {
		const params = new URLSearchParams({
			email: credential.email,
			password: credential.password,
		});
		const response = await page.goto(`${config.apiBaseUrl}/api/access/web/dev-session?${params.toString()}`, {
			waitUntil: "commit",
		});
		if (!response) {
			console.warn("[ui-login] dev session bootstrap returned no navigation response");
			return false;
		}
		const result = {
			ok: response.ok(),
			status: response.status(),
			body: response.ok() ? "" : await response.text().catch(() => ""),
		};
		if (!result.ok) {
			console.warn(`[ui-login] dev session bootstrap failed (${result.status}): ${result.body}`);
		}
		return result.ok;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[ui-login] dev session bootstrap threw: ${message}`);
		return false;
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
	await settleAuthenticatedPage(page);
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
	let lastLoginStartAt = 0;

	const startedAt = Date.now();
	while (Date.now() - startedAt < config.loginTimeoutMs) {
		if (await isSessionReady(page)) {
			await settleAuthenticatedPage(page);
			await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			await saveStorageState(context, storageKey);
			return { context, page };
		}

		if (!isOnAuthOrigin(page) && Date.now() - lastLoginStartAt > 10_000) {
			if (await startLocalDevSession(page, credential)) {
				await settleAuthenticatedPage(page);
				await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			} else {
				await startWebLogin(page);
			}
			lastLoginStartAt = Date.now();
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
			if (await isSessionReady(page)) {
				await settleAuthenticatedPage(page);
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

	let lastLoginStartAt = 0;
	const startedAt = Date.now();
	while (Date.now() - startedAt < config.loginTimeoutMs) {
		if (await isSessionReady(page)) {
			await settleAuthenticatedPage(page);
			await saveStorageState(page.context(), storageKey);
			return;
		}

		if (!isOnAuthOrigin(page) && Date.now() - lastLoginStartAt > 10_000) {
			if (await startLocalDevSession(page, credential)) {
				await settleAuthenticatedPage(page);
				await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
			} else {
				await startWebLogin(page);
			}
			lastLoginStartAt = Date.now();
		}

		await attemptLocalAutologinWithCredential(page, credential);
		await page.waitForTimeout(1_000);
	}

	throw new Error("Authenticated Playwright session is missing and local auto-login could not restore it.");
}

export function getSeededCredential(role: UiRole): RoleCredential {
	return getUiHarnessConfig().roleCredentials[role];
}
