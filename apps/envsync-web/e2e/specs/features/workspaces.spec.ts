import { test, expect } from "../../fixtures/test";

async function getAuthSession(page: import("@playwright/test").Page) {
  return await page.evaluate(async () => {
    const runtimeConfig = window.__ENVSYNC_RUNTIME_CONFIG__ as { apiBaseUrl?: string } | undefined;
    const apiBaseUrl = runtimeConfig?.apiBaseUrl ?? window.location.origin;
    const response = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Failed to load auth session: ${response.status}`);
    }
    return await response.json() as {
      org: { id: string; name: string; slug: string };
      memberships: Array<{ org_id: string; org_name: string; org_slug: string }>;
    };
  });
}

test.describe("workspace switcher", () => {
  test("creates a new workspace from the enterprise header switcher and can switch back", async ({ page, makeName }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const originalSession = await getAuthSession(page);
    const workspaceName = makeName("Workspace");

    await page.getByTestId("workspace-switcher-trigger").click();
    await expect(page.getByTestId("create-workspace-action")).toBeVisible();
    await page.getByTestId("create-workspace-action").click();

    await expect(page.getByTestId("create-workspace-dialog")).toBeVisible();
    await page.getByTestId("create-workspace-name-input").fill(workspaceName);
    await page.getByTestId("create-workspace-submit").click();

    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(workspaceName);

    const createdSession = await getAuthSession(page);
    expect(createdSession.org.name).toBe(workspaceName);
    expect(createdSession.memberships.length).toBeGreaterThanOrEqual(2);

    await page.getByTestId("workspace-switcher-trigger").click();
    await expect(page.getByTestId(`workspace-switcher-item-${originalSession.org.slug}`)).toBeVisible();
    await expect(page.getByTestId(`workspace-switcher-item-${createdSession.org.slug}`)).toBeVisible();

    await page.getByTestId(`workspace-switcher-item-${originalSession.org.slug}`).click();
    await page.waitForURL("**/");
    await expect(page.getByTestId("workspace-switcher-trigger")).toContainText(originalSession.org.name);
  });
});
