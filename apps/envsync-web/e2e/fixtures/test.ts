import { test as base, expect } from "@playwright/test";

import { ensureAuthenticatedPage, ensureCredentialStorageState } from "../helpers/auth";
import { getUiHarnessConfig, uniqueName, type UiRole } from "../helpers/config";

type Fixtures = {
	roleFactory: (role: UiRole) => Promise<import("@playwright/test").BrowserContext>;
	credentialFactory: (
		storageKey: string,
		credential: { email: string; password: string },
	) => Promise<import("@playwright/test").BrowserContext>;
	makeName: (prefix: string) => string;
};

export const test = base.extend<Fixtures>({
	page: async ({ page }, use) => {
		page.setDefaultTimeout(getUiHarnessConfig().actionTimeoutMs);
		await ensureAuthenticatedPage(page, "master");
		await use(page);
	},
	roleFactory: async ({ browser }, use) => {
		await use(async role => {
			const { createRoleContext } = await import("../helpers/auth");
			return createRoleContext(browser, role);
		});
	},
	credentialFactory: async ({ browser }, use) => {
		await use(async (storageKey, credential) => {
			const { createStoredContext } = await import("../helpers/auth");
			await ensureCredentialStorageState(storageKey, credential);
			return createStoredContext(browser, storageKey);
		});
	},
	makeName: async ({}, use) => {
		await use(prefix => uniqueName(prefix));
	},
});

export { expect };
