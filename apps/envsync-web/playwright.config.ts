import { defineConfig } from "@playwright/test";

import { getStorageStatePath, getUiHarnessConfig } from "./e2e/helpers/config";

const uiConfig = getUiHarnessConfig();

export default defineConfig({
	testDir: "./e2e/specs",
	timeout: 120_000,
	expect: {
		timeout: uiConfig.actionTimeoutMs,
	},
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { outputFolder: `${uiConfig.artifactsDir}/html-report`, open: "never" }]],
	use: {
		baseURL: uiConfig.baseUrl,
		headless: uiConfig.headless,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		storageState: getStorageStatePath("master"),
		viewport: { width: 1600, height: 1000 },
		actionTimeout: uiConfig.actionTimeoutMs,
	},
});
