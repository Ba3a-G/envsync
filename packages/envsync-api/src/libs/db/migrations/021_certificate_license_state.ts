import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS validation_mode text DEFAULT 'lease'`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS certificate_serial_hex text`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS certificate_fingerprint_sha256 text`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS certificate_subject text`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS certificate_issuer text`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS certificate_expires_at timestamptz`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS root_ca_fingerprint_sha256 text`.execute(db);
	await sql`ALTER TABLE license_state ADD COLUMN IF NOT EXISTS validated_at timestamptz`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS validated_at`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS root_ca_fingerprint_sha256`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS certificate_expires_at`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS certificate_issuer`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS certificate_subject`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS certificate_fingerprint_sha256`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS certificate_serial_hex`.execute(db);
	await sql`ALTER TABLE license_state DROP COLUMN IF EXISTS validation_mode`.execute(db);
}
