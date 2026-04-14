import { expect, type Page } from "@playwright/test";

import type { JsonValue } from "./network";
import { waitForTrackedResponse } from "./network";

function expectObjectBody(body: JsonValue | null, label: string): asserts body is Record<string, JsonValue> {
	expect(body, `${label} request body should be a JSON object`).toBeTruthy();
	expect(typeof body, `${label} request body should be an object`).toBe("object");
	expect(Array.isArray(body), `${label} request body should not be an array`).toBe(false);
}

async function openRowActions(page: Page, key: string) {
	const row = page.locator("tr").filter({ hasText: key }).first();
	await row.waitFor({ state: "visible" });
	const actionButton = row.getByRole("button").last();
	await actionButton.scrollIntoViewIfNeeded();
	await actionButton.click({ force: true });
	return row;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getEnvironmentCard(page: Page, envName: string) {
	return page
		.locator('[class*="bg-gray-900"]')
		.filter({
			has: page.getByRole("heading", {
				name: new RegExp(`^${escapeRegExp(envName)}$`, "i"),
			}),
		})
		.first();
}

async function ensureEnvironmentTypeExists(page: Page, appId: string, envName: string) {
	await page.goto(`/applications/${appId}/manage-environments`, { waitUntil: "domcontentloaded" });
	await expect(
		page.getByRole("heading", { name: "Manage Environment Types" })
			.or(page.getByRole("heading", { name: "Manage Environments" })),
	).toBeVisible();

	const card = getEnvironmentCard(page, envName);
	if (await card.isVisible().catch(() => false)) {
		return;
	}

	await page.getByRole("button", { name: "Add Environment Type" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Create Environment Type" })).toBeVisible();
	await dialog.locator("#create-env-name").fill(envName);
	await dialog.getByRole("button", { name: "Create Environment Type" }).click();
	await expect(getEnvironmentCard(page, envName)).toBeVisible();
}

export async function createProject(page: Page, projectName: string) {
	await page.goto("/applications", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Create Project" }).click();
	await expect(page.getByRole("heading", { name: "Create New Project" })).toBeVisible();

	await page.locator("#project-name").fill(projectName);
	await page.locator("#project-description").fill("Temporary project created by the Playwright UI harness.");
	await page.getByRole("switch").click();
	await page.getByRole("button", { name: "Add Common Presets" }).click();

	const createResponse = waitForTrackedResponse(page, {
		method: "POST",
		pathFragment: "/api/app",
		expectedStatus: 201,
	});

	await page.getByRole("button", { name: /Create Project with 3 Environments?/ }).click();
	const trackedResponse = await createResponse;
	expectObjectBody(trackedResponse.responseBody, "Create project response");
	expect(typeof trackedResponse.responseBody.id).toBe("string");
	const appId = trackedResponse.responseBody.id as string;
	await page.goto(`/applications/${appId}`, { waitUntil: "domcontentloaded" });
	await expect(page).toHaveURL(new RegExp(`/applications/${escapeRegExp(appId)}(?:\\?|$)`));
	await ensureEnvironmentTypeExists(page, appId, "Development");
	await ensureEnvironmentTypeExists(page, appId, "Staging");
	await ensureEnvironmentTypeExists(page, appId, "Production");
	await page.goto(`/applications/${appId}`, { waitUntil: "domcontentloaded" });

	return {
		appId,
	};
}

export async function openProjectCardActions(page: Page, projectName: string) {
	const card = page.locator('[class*="group cursor-pointer"]').filter({ hasText: projectName }).first();
	await card.waitFor({ state: "visible" });
	await card.hover();
	const actionButton = card.getByRole("button").last();
	await actionButton.click({ force: true });
	return card;
}

export async function editProject(page: Page, projectName: string, nextName: string) {
	await page.goto("/applications", { waitUntil: "domcontentloaded" });
	await openProjectCardActions(page, projectName);
	await page.getByRole("menuitem", { name: "Edit Project" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Edit Project" })).toBeVisible();
	await dialog.locator("#edit-name").fill(nextName);
	await dialog.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText(nextName).first()).toBeVisible();
}

export async function deleteProject(page: Page, projectName: string) {
	await page.goto("/applications", { waitUntil: "domcontentloaded" });
	await openProjectCardActions(page, projectName);
	await page.getByRole("menuitem", { name: "Delete Project" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Delete Project" })).toBeVisible();
	await dialog.locator("#delete-confirm").fill(projectName);
	await dialog.getByRole("button", { name: "Delete Project" }).click();
	await expect(page.getByText(projectName)).toHaveCount(0);
}

export async function setEnvironmentProtected(page: Page, appId: string, envName: string, isProtected = true) {
	await ensureEnvironmentTypeExists(page, appId, envName);
	const card = getEnvironmentCard(page, envName);
	await card.waitFor({ state: "visible" });
	await card.getByRole("button").nth(1).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Edit Environment Type" })).toBeVisible();
	const checkbox = dialog.locator('input[type="checkbox"]').nth(1);
	const checked = await checkbox.isChecked();
	if (checked !== isProtected) {
		await checkbox.click();
	}
	await dialog.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText("Protected").filter({ hasText: "Protected" }).first()).toBeVisible();
}

export async function createEnvironmentType(page: Page, appId: string, envName: string) {
	await page.goto(`/applications/${appId}/manage-environments`, { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { name: "Add Environment Type" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Create Environment Type" })).toBeVisible();
	await dialog.locator("#create-env-name").fill(envName);
	await dialog.getByRole("button", { name: "Create Environment Type" }).click();
	await expect(page.getByText(envName).first()).toBeVisible();
}

export async function deleteEnvironmentType(page: Page, appId: string, envName: string) {
	await page.goto(`/applications/${appId}/manage-environments`, { waitUntil: "domcontentloaded" });
	const card = page.locator('[class*="bg-gray-900"]').filter({ hasText: envName }).first();
	await card.waitFor({ state: "visible" });
	await card.getByRole("button").nth(2).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Delete Environment Type" })).toBeVisible();
	await dialog.locator("#delete-confirm").fill(envName);
	await dialog.getByRole("button", { name: "Delete Environment Type" }).click();
	await expect(page.getByText(envName)).toHaveCount(0);
}

export async function createVariable(page: Page, appId: string, envTypeName: string, key: string, value: string) {
	await page.getByRole("button", { name: "Add Variable" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	await dialog.getByRole("combobox").click();
	await page.getByRole("option", { name: envTypeName }).click();
	await dialog.locator("#var-key").fill(key);
	await dialog.locator("#var-value").fill(value);

	const createResponse = waitForTrackedResponse(page, {
		method: "PUT",
		pathFragment: "/api/env/single",
		expectedStatus: 201,
	});

	await dialog.getByRole("button", { name: "Add Variable" }).click();
	const trackedResponse = await createResponse;
	expectObjectBody(trackedResponse.requestBody, "Create env");
	expect(trackedResponse.requestBody.key).toBe(key);
	expect(trackedResponse.requestBody.value).toBe(value);
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBeTruthy();

	return String(trackedResponse.requestBody.env_type_id);
}

export async function updateVariable(page: Page, appId: string, envTypeId: string, key: string, nextValue: string) {
	await openRowActions(page, key);
	await page.getByRole("menuitem", { name: "Edit Variable" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.locator("#edit-var-key")).toBeDisabled();

	await dialog.locator("#edit-var-value").fill(nextValue);
	const updateResponse = waitForTrackedResponse(page, {
		method: "PATCH",
		pathFragment: `/api/env/i/${key}`,
		expectedStatus: 200,
	});

	await dialog.getByRole("button", { name: "Save Changes" }).click();
	const trackedResponse = await updateResponse;
	expectObjectBody(trackedResponse.requestBody, "Update env");
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBe(envTypeId);
	expect(trackedResponse.requestBody.value).toBe(nextValue);
	expect(trackedResponse.requestBody.key).toBeUndefined();

	await expect(page.locator("tr").filter({ hasText: nextValue }).first()).toBeVisible();
}

export async function deleteVariable(page: Page, appId: string, envTypeId: string, key: string) {
	await openRowActions(page, key);
	const deleteMenuItem = page.getByRole("menuitem", { name: /Delete Variable|Delete/i }).first();
	await deleteMenuItem.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.locator("#delete-confirm").fill(key);

	const deleteResponse = waitForTrackedResponse(page, {
		method: "DELETE",
		pathFragment: "/api/env",
		expectedStatus: 200,
	});
	await dialog.getByRole("button", { name: /Delete Variable/ }).click();

	const trackedResponse = await deleteResponse;
	expectObjectBody(trackedResponse.requestBody, "Delete env");
	expect(trackedResponse.requestBody.key).toBe(key);
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBe(envTypeId);
	await expect(page.locator("tr").filter({ hasText: key })).toHaveCount(0);
}

export async function createSecret(page: Page, appId: string, envTypeName: string, key: string, value: string) {
	await page.getByRole("button", { name: "Add Secret" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	await dialog.getByRole("combobox").click();
	await page.getByRole("option", { name: envTypeName }).click();
	await dialog.locator("#var-key").fill(key);
	await dialog.locator("#var-value").fill(value);

	const createResponse = waitForTrackedResponse(page, {
		method: "PUT",
		pathFragment: "/api/secret/single",
		expectedStatus: 201,
	});
	await dialog.getByRole("button", { name: "Add Secret" }).click();

	const trackedResponse = await createResponse;
	expectObjectBody(trackedResponse.requestBody, "Create secret");
	expect(trackedResponse.requestBody.key).toBe(key);
	expect(trackedResponse.requestBody.value).toBe(value);
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBeTruthy();

	return String(trackedResponse.requestBody.env_type_id);
}

export async function updateSecret(page: Page, appId: string, envTypeId: string, key: string, nextValue: string) {
	await openRowActions(page, key);
	await page.getByRole("menuitem", { name: "Edit Variable" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.locator("#edit-var-key")).toBeDisabled();
	const clickToEditButton = dialog.getByRole("button", { name: "Click to edit" });
	if (await clickToEditButton.isVisible().catch(() => false)) {
		await clickToEditButton.click();
	} else {
		const revealButton = dialog.getByRole("button", { name: "Reveal" });
		if (await revealButton.isVisible().catch(() => false)) {
			await revealButton.click();
		}
	}
	await expect(dialog.locator("#edit-var-value")).toBeVisible();
	await dialog.locator("#edit-var-value").fill(nextValue);
	const updateResponse = waitForTrackedResponse(page, {
		method: "PATCH",
		pathFragment: `/api/secret/i/${key}`,
		expectedStatus: 200,
	});
	await dialog.getByRole("button", { name: "Save Changes" }).click();

	const trackedResponse = await updateResponse;
	expectObjectBody(trackedResponse.requestBody, "Update secret");
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBe(envTypeId);
	expect(trackedResponse.requestBody.value).toBe(nextValue);
}

export async function deleteSecret(page: Page, appId: string, envTypeId: string, key: string) {
	await openRowActions(page, key);
	const deleteMenuItem = page.getByRole("menuitem", { name: /Delete Secret|Delete Variable|Delete/i }).first();
	await deleteMenuItem.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.locator("#delete-confirm").fill(key);

	const deleteResponse = waitForTrackedResponse(page, {
		method: "DELETE",
		pathFragment: "/api/secret",
		expectedStatus: 200,
	});
	await dialog.getByRole("button", { name: /Delete Secret/ }).click();

	const trackedResponse = await deleteResponse;
	expectObjectBody(trackedResponse.requestBody, "Delete secret");
	expect(trackedResponse.requestBody.key).toBe(key);
	expect(trackedResponse.requestBody.app_id).toBe(appId);
	expect(trackedResponse.requestBody.env_type_id).toBe(envTypeId);
	await expect(page.locator("tr").filter({ hasText: key })).toHaveCount(0);
}
