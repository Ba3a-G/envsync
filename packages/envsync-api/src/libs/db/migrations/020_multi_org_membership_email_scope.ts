import { Kysely } from "kysely";

import { type Database } from "@/types/db";

export async function up(db: Kysely<Database>): Promise<void> {
	await db.schema.alterTable("users").dropConstraint("uq_users_email").execute();
	await db.schema
		.alterTable("users")
		.addUniqueConstraint("uq_users_org_id_email", ["org_id", "email"])
		.execute();
	await db.schema.createIndex("users_auth_service_id_idx").on("users").column("auth_service_id").execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
	await db.schema.dropIndex("users_auth_service_id_idx").execute();
	await db.schema.alterTable("users").dropConstraint("uq_users_org_id_email").execute();
	await db.schema.alterTable("users").addUniqueConstraint("uq_users_email", ["email"]).execute();
}
