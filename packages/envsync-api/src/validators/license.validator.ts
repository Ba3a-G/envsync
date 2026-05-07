import z from "zod";

import "zod-openapi/extend";

export const licenseStateSchema = z.object({
	status: z.enum(["unknown", "active", "inactive", "expired", "error", "locked"]),
	lease_expires_at: z.coerce.date().nullable().optional(),
	last_verified_at: z.coerce.date().nullable().optional(),
	last_error_code: z.string().nullable().optional(),
	last_error_message: z.string().nullable().optional(),
}).openapi({ ref: "LicenseState" });

export const licenseStatusResponseSchema = z.object({
	required: z.boolean(),
	locked: z.boolean(),
	reason: z.string().nullable().optional(),
	state: licenseStateSchema,
}).openapi({ ref: "LicenseStatusResponse" });

export const licenseActionResponseSchema = z.object({
	message: z.string(),
	state: licenseStateSchema,
}).openapi({ ref: "LicenseActionResponse" });
