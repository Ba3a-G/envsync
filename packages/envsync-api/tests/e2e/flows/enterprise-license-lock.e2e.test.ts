import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import { managementTestRequest } from "../helpers/management-request";
import { startManagementBackgroundHandlers } from "../helpers/management-app";
import {
	checkServiceHealth,
	seedE2EOrg,
	type E2ESeed,
} from "../helpers/real-auth";

import { ApiKeyService } from "@/services/api_key.service";
import { EditionPolicyService } from "@/services/edition-policy.service";
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

function requireHostedLicenseKey() {
	if (!hostedLicenseKey) {
		throw new Error("ENVSYNC_E2E_LICENSE_KEY or ENVSYNC_LICENSE_KEY is required for hosted license E2E tests.");
	}
	return hostedLicenseKey;
}

beforeAll(async () => {
	await checkServiceHealth();
	seed = await seedE2EOrg();

	config.ENVSYNC_EDITION = "enterprise";
	config.ENVSYNC_LICENSE_ENFORCEMENT = "true";
	config.ENVSYNC_LICENSE_MODE = "lease";
	config.ENVSYNC_LICENSE_SERVER_URL = hostedLicenseServerUrl;
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
	EditionPolicyService.clearTestOverrides();

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

describe.serial("Enterprise License Lock E2E", () => {
	test("active verification keeps core and management surfaces unlocked", async () => {
		const licenseKey = requireHostedLicenseKey();
		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.clearTestOverrides();
		EditionPolicyService.clearTestOverrides();
		config.ENVSYNC_LICENSE_KEY = licenseKey;

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

	test("hosted heartbeat renews the lease and re-verification recovers locked surfaces", async () => {
		const licenseKey = requireHostedLicenseKey();
		const masterApiKey = (await ApiKeyService.createKey({
			user_id: seed.masterUser.id,
			org_id: seed.org.id,
			description: "License heartbeat lock E2E",
		})).key;

		EditionPolicyService.setTestOverrides({
			edition: "enterprise",
			management_enabled: true,
			management_web_enabled: true,
			landing_enabled: true,
			license_enforcement: true,
			single_org_mode: false,
		});
		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.setTestOverrides({
			server_url: hostedLicenseServerUrl,
			license_key: licenseKey,
			install_fingerprint: hostedInstallFingerprint,
			heartbeat_interval_ms: 50,
		});
		await LicenseStateService.updateLicenseState({
			status: "unknown",
			signed_lease: null,
			lease_expires_at: null,
			fingerprint: hostedInstallFingerprint,
			last_verified_at: null,
			last_error_code: null,
			last_error_message: null,
			validation_mode: "lease",
		});

		await startManagementBackgroundHandlers();

		const firstStatus = await pollUntil(
			async () => {
				const response = await testRequest("/api/license/status", { surface: "management" });
				return {
					status: response.status,
					body: await response.json<{
						locked: boolean;
						state: {
							status: string;
							last_verified_at: string | null;
							lease_expires_at: string | null;
						};
					}>(),
				};
			},
			value => value.status === 200 && value.body.locked === false && value.body.state.status === "active",
		);

		const renewedStatus = await pollUntil(
			async () => {
				const response = await testRequest("/api/license/status", { surface: "management" });
				return await response.json<{
					locked: boolean;
					state: {
						status: string;
						last_verified_at: string | null;
						lease_expires_at: string | null;
					};
				}>();
			},
			value => value.state.status === "active" && (
				value.state.last_verified_at !== firstStatus.body.state.last_verified_at
				|| value.state.lease_expires_at !== firstStatus.body.state.lease_expires_at
			),
		);
		expect(renewedStatus.locked).toBe(false);

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
				const [managementProviders, coreOrg] = await Promise.all([
					testRequest("/api/enterprise/providers", {
						apiKey: masterApiKey,
						surface: "management",
					}),
					testRequest("/api/org", {
						apiKey: masterApiKey,
					}),
				]);
				return {
					managementStatus: managementProviders.status,
					coreStatus: coreOrg.status,
				};
			},
			value => value.managementStatus === 423 && value.coreStatus === 423,
		);

		const [managementLicenseStatus, managementSystemStatus, coreSystemStatus] = await Promise.all([
			testRequest("/api/license/status", { surface: "management" }),
			testRequest("/api/system/status", { surface: "management" }),
			testRequest("/api/system/status"),
		]);

		expect(managementLicenseStatus.status).toBe(200);
		expect(managementSystemStatus.status).toBe(200);
		expect(coreSystemStatus.status).toBe(200);

		const inactiveLicenseStatus = await managementLicenseStatus.json<{
			required: boolean;
			locked: boolean;
			reason: string | null;
			state: { status: string };
		}>();
		expect(inactiveLicenseStatus.required).toBe(true);
		expect(inactiveLicenseStatus.locked).toBe(true);
		expect(inactiveLicenseStatus.reason).toBe("LICENSE_NOT_FOUND");
		expect(inactiveLicenseStatus.state.status).toBe("inactive");

		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.setTestOverrides({
			server_url: hostedLicenseServerUrl,
			license_key: licenseKey,
			install_fingerprint: hostedInstallFingerprint,
			heartbeat_interval_ms: 50,
		});

		const recoveryVerify = await testRequest("/api/license/verify", {
			method: "POST",
			surface: "management",
		});
		expect(recoveryVerify.status).toBe(200);
		expect(await recoveryVerify.json<{ state: { status: string } }>()).toMatchObject({
			state: { status: "active" },
		});

		await pollUntil(
			async () => {
				const [managementProviders, coreOrg] = await Promise.all([
					testRequest("/api/enterprise/providers", {
						apiKey: masterApiKey,
						surface: "management",
					}),
					testRequest("/api/org", {
						apiKey: masterApiKey,
					}),
				]);
				return {
					managementStatus: managementProviders.status,
					coreStatus: coreOrg.status,
				};
			},
			value => value.managementStatus === 200 && value.coreStatus === 200,
		);
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
			value => value.locked && value.state.status === "inactive",
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
		expect(coreLocked.code).toBe("ENTERPRISE_LICENSE_INVALID");
		expect(coreLocked.reason).toBe("LICENSE_NOT_FOUND");
		expect(managementLocked.code).toBe("ENTERPRISE_LICENSE_INVALID");
		expect(managementLocked.reason).toBe("LICENSE_NOT_FOUND");

		const managementSystem = await managementSystemRes.json<{
			license: { required: boolean; locked: boolean; reason: string | null; state: { status: string } };
		}>();
		expect(managementSystem.license.required).toBe(true);
		expect(managementSystem.license.locked).toBe(true);
		expect(managementSystem.license.reason).toBe("LICENSE_NOT_FOUND");
		expect(managementSystem.license.state.status).toBe("inactive");

		const licenseStatus = await licenseStatusRes.json<{
			required: boolean;
			locked: boolean;
			reason: string | null;
			state: { status: string };
		}>();
		expect(licenseStatus.required).toBe(true);
		expect(licenseStatus.locked).toBe(true);
		expect(licenseStatus.reason).toBe("LICENSE_NOT_FOUND");
		expect(licenseStatus.state.status).toBe("inactive");
	});
});
