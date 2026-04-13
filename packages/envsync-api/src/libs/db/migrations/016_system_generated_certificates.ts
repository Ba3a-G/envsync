import { type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
		.alterTable("org_certificates")
		.addColumn("cert_pem", "text")
		.addColumn("is_system_generated", "boolean", (col) => col.notNull().defaultTo(false))
		.addColumn("encrypted_key_pem", "text")
		.execute();

	await db.schema
		.createIndex("idx_org_certificates_member_lookup")
		.on("org_certificates")
		.columns(["org_id", "user_id", "cert_type", "is_system_generated", "status", "created_at"])
		.execute();
}

export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropIndex("idx_org_certificates_member_lookup").execute();
	await db.schema
		.alterTable("org_certificates")
		.dropColumn("encrypted_key_pem")
		.dropColumn("is_system_generated")
		.dropColumn("cert_pem")
		.execute();
}
