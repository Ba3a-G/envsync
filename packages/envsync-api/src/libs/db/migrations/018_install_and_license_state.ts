import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.createTable("install_state")
		.ifNotExists()
		.addColumn("id", "text", col => col.primaryKey())
		.addColumn("edition", "text", col => col.notNull().defaultTo("enterprise"))
		.addColumn("first_bootstrap_completed_at", "timestamptz")
		.addColumn("single_org_mode", "boolean", col => col.notNull().defaultTo(false))
		.addColumn("management_enabled", "boolean", col => col.notNull().defaultTo(true))
		.addColumn("observability_enabled", "boolean", col => col.notNull().defaultTo(true))
		.addColumn("management_web_enabled", "boolean", col => col.notNull().defaultTo(true))
		.addColumn("landing_enabled", "boolean", col => col.notNull().defaultTo(true))
		.addColumn("created_at", "timestamptz", col => col.notNull())
		.addColumn("updated_at", "timestamptz", col => col.notNull())
		.execute();

	await db.schema
		.createTable("license_state")
		.ifNotExists()
		.addColumn("id", "text", col => col.primaryKey())
		.addColumn("status", "text", col => col.notNull().defaultTo("unknown"))
		.addColumn("signed_lease", "text")
		.addColumn("lease_expires_at", "timestamptz")
		.addColumn("fingerprint", "text")
		.addColumn("last_verified_at", "timestamptz")
		.addColumn("last_error_code", "text")
		.addColumn("last_error_message", "text")
		.addColumn("created_at", "timestamptz", col => col.notNull())
		.addColumn("updated_at", "timestamptz", col => col.notNull())
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable("license_state").ifExists().execute();
	await db.schema.dropTable("install_state").ifExists().execute();
}
