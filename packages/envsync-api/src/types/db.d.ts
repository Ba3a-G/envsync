import type { ColumnType } from "kysely";

export interface BaseTable {
	id: ColumnType<string>;
	created_at: ColumnType<Date>;
	updated_at: ColumnType<Date>;
}

export interface InviteOrg extends BaseTable {
	email: ColumnType<string>;
	invite_token: ColumnType<string>;
	is_accepted: ColumnType<boolean>;
}

export interface InviteUser extends BaseTable {
	email: ColumnType<string>;
	role_id: ColumnType<string>;
	invite_token: ColumnType<string>;
	is_accepted: ColumnType<boolean>;
	org_id: ColumnType<string>;
}

export interface OrgRole extends BaseTable {
	org_id: ColumnType<string>;
	name: ColumnType<string>;
	is_admin: ColumnType<boolean>;
	can_view: ColumnType<boolean>;
	can_edit: ColumnType<boolean>;
	have_billing_options: ColumnType<boolean>;
	have_api_access: ColumnType<boolean>;
	have_webhook_access: ColumnType<boolean>;
	have_gpg_access: ColumnType<boolean>;
	have_cert_access: ColumnType<boolean>;
	have_audit_access: ColumnType<boolean>;
	color: ColumnType<string>;
	is_master?: ColumnType<boolean>;
}

export interface EnvStore extends BaseTable {
	org_id: ColumnType<string>;
	env_type_id: ColumnType<string>;
	app_id: ColumnType<string>;
	key: ColumnType<string>;
	value: ColumnType<string>;
}

export interface EnvStorePiT extends BaseTable {
	change_request_message: ColumnType<string>;
	org_id: ColumnType<string>;
	env_type_id: ColumnType<string>;
	user_id: ColumnType<string>;
	app_id: ColumnType<string>;
}

export interface EnvStorePiTChangeRequest extends BaseTable {
	env_store_pit_id: ColumnType<string>;
	key: ColumnType<string>;
	value: ColumnType<string>;
	operation: ColumnType<"CREATE" | "UPDATE" | "DELETE">;
}

export interface SecretStore extends BaseTable {
	org_id: ColumnType<string>;
	env_type_id: ColumnType<string>;
	app_id: ColumnType<string>;
	key: ColumnType<string>;
	value: ColumnType<string>;
}

export interface SecretStorePiT extends BaseTable {
	change_request_message: ColumnType<string>;
	org_id: ColumnType<string>;
	env_type_id: ColumnType<string>;
	user_id: ColumnType<string>;
	app_id: ColumnType<string>;
}

export interface SecretStorePiTChangeRequest extends BaseTable {
	secret_store_pit_id: ColumnType<string>;
	key: ColumnType<string>;
	value: ColumnType<string>;
	operation: ColumnType<"CREATE" | "UPDATE" | "DELETE">;
}

export interface AuditLog extends BaseTable {
	org_id: ColumnType<string>;
	user_id: ColumnType<string>;
	action: ColumnType<AuditActions | string>;
	details: ColumnType<string>;
	message: ColumnType<string>;
	previous_hash?: ColumnType<string | null>;
	entry_hash?: ColumnType<string | null>;
}

export interface App extends BaseTable {
	name: ColumnType<string>;
	org_id: ColumnType<string>;
	description: ColumnType<string>;
	enable_secrets: ColumnType<boolean>;
	is_managed_secret: ColumnType<boolean>;
	public_key?: ColumnType<string | null>;
	private_key?: ColumnType<string | null>;
	metadata: ColumnType<Record<string, any>>;
	kms_key_version_id?: ColumnType<string | null>;
	encryption_migrated?: ColumnType<boolean>;
}

export interface EnvType extends BaseTable {
	org_id: ColumnType<string>;
	name: ColumnType<string>;
	app_id: ColumnType<string>;
	is_default: ColumnType<boolean>;
	is_protected: ColumnType<boolean>;
	color: ColumnType<string>;
}

export interface Users extends BaseTable {
	email: ColumnType<string>;
	org_id: ColumnType<string>;
	role_id: ColumnType<string>;
	auth_service_id?: ColumnType<string | null>;
	full_name?: ColumnType<string | null>;
	profile_picture_url?: ColumnType<string | null>;
	last_login?: ColumnType<Date | null>;
	is_active: ColumnType<boolean>;
}

export interface Orgs extends BaseTable {
	name: ColumnType<string>;
	logo_url?: ColumnType<string | null>;
	slug: ColumnType<string>;
	size?: ColumnType<string | null>;
	website?: ColumnType<string | null>;
	metadata: ColumnType<Record<string, any>>;
}

export interface Settings extends BaseTable {
	user_id: ColumnType<string>;
	email_notifications: ColumnType<boolean>;
	theme?: ColumnType<string | null>;
}

export interface ApiKeys extends BaseTable {
	org_id: ColumnType<string>;
	user_id: ColumnType<string>;
	key: ColumnType<string>;
	description?: ColumnType<string | null>;
	is_active: ColumnType<boolean>;
	last_used_at?: ColumnType<Date | null>;
}

