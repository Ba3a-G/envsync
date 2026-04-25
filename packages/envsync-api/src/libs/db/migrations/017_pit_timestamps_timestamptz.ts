import { sql, type Kysely } from "kysely";

const PIT_TIMESTAMP_COLUMNS = [
	["env_store_pit", "created_at"],
	["env_store_pit", "updated_at"],
	["env_store_pit_change_request", "created_at"],
	["secret_store_pit", "created_at"],
	["secret_store_pit", "updated_at"],
	["secret_store_pit_change_request", "created_at"],
] as const;

export async function up(db: Kysely<any>): Promise<void> {
	for (const [tableName, columnName] of PIT_TIMESTAMP_COLUMNS) {
		// PiT timestamps were historically written as UTC instants into `timestamp`
		// columns. Reinterpret those stored wall-clock values as UTC when converting.
		await sql.raw(
			`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE timestamptz USING "${columnName}" AT TIME ZONE 'UTC'`,
		).execute(db);
	}
}

export async function down(db: Kysely<any>): Promise<void> {
	for (const [tableName, columnName] of PIT_TIMESTAMP_COLUMNS) {
		await sql.raw(
			`ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" TYPE timestamp USING "${columnName}" AT TIME ZONE 'UTC'`,
		).execute(db);
	}
}
