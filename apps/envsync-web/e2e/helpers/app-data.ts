import type { Page } from "@playwright/test";

import { getUiHarnessConfig } from "./config";

interface AppSummary {
	id: string;
	name: string;
	enable_secrets?: boolean;
}

interface AppDetail extends AppSummary {
	env_types?: Array<{ id: string; name: string }>;
}

async function pageFetchJson<T>(page: Page, path: string): Promise<T> {
	const { apiBaseUrl } = getUiHarnessConfig();
	return page.evaluate(async ({ currentApiBaseUrl, currentPath }) => {
		const response = await fetch(`${currentApiBaseUrl}${currentPath}`, {
			credentials: "include",
		});
		if (!response.ok) {
			throw new Error(`${currentPath} failed with ${response.status}`);
		}
		return await response.json();
	}, { currentApiBaseUrl: apiBaseUrl, currentPath: path }) as Promise<T>;
}

export async function getApps(page: Page) {
	return pageFetchJson<AppSummary[]>(page, "/api/app");
}

export async function getAppByName(page: Page, name: string) {
	const apps = await getApps(page);
	return apps.find(app => app.name === name) ?? null;
}

export async function getAppDetail(page: Page, appId: string) {
	return pageFetchJson<AppDetail>(page, `/api/app/${appId}`);
}
