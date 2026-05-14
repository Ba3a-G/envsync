import { afterEach, beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import { startManagementBackgroundHandlers } from "../helpers/management-app";
import {
	checkServiceHealth,
	seedE2EOrg,
	type E2ESeed,
} from "../helpers/real-auth";

import { EditionPolicyService } from "@/services/edition-policy.service";
import { LicenseStateService } from "@/services/license-state.service";
import { ApiKeyService } from "@/services/api_key.service";
import { config } from "@/utils/env";

let seed: E2ESeed;
const hostedLicenseServerUrl = process.env.ENVSYNC_LICENSE_SERVER_URL ?? "https://license.envsync.cloud";
const hostedLicenseKey = process.env.ENVSYNC_E2E_LICENSE_KEY ?? config.ENVSYNC_LICENSE_KEY;
const hostedInvalidLicenseKey = "envsync-e2e-invalid-heartbeat-license-key";
const hostedInstallFingerprint = "envsync-e2e-hosted-heartbeat";

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

describe("License Heartbeat Lock E2E", () => {
	beforeAll(async () => {
		await checkServiceHealth();
		seed = await seedE2EOrg();
	});

	afterEach(async () => {
		LicenseStateService.stopHeartbeatForTests();
		LicenseStateService.clearTestOverrides();
		EditionPolicyService.clearTestOverrides();
		await LicenseStateService.updateLicenseState({
			status: "unknown",
			signed_lease: null,
			lease_expires_at: null,
			fingerprint: null,
			last_verified_at: null,
			last_error_code: null,
			last_error_message: null,
		});
	});

	test("heartbeat renews the lease, lock enforcement blocks protected routes, and re-verification recovers both surfaces", async () => {
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
					managementBody: await managementProviders.json<{ code?: string; reason?: string }>(),
					coreStatus: coreOrg.status,
					coreBody: await coreOrg.json<{ code?: string; reason?: string }>(),
				};
			},
			value => value.managementStatus === 423 && value.coreStatus === 423,
		);

		const [managementLicenseStatus, managementVerify, managementSystemStatus, coreSystemStatus] = await Promise.all([
			testRequest("/api/license/status", { surface: "management" }),
			testRequest("/api/license/verify", { method: "POST", surface: "management" }),
			testRequest("/api/system/status", { surface: "management" }),
			testRequest("/api/system/status"),
		]);

		expect(managementLicenseStatus.status).toBe(200);
		expect(managementVerify.status).toBe(200);
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
		expect(inactiveLicenseStatus.state.status).toBe("error");

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
});
