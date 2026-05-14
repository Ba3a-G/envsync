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

let seed: E2ESeed;
const hostedLicenseServerUrl = process.env.ENVSYNC_LICENSE_SERVER_URL ?? "https://license.envsync.cloud";
const hostedLicenseKey = process.env.ENVSYNC_E2E_LICENSE_KEY ?? config.ENVSYNC_LICENSE_KEY;
const hostedInvalidLicenseKey = "envsync-e2e-invalid-license-key";
const hostedInstallFingerprint = "envsync-e2e-hosted-license-lock";

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

async function pollUntil<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	let lastValue: T | undefined;

	while (Date.now() < deadline) {
		lastValue = await fn();
		if (predicate(lastValue)) {
			return lastValue;
		}
		await Bun.sleep(100);
	}

	throw new Error(`Timed out waiting for condition. Last value: ${JSON.stringify(lastValue)}`);
}

beforeAll(async () => {
	if (!hostedLicenseKey) {
		throw new Error("ENVSYNC_E2E_LICENSE_KEY or ENVSYNC_LICENSE_KEY is required for hosted license E2E tests.");
	}

	await checkServiceHealth();
	seed = await seedE2EOrg();

	config.ENVSYNC_EDITION = "enterprise";
	config.ENVSYNC_LICENSE_ENFORCEMENT = "true";
	config.ENVSYNC_LICENSE_MODE = "lease";
	config.ENVSYNC_LICENSE_SERVER_URL = hostedLicenseServerUrl;
	config.ENVSYNC_LICENSE_KEY = hostedLicenseKey;
	config.ENVSYNC_INSTALL_FINGERPRINT = hostedInstallFingerprint;
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
	LicenseStateService.stopHeartbeatForTests();
	LicenseStateService.clearTestOverrides();

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
});

describe("Enterprise License Lock E2E", () => {
	test("active verification keeps core and management surfaces unlocked", async () => {
		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.clearTestOverrides();
		config.ENVSYNC_LICENSE_KEY = hostedLicenseKey;

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

	test("invalid hosted verification locks protected routes but preserves allowlisted status routes", async () => {
		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.setTestOverrides({
			server_url: hostedLicenseServerUrl,
			license_key: hostedInvalidLicenseKey,
			install_fingerprint: `${hostedInstallFingerprint}-invalid`,
			heartbeat_interval_ms: 50,
		});
		await LicenseStateService.updateLicenseState({
			status: "unknown",
			signed_lease: null,
			lease_expires_at: null,
			fingerprint: `${hostedInstallFingerprint}-invalid`,
			last_verified_at: null,
			last_error_code: null,
			last_error_message: null,
			validation_mode: "lease",
		});
		await LicenseStateService.startHeartbeat();

		await pollUntil(
			async () => {
				const response = await managementTestRequest("/api/license/status");
				return await response.json<{ locked: boolean; state: { status: string } }>();
			},
			value => value.locked && value.state.status === "error",
		);

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
		expect(coreLocked.code).toBe("LICENSE_SERVER_UNREACHABLE");
		expect(managementLocked.code).toBe("LICENSE_SERVER_UNREACHABLE");

		const managementSystem = await managementSystemRes.json<{
			license: { required: boolean; locked: boolean; reason: string | null; state: { status: string } };
		}>();
		expect(managementSystem.license.required).toBe(true);
		expect(managementSystem.license.locked).toBe(true);
		expect(managementSystem.license.state.status).toBe("error");

		const licenseStatus = await licenseStatusRes.json<{
			required: boolean;
			locked: boolean;
			reason: string | null;
			state: { status: string };
		}>();
		expect(licenseStatus.required).toBe(true);
		expect(licenseStatus.locked).toBe(true);
		expect(licenseStatus.reason).toBe("LICENSE_SERVER_UNREACHABLE");
		expect(licenseStatus.state.status).toBe("error");
	});
});
