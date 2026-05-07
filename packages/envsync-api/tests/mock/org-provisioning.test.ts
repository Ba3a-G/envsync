import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { cleanupDB, seedOrg } from "../helpers/db";
import { OrgProvisioningService } from "@/services/org-provisioning.service";
import { config } from "@/utils/env";

const originalConfig = {
	ENVSYNC_EDITION: config.ENVSYNC_EDITION,
	ENVSYNC_SINGLE_ORG_MODE: config.ENVSYNC_SINGLE_ORG_MODE,
};

beforeEach(async () => {
	await cleanupDB();
});

afterEach(() => {
	Object.assign(config, originalConfig);
});

describe("OrgProvisioningService.assertProvisioningAllowed", () => {
	test("allows the first organization in OSS mode", async () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "oss",
			ENVSYNC_SINGLE_ORG_MODE: "false",
		});

		await expect(OrgProvisioningService.assertProvisioningAllowed()).resolves.toBeUndefined();
	});

	test("rejects a second organization in OSS mode", async () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "oss",
			ENVSYNC_SINGLE_ORG_MODE: "false",
		});
		await seedOrg();

		await expect(OrgProvisioningService.assertProvisioningAllowed()).rejects.toMatchObject({
			code: "OSS_SINGLE_ORG_LIMIT_REACHED",
			statusCode: 409,
		});
	});

	test("allows multi-org provisioning in enterprise mode", async () => {
		Object.assign(config, {
			ENVSYNC_EDITION: "enterprise",
			ENVSYNC_SINGLE_ORG_MODE: "false",
		});
		await seedOrg();

		await expect(OrgProvisioningService.assertProvisioningAllowed()).resolves.toBeUndefined();
	});
});
