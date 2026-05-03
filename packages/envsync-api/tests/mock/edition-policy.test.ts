import { afterEach, describe, expect, test } from "bun:test";

import { EditionPolicyService } from "@/services/edition-policy.service";
import { config } from "@/utils/env";

const originalConfig = {
	ENVSYNC_EDITION: config.ENVSYNC_EDITION,
	ENVSYNC_MANAGEMENT_ENABLED: config.ENVSYNC_MANAGEMENT_ENABLED,
	ENVSYNC_LANDING_ENABLED: config.ENVSYNC_LANDING_ENABLED,
	ENVSYNC_MANAGEMENT_WEB_ENABLED: config.ENVSYNC_MANAGEMENT_WEB_ENABLED,
	ENVSYNC_OBSERVABILITY_ENABLED: config.ENVSYNC_OBSERVABILITY_ENABLED,
	ENVSYNC_SINGLE_ORG_MODE: config.ENVSYNC_SINGLE_ORG_MODE,
	ENVSYNC_LICENSE_ENFORCEMENT: config.ENVSYNC_LICENSE_ENFORCEMENT,
};

afterEach(() => {
	Object.assign(config, originalConfig);
});

describe("EditionPolicyService", () => {
	test("uses OSS-safe defaults when optional enterprise toggles are unset", () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "oss",
			ENVSYNC_MANAGEMENT_ENABLED: undefined,
			ENVSYNC_LANDING_ENABLED: undefined,
			ENVSYNC_MANAGEMENT_WEB_ENABLED: undefined,
			ENVSYNC_SINGLE_ORG_MODE: "false",
			ENVSYNC_LICENSE_ENFORCEMENT: "true",
		});

		expect(EditionPolicyService.isOss()).toBe(true);
		expect(EditionPolicyService.isManagementEnabled()).toBe(false);
		expect(EditionPolicyService.isLandingEnabled()).toBe(false);
		expect(EditionPolicyService.isManagementWebEnabled()).toBe(false);
		expect(EditionPolicyService.isSingleOrgMode()).toBe(true);
		expect(EditionPolicyService.requiresEnterpriseLicense()).toBe(false);
	});

	test("uses enterprise defaults when enterprise toggles are unset", () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "enterprise",
			ENVSYNC_MANAGEMENT_ENABLED: undefined,
			ENVSYNC_LANDING_ENABLED: undefined,
			ENVSYNC_MANAGEMENT_WEB_ENABLED: undefined,
			ENVSYNC_LICENSE_ENFORCEMENT: "false",
		});

		expect(EditionPolicyService.isEnterprise()).toBe(true);
		expect(EditionPolicyService.isManagementEnabled()).toBe(true);
		expect(EditionPolicyService.isLandingEnabled()).toBe(true);
		expect(EditionPolicyService.isManagementWebEnabled()).toBe(true);
		expect(EditionPolicyService.requiresEnterpriseLicense()).toBe(false);
	});

	test("honors explicit overrides for OSS deployments", () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "oss",
			ENVSYNC_MANAGEMENT_ENABLED: "true",
			ENVSYNC_LANDING_ENABLED: "true",
			ENVSYNC_MANAGEMENT_WEB_ENABLED: "true",
			ENVSYNC_SINGLE_ORG_MODE: "false",
		});

		expect(EditionPolicyService.isManagementEnabled()).toBe(true);
		expect(EditionPolicyService.isLandingEnabled()).toBe(true);
		expect(EditionPolicyService.isManagementWebEnabled()).toBe(true);
		expect(EditionPolicyService.isSingleOrgMode()).toBe(true);
	});
});
