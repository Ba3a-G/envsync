import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import { managementTestRequest } from "../helpers/management-request";
import {
	checkServiceHealth,
	seedE2EOrg,
	type E2ESeed,
} from "../helpers/real-auth";

import { LicenseStateService } from "@/services/license-state.service";
import { config } from "@/utils/env";

type LicenseMode = "active" | "inactive";

let seed: E2ESeed;
let licenseMode: LicenseMode = "active";

const originalConfig = {
	ENVSYNC_EDITION: config.ENVSYNC_EDITION,
	ENVSYNC_LICENSE_ENFORCEMENT: config.ENVSYNC_LICENSE_ENFORCEMENT,
	ENVSYNC_LICENSE_MODE: config.ENVSYNC_LICENSE_MODE,
	ENVSYNC_LICENSE_SERVER_URL: config.ENVSYNC_LICENSE_SERVER_URL,
	ENVSYNC_LICENSE_KEY: config.ENVSYNC_LICENSE_KEY,
	ENVSYNC_INSTALL_FINGERPRINT: config.ENVSYNC_INSTALL_FINGERPRINT,
	ENVSYNC_STACK_NAME: config.ENVSYNC_STACK_NAME,
	ENVSYNC_RELEASE_VERSION: config.ENVSYNC_RELEASE_VERSION,
};

const fakeLicenseServer = Bun.serve({
	port: 0,
	fetch(request) {
		if (request.method === "GET" && new URL(request.url).pathname === "/health") {
			return Response.json({ status: "ok", store: "memory" });
		}

		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

		const now = Date.now();
		const lease_expires_at = new Date(now + 5 * 60_000).toISOString();
		const status = licenseMode === "active" ? "active" : "inactive";
		const reason_code = licenseMode === "active" ? null : "ENTERPRISE_LICENSE_INVALID";
		const message = licenseMode === "active" ? "License is active." : "License is inactive.";

		return Response.json({
			status,
			lease_expires_at,
			signed_lease: `lease-${licenseMode}`,
			reason_code,
			message,
			license_key: "envsync-e2e-license",
			last_verified_at: new Date(now).toISOString(),
		});
	},
});

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();

	config.ENVSYNC_EDITION = "enterprise";
	config.ENVSYNC_LICENSE_ENFORCEMENT = "true";
	config.ENVSYNC_LICENSE_MODE = "lease";
	config.ENVSYNC_LICENSE_SERVER_URL = `http://127.0.0.1:${fakeLicenseServer.port}`;
	config.ENVSYNC_LICENSE_KEY = "envsync-e2e-license";
	config.ENVSYNC_INSTALL_FINGERPRINT = "e2e-install-fingerprint";
	config.ENVSYNC_STACK_NAME = "envsync-e2e";
	config.ENVSYNC_RELEASE_VERSION = "e2e";

	await LicenseStateService.updateLicenseState({
		status: "unknown",
		signed_lease: null,
		lease_expires_at: null,
		fingerprint: config.ENVSYNC_INSTALL_FINGERPRINT,
		last_verified_at: null,
		last_error_code: null,
		last_error_message: null,
		validation_mode: "lease",
	});
});

afterAll(async () => {
	config.ENVSYNC_EDITION = originalConfig.ENVSYNC_EDITION;
	config.ENVSYNC_LICENSE_ENFORCEMENT = originalConfig.ENVSYNC_LICENSE_ENFORCEMENT;
	config.ENVSYNC_LICENSE_MODE = originalConfig.ENVSYNC_LICENSE_MODE;
	config.ENVSYNC_LICENSE_SERVER_URL = originalConfig.ENVSYNC_LICENSE_SERVER_URL;
	config.ENVSYNC_LICENSE_KEY = originalConfig.ENVSYNC_LICENSE_KEY;
	config.ENVSYNC_INSTALL_FINGERPRINT = originalConfig.ENVSYNC_INSTALL_FINGERPRINT;
	config.ENVSYNC_STACK_NAME = originalConfig.ENVSYNC_STACK_NAME;
	config.ENVSYNC_RELEASE_VERSION = originalConfig.ENVSYNC_RELEASE_VERSION;

	await LicenseStateService.updateLicenseState({
		status: "unknown",
		signed_lease: null,
		lease_expires_at: null,
		fingerprint: originalConfig.ENVSYNC_INSTALL_FINGERPRINT ?? null,
		last_verified_at: null,
		last_error_code: null,
		last_error_message: null,
		validation_mode: originalConfig.ENVSYNC_LICENSE_MODE,
	});

	fakeLicenseServer.stop(true);
});

