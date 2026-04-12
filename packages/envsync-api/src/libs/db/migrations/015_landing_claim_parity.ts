import { type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable("teams")
		.addColumn("role_id", "text", (col) =>
			col.references("org_role.id").onDelete("set null"),
		)
		.execute();

	await db.schema
		.alterTable("gpg_keys")
		.addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
		.addColumn("supersedes_gpg_key_id", "text", (col) =>
			col.references("gpg_keys.id").onDelete("set null"),
		)
		.execute();

	await db.schema
		.alterTable("org_certificates")
		.addColumn("supersedes_certificate_id", "text", (col) =>
			col.references("org_certificates.id").onDelete("set null"),
		)
		.execute();

	await db.schema
		.createTable("change_request")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("org_id", "text", (col) =>
			col.notNull().references("orgs.id").onDelete("cascade"),
		)
		.addColumn("app_id", "text", (col) =>
			col.notNull().references("app.id").onDelete("cascade"),
		)
		.addColumn("request_kind", "text", (col) => col.notNull())
		.addColumn("source_env_type_id", "text", (col) =>
			col.references("env_type.id").onDelete("set null"),
		)
		.addColumn("target_env_type_id", "text", (col) =>
			col.notNull().references("env_type.id").onDelete("cascade"),
		)
		.addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
		.addColumn("title", "text", (col) => col.notNull())
		.addColumn("message", "text", (col) => col.notNull())
		.addColumn("requested_by_user_id", "text", (col) =>
			col.notNull().references("users.id").onDelete("cascade"),
		)
		.addColumn("reviewed_by_user_id", "text", (col) =>
			col.references("users.id").onDelete("set null"),
		)
		.addColumn("reviewed_at", "timestamptz")
		.addColumn("applied_at", "timestamptz")
		.addColumn("rejection_reason", "text")
		.addColumn("created_at", "timestamptz", (col) => col.notNull())
		.addColumn("updated_at", "timestamptz", (col) => col.notNull())
		.execute();

	await db.schema
		.createIndex("idx_change_request_target_status")
		.on("change_request")
		.columns(["target_env_type_id", "status"])
		.execute();

	await db.schema
		.createTable("change_request_env_item")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("change_request_id", "text", (col) =>
			col.notNull().references("change_request.id").onDelete("cascade"),
		)
		.addColumn("key", "text", (col) => col.notNull())
		.addColumn("previous_value", "text")
		.addColumn("proposed_value", "text")
		.addColumn("operation", "text", (col) => col.notNull())
		.addColumn("created_at", "timestamptz", (col) => col.notNull())
		.addColumn("updated_at", "timestamptz", (col) => col.notNull())
		.execute();

	await db.schema
		.createTable("change_request_secret_item")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("change_request_id", "text", (col) =>
			col.notNull().references("change_request.id").onDelete("cascade"),
		)
		.addColumn("key", "text", (col) => col.notNull())
		.addColumn("previous_value", "text")
		.addColumn("proposed_value", "text")
		.addColumn("operation", "text", (col) => col.notNull())
		.addColumn("created_at", "timestamptz", (col) => col.notNull())
		.addColumn("updated_at", "timestamptz", (col) => col.notNull())
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable("change_request_secret_item").execute();
	await db.schema.dropTable("change_request_env_item").execute();
	await db.schema.dropIndex("idx_change_request_target_status").execute();
	await db.schema.dropTable("change_request").execute();
	await db.schema.alterTable("org_certificates").dropColumn("supersedes_certificate_id").execute();
	await db.schema
		.alterTable("gpg_keys")
		.dropColumn("supersedes_gpg_key_id")
		.dropColumn("status")
		.execute();
	await db.schema.alterTable("teams").dropColumn("role_id").execute();
}
