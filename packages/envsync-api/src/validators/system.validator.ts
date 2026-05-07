import z from "zod";

import "zod-openapi/extend";

import { licenseStatusResponseSchema } from "@/validators/license.validator";

export const systemStatusStateSchema = z.object({
	edition: z.enum(["oss", "enterprise"]),
	single_org_mode: z.boolean(),
	management_enabled: z.boolean(),
	observability_enabled: z.boolean(),
	management_web_enabled: z.boolean(),
	landing_enabled: z.boolean(),
	first_bootstrap_completed_at: z.coerce.date().nullable().optional(),
	org_count: z.number(),
}).openapi({ ref: "SystemStatusState" });

export const systemStatusResponseSchema = z.object({
	system: systemStatusStateSchema,
	license: licenseStatusResponseSchema,
}).openapi({ ref: "SystemStatusResponse" });