describe("Enterprise License Lock E2E", () => {
	test("active verification keeps core and management surfaces unlocked", async () => {
		licenseMode = "active";

		const activateRes = await managementTestRequest("/api/license/activate", {
			method: "POST",
		});
		expect(activateRes.status).toBe(200);
		const activated = await activateRes.json<{ state: { status: string } }>();
		expect(activated.state.status).toBe("active");

		const [coreAppsRes, managementProvidersRes, systemStatusRes, licenseStatusRes] = await Promise.all([
			testRequest("/api/app", {
				token: seed.masterUser.token,
			}),
			managementTestRequest("/api/enterprise/providers", {
				token: seed.masterUser.token,
			}),
			testRequest("/api/system/status"),
			managementTestRequest("/api/license/status"),
		]);

		expect(coreAppsRes.status).toBe(200);
		expect(managementProvidersRes.status).toBe(200);
		expect(systemStatusRes.status).toBe(200);
		expect(licenseStatusRes.status).toBe(200);

		const licenseStatus = await licenseStatusRes.json<{ locked: boolean; state: { status: string } }>();
		expect(licenseStatus.locked).toBe(false);
		expect(licenseStatus.state.status).toBe("active");
	});

	test("inactive verification locks protected routes but preserves allowlisted status routes", async () => {
		licenseMode = "inactive";

		const verifyRes = await managementTestRequest("/api/license/verify", {
			method: "POST",
		});
		expect(verifyRes.status).toBe(200);
		const verified = await verifyRes.json<{ state: { status: string } }>();
		expect(verified.state.status).toBe("inactive");

		const [coreAppsRes, managementProvidersRes, coreSystemRes, managementSystemRes, licenseStatusRes] = await Promise.all([
			testRequest("/api/app", {
				token: seed.masterUser.token,
			}),
			managementTestRequest("/api/enterprise/providers", {
				token: seed.masterUser.token,
			}),
			testRequest("/api/system/status"),
			managementTestRequest("/api/system/status"),
			managementTestRequest("/api/license/status"),
		]);

		expect(coreAppsRes.status).toBe(423);
		expect(managementProvidersRes.status).toBe(423);
		expect(coreSystemRes.status).toBe(200);
		expect(managementSystemRes.status).toBe(200);
		expect(licenseStatusRes.status).toBe(200);

		const coreLocked = await coreAppsRes.json<{ code: string; reason: string }>();
		const managementLocked = await managementProvidersRes.json<{ code: string; reason: string }>();
		expect(coreLocked.code).toBe("ENTERPRISE_LICENSE_INVALID");
		expect(managementLocked.code).toBe("ENTERPRISE_LICENSE_INVALID");

		const managementSystem = await managementSystemRes.json<{
			license: { required: boolean; locked: boolean; reason: string | null; state: { status: string } };
		}>();
		expect(managementSystem.license.required).toBe(true);
		expect(managementSystem.license.locked).toBe(true);
		expect(managementSystem.license.state.status).toBe("inactive");

		const licenseStatus = await licenseStatusRes.json<{
			required: boolean;
			locked: boolean;
			reason: string | null;
			state: { status: string };
		}>();
		expect(licenseStatus.required).toBe(true);
		expect(licenseStatus.locked).toBe(true);
		expect(licenseStatus.reason).toBe("ENTERPRISE_LICENSE_INVALID");
		expect(licenseStatus.state.status).toBe("inactive");
	});
});