export interface WebhookStore extends BaseTable {
	name: ColumnType<string>;
	org_id: ColumnType<string>;
	user_id: ColumnType<string>;
	url: ColumnType<string>;
	event_types: ColumnType<string[]>;
	is_active: ColumnType<boolean>;
	webhook_type: ColumnType<"CUSTOM" | "DISCORD" | "SLACK">
	app_id?: ColumnType<string | null>;
	linked_to: ColumnType<"org" | "app">;
	last_triggered_at?: ColumnType<Date | null>;
}

export interface Team extends BaseTable {
	org_id: ColumnType<string>;
	name: ColumnType<string>;
	description?: ColumnType<string | null>;
	color: ColumnType<string>;
	role_id?: ColumnType<string | null>;
}

export interface TeamMember {
	id: ColumnType<string>;
	team_id: ColumnType<string>;
	user_id: ColumnType<string>;
	created_at: ColumnType<Date>;
}

export interface GpgKey extends BaseTable {
	org_id: ColumnType<string>;
	user_id: ColumnType<string>;
	name: ColumnType<string>;
	email: ColumnType<string>;
	fingerprint: ColumnType<string>;
	key_id: ColumnType<string>;
	algorithm: ColumnType<string>;
	key_size?: ColumnType<number | null>;
	public_key: ColumnType<string>;
	private_key_ref: ColumnType<string>;
	usage_flags: ColumnType<string[]>;
	trust_level: ColumnType<string>;
	expires_at?: ColumnType<Date | null>;
	revoked_at?: ColumnType<Date | null>;
	revocation_reason?: ColumnType<string | null>;
	is_default: ColumnType<boolean>;
	status: ColumnType<string>;
	supersedes_gpg_key_id?: ColumnType<string | null>;
}

export interface OrgCertificate extends BaseTable {
	org_id: ColumnType<string>;
	user_id: ColumnType<string>;
	serial_hex: ColumnType<string>;
	cert_type: ColumnType<string>;
	subject_cn: ColumnType<string>;
	subject_email?: ColumnType<string | null>;
	status: ColumnType<string>;
	not_before?: ColumnType<Date | null>;
	not_after?: ColumnType<Date | null>;
	description?: ColumnType<string | null>;
	metadata?: ColumnType<Record<string, string> | null>;
	revoked_at?: ColumnType<Date | null>;
	revocation_reason?: ColumnType<number | null>;
	supersedes_certificate_id?: ColumnType<string | null>;
}

export interface ChangeRequest extends BaseTable {
	org_id: ColumnType<string>;
	app_id: ColumnType<string>;
	request_kind: ColumnType<"direct" | "promotion">;
	source_env_type_id?: ColumnType<string | null>;
	target_env_type_id: ColumnType<string>;
	status: ColumnType<"pending" | "approved" | "rejected" | "cancelled">;
	title: ColumnType<string>;
	message: ColumnType<string>;
	requested_by_user_id: ColumnType<string>;
	reviewed_by_user_id?: ColumnType<string | null>;
	reviewed_at?: ColumnType<Date | null>;
	applied_at?: ColumnType<Date | null>;
	rejection_reason?: ColumnType<string | null>;
}

export interface ChangeRequestEnvItem extends BaseTable {
	change_request_id: ColumnType<string>;
	key: ColumnType<string>;
	previous_value?: ColumnType<string | null>;
	proposed_value?: ColumnType<string | null>;
	operation: ColumnType<"CREATE" | "UPDATE" | "DELETE">;
}

export interface ChangeRequestSecretItem extends BaseTable {
	change_request_id: ColumnType<string>;
	key: ColumnType<string>;
	previous_value?: ColumnType<string | null>;
	proposed_value?: ColumnType<string | null>;
	operation: ColumnType<"CREATE" | "UPDATE" | "DELETE">;
}

export interface BaseDatabase {
	invite_org: InviteOrg;
	invite_user: InviteUser;
	org_role: OrgRole;
	audit_log: AuditLog;
	app: App;
	env_type: EnvType;
	users: Users;
	orgs: Orgs;
	settings: Settings;
	api_keys: ApiKeys;
	env_store_pit: EnvStorePiT;
	env_store_pit_change_request: EnvStorePiTChangeRequest;
	secret_store_pit: SecretStorePiT;
	secret_store_pit_change_request: SecretStorePiTChangeRequest;
	webhook_store: WebhookStore;
	teams: Team;
	team_members: TeamMember;
	gpg_keys: GpgKey;
	org_certificates: OrgCertificate;
	change_request: ChangeRequest;
	change_request_env_item: ChangeRequestEnvItem;
	change_request_secret_item: ChangeRequestSecretItem;
}

/**
 * Private superset repos can augment this interface using declaration merging
 * to add enterprise-only tables without editing the public schema contract.
 */
export interface DatabaseExtensions {}

export interface Database extends BaseDatabase, DatabaseExtensions {}
