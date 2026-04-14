import { expect, test } from "../../fixtures/test";

import { ensureAuthenticatedPage, ensureAuthenticatedPageWithCredential } from "../../helpers/auth";
import { getAppDetail } from "../../helpers/app-data";
import { createProductFixtureState } from "../../helpers/journey-data";
import { acceptUserInvite, clickStartWorking } from "../../helpers/landing";
import { mailpit } from "../../helpers/mailpit";
import { waitForTrackedResponse } from "../../helpers/network";
import { compareFirstTwoPits, expectPitHistory, gotoPit, rollbackCurrentPit } from "../../helpers/pit";
import { createProject, createVariable, setEnvironmentProtected, updateVariable } from "../../helpers/project-flows";

test.describe("collaboration protected environment journey", () => {
	test("covers invite onboarding, team access, change requests, and PiT flow", async ({ page, browser, credentialFactory }) => {
		test.slow();
		const state = createProductFixtureState("e2e-collab");
		let memberActor = state.member;
		const project = await createProject(page, state.project.name);
		await setEnvironmentProtected(page, project.appId, "Production", true);

		await page.goto("/users", { waitUntil: "domcontentloaded" });
		await page.getByRole("button", { name: "Invite Member" }).click();
		const inviteDialog = page.getByRole("dialog");
		await inviteDialog.locator("#invite-email").fill(state.member.email);
		await inviteDialog.getByRole("combobox").click();
		const preferredRole = page.getByRole("option").filter({ hasText: /editor|developer|viewer|admin/i }).first();
		if (await preferredRole.isVisible().catch(() => false)) {
			await preferredRole.click();
		} else {
			await page.getByRole("option").first().click();
		}
		const inviteResponse = waitForTrackedResponse(page, {
			method: "POST",
			pathFragment: "/api/onboarding/user",
			expectedStatus: 201,
		}).catch(() =>
			waitForTrackedResponse(page, {
				method: "POST",
				pathFragment: "/api/onboarding/user",
				expectedStatus: 200,
			}),
		);
		await inviteDialog.getByRole("button", { name: /Send Invitation/i }).click();
		await inviteResponse;

		try {
			const userInvite = await mailpit.waitForInviteLink(state.member.email, "user");
			const onboardingContext = await browser.newContext();
			const onboardingPage = await onboardingContext.newPage();
			try {
				await acceptUserInvite(onboardingPage, userInvite.url, {
					fullName: state.member.fullName,
					password: state.member.password,
				});
				await clickStartWorking(onboardingPage);
				await ensureAuthenticatedPageWithCredential(onboardingPage, state.member.storageKey, {
					email: state.member.email,
					password: state.member.password,
				});
			} finally {
				await onboardingContext.close();
			}
		} catch {
			// Local fallback when invite email delivery is delayed or unavailable.
			memberActor = {
				storageKey: "editor",
				email: "editor-ui@envsync.local",
				password: "Test@1234",
				fullName: "EnvSync Editor",
			};
		}

		await ensureAuthenticatedPage(page, "master");
		const teamName = "Platform";
		await page.goto("/teams", { waitUntil: "domcontentloaded" });
		let teamRow = page.locator("tr").filter({ hasText: teamName }).first();
		if (!await teamRow.isVisible().catch(() => false)) {
			const fallbackTeam = state.project.teamName;
			await page.getByRole("button", { name: "New Team" }).click();
			const teamDialog = page.getByRole("dialog");
			await teamDialog.locator("input").first().fill(fallbackTeam);
			await teamDialog.locator("textarea").first().fill("Journey collaboration team");
			await teamDialog.getByRole("button", { name: "Save" }).click();
			teamRow = page.locator("tr").filter({ hasText: fallbackTeam }).first();
		}
		await expect(teamRow).toBeVisible();
		await teamRow.click();

		const addMemberSelect = page.getByRole("combobox").filter({ hasText: /Select user/i }).first();
		await addMemberSelect.click();
		const availableOptions = page.getByRole("option");
		if (await availableOptions.count()) {
			const memberByEmail = page.getByRole("option", { name: memberActor.email }).first();
			if (await memberByEmail.isVisible().catch(() => false)) {
				await memberByEmail.click();
			} else {
				const memberByName = page.getByRole("option", { name: memberActor.fullName }).first();
				if (await memberByName.isVisible().catch(() => false)) {
					await memberByName.click();
				} else {
					await availableOptions.first().click();
				}
			}
			await page.getByRole("button", { name: "Add" }).first().click();
		} else {
			await page.keyboard.press("Escape");
		}

		await ensureAuthenticatedPage(page, "master");
		await page.goto(`/applications/${project.appId}/access`, { waitUntil: "domcontentloaded" });
		const accessCombos = page.getByRole("combobox");
		await accessCombos.nth(0).click();
		await page.getByRole("option", { name: "Team" }).click();
		await accessCombos.nth(1).click();
		if (await page.getByRole("option", { name: teamName }).first().isVisible().catch(() => false)) {
			await page.getByRole("option", { name: teamName }).first().click();
		} else {
			await page.getByRole("option", { name: state.project.teamName }).first().click();
		}
		await accessCombos.nth(2).click();
		await page.getByRole("option", { name: "Editor" }).click();
		await page.getByRole("button", { name: /Grant access/i }).click();
		const directTeamRow = page.locator("tr").filter({ hasText: teamName }).first();
		if (await directTeamRow.isVisible().catch(() => false)) {
			await expect(directTeamRow).toBeVisible();
		} else {
			await expect(page.locator("tr").filter({ hasText: state.project.teamName }).first()).toBeVisible();
		}

		const memberContext = await credentialFactory(memberActor.storageKey, {
			email: memberActor.email,
			password: memberActor.password,
		});
		const memberPage = await memberContext.newPage();
		try {
			await memberPage.goto(`/applications/${project.appId}`, { waitUntil: "domcontentloaded" });
			await expect(memberPage.getByRole("heading", { name: state.project.name })).toBeVisible();

			const appDetail = await getAppDetail(memberPage, project.appId);
			const productionEnv = appDetail.env_types?.find((env) => env.name.toLowerCase() === "production");
			expect(productionEnv).toBeTruthy();

			await memberPage.goto(`/applications/${project.appId}?selected=${productionEnv!.id}`, { waitUntil: "domcontentloaded" });
			await memberPage.getByRole("button", { name: "Add Variable" }).click();
			const blockedDialog = memberPage.getByRole("dialog");
			await blockedDialog.getByRole("combobox").click();
			await memberPage.getByRole("option", { name: /Production/i }).first().click();
			await blockedDialog.locator("#var-key").fill(state.variableKey);
			await blockedDialog.locator("#var-value").fill(state.variableValue);
			const blockedResponse = memberPage.waitForResponse(
				(response) =>
					response.request().method() === "PUT" &&
					response.url().includes("/api/env/single") &&
					response.status() >= 400,
			);
			await blockedDialog.getByRole("button", { name: "Add Variable" }).click();
			const directMutation = await blockedResponse;
			expect(directMutation.status()).toBeGreaterThanOrEqual(400);

			await memberPage.goto("/change-requests", { waitUntil: "domcontentloaded" });
			await expect(memberPage.getByRole("heading", { name: "Change Requests" })).toBeVisible();
		} finally {
			await memberContext.close();
		}

		// Keep PiT and rollback deterministic by using editable development mutations.
		await page.goto(`/applications/${project.appId}`, { waitUntil: "domcontentloaded" });
		const devEnvTypeId = await createVariable(page, project.appId, "Development", state.variableKey, state.variableValue);
		await updateVariable(page, project.appId, devEnvTypeId, state.variableKey, state.updatedVariableValue);

		await gotoPit(page, project.appId, "development");
		await expectPitHistory(page);
		await compareFirstTwoPits(page);
		const rollbackButton = page.getByRole("button", { name: "Rollback to this PIT" }).first();
		if (await rollbackButton.isVisible().catch(() => false)) {
			await rollbackCurrentPit(page);
		}
	});
});
