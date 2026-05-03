import { afterEach, beforeAll, describe, expect, test } from "bun:test";

import { testRequest } from "../../helpers/request";
import { startLocalLicenseServer, type LocalLicenseServer } from "../helpers/license-server";
import { startManagementBackgroundHandlers } from "../helpers/management-app";
import {
	checkServiceHealth,
	seedE2EOrg,
	type E2ESeed,
} from "../helpers/real-auth";

import { EditionPolicyService } from "@/services/edition-policy.service";
import { LicenseStateService } from "@/services/license-state.service";

let seed: E2ESeed;
let licenseServer: LocalLicenseServer | null = null;

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
	await licenseServer?.stop();
	licenseServer = null;
});

describe("License Heartbeat Lock E2E", () => {
	test("heartbeat renews the lease, lock enforcement blocks protected routes, and re-verification recovers both surfaces", async () => {
		const licenseKey = "envsync-enterprise-heartbeat-e2e";
		const installFingerprint = "envsync-install-heartbeat-e2e";

		licenseServer = await startLocalLicenseServer({
			licenseKey,
			installFingerprint,
			leaseTtlSeconds: 1,
		});

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
			server_url: licenseServer.baseUrl,
			license_key: licenseKey,
			install_fingerprint: installFingerprint,
			heartbeat_interval_ms: 50,
		});
		await LicenseStateService.updateLicenseState({
			status: "unknown",
			signed_lease: null,
			lease_expires_at: null,
			fingerprint: installFingerprint,
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

		licenseServer.setLicenseStatus("inactive");

		await pollUntil(
			async () => {
				const [managementProviders, coreOrg] = await Promise.all([
					testRequest("/api/enterprise/providers", {
						token: seed.masterUser.token,
						surface: "management",
					}),
					testRequest("/api/org", {
						token: seed.masterUser.token,
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
		expect(inactiveLicenseStatus.state.status).toBe("inactive");

		licenseServer.setLicenseStatus("active");

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
						token: seed.masterUser.token,
						surface: "management",
					}),
					testRequest("/api/org", {
						token: seed.masterUser.token,
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
