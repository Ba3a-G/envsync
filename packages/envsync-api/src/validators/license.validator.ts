import z from "zod";

import "zod-openapi/extend";

export const licenseStateSchema = z.object({
	status: z.enum(["unknown", "active", "inactive", "expired", "error", "locked"]),
	lease_expires_at: z.coerce.date().nullable().optional(),
	last_verified_at: z.coerce.date().nullable().optional(),
	last_error_code: z.string().nullable().optional(),
	last_error_message: z.string().nullable().optional(),
	validation_mode: z.enum(["none", "lease", "certificate"]).nullable().optional(),
	certificate_serial_hex: z.string().nullable().optional(),
	certificate_fingerprint_sha256: z.string().nullable().optional(),
	certificate_subject: z.string().nullable().optional(),
	certificate_issuer: z.string().nullable().optional(),
	certificate_expires_at: z.coerce.date().nullable().optional(),
	root_ca_fingerprint_sha256: z.string().nullable().optional(),
	validated_at: z.coerce.date().nullable().optional(),
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
