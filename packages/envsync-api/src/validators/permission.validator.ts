import z from "zod";
import "zod-openapi/extend";

const subjectTypeSchema = z.enum(["user", "team"]).openapi({ example: "user" });
const accessRelationSchema = z.enum(["admin", "editor", "viewer"]).openapi({ example: "editor" });
const accessSourceSchema = z.enum(["org", "direct", "team"]).openapi({ example: "org" });

export const grantAccessRequestBodySchema = z
	.object({
		subject_id: z.string().openapi({ example: "user_123" }),
		subject_type: subjectTypeSchema,
		relation: accessRelationSchema,
	})
	.openapi({ ref: "GrantAccessRequest" });

export const revokeAccessRequestBodySchema = z
	.object({
		subject_id: z.string().openapi({ example: "user_123" }),
		subject_type: subjectTypeSchema,
		relation: accessRelationSchema,
	})
	.openapi({ ref: "RevokeAccessRequest" });

export const permissionMessageResponseSchema = z
	.object({
		message: z.string().openapi({ example: "Access granted successfully" }),
	})
	.openapi({ ref: "PermissionMessageResponse" });

export const grantEntrySchema = z
	.object({
		subject_id: z.string().openapi({ example: "user_123" }),
		subject_type: subjectTypeSchema,
		relation: accessRelationSchema,
	})
	.openapi({ ref: "GrantEntry" });

export const grantsListResponseSchema = z
	.array(grantEntrySchema)
	.openapi({ ref: "GrantsListResponse" });

export const effectiveAccessEntrySchema = z
	.object({
		user_id: z.string().openapi({ example: "user_123" }),
		email: z.string().email().openapi({ example: "member@example.com" }),
		relation: accessRelationSchema.nullable().openapi({ example: "admin" }),
		org_relation: accessRelationSchema.nullable().openapi({ example: "admin" }),
		direct_relation: accessRelationSchema.nullable().openapi({ example: "editor" }),
		team_relation: accessRelationSchema.nullable().openapi({ example: "viewer" }),
		sources: z.array(accessSourceSchema).openapi({ example: ["org", "team"] }),
		teams: z.array(z.string().openapi({ example: "Platform Team" })).openapi({ example: ["Platform Team"] }),
	})
	.openapi({ ref: "EffectiveAccessEntry" });

export const effectiveAccessResponseSchema = z
	.array(effectiveAccessEntrySchema)
	.openapi({ ref: "EffectiveAccessResponse" });

export const effectivePermissionsResponseSchema = z
	.object({
		can_view: z.boolean(),
		can_edit: z.boolean(),
		have_api_access: z.boolean(),
		have_billing_options: z.boolean(),
		have_webhook_access: z.boolean(),
		is_admin: z.boolean(),
		is_master: z.boolean(),
		can_manage_roles: z.boolean(),
		can_manage_users: z.boolean(),
		can_manage_apps: z.boolean(),
		can_manage_api_keys: z.boolean(),
		can_manage_webhooks: z.boolean(),
		can_view_audit_logs: z.boolean(),
		can_manage_org_settings: z.boolean(),
		can_manage_invites: z.boolean(),
	})
	.openapi({ ref: "EffectivePermissionsResponse" });
