import { randomBytes } from "node:crypto";

import type { GeneratedSecrets } from "./types";

function randHex(bytes: number): string {
	return randomBytes(bytes).toString("hex");
}

function randBase64(bytes: number): string {
	return randomBytes(bytes).toString("base64").replace(/[+/=]/g, "").slice(0, bytes * 2);
}

function password(length = 24): string {
	const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
	const lower = "abcdefghijkmnopqrstuvwxyz";
	const digits = "23456789";
	const symbols = "!@#$%&*";
	const chars = `${upper}${lower}${digits}${symbols}`;
	const required = [
		upper[randomBytes(1)[0] % upper.length],
		lower[randomBytes(1)[0] % lower.length],
		digits[randomBytes(1)[0] % digits.length],
		symbols[randomBytes(1)[0] % symbols.length],
	];
	const remaining = Math.max(length - required.length, 0);
	const passwordChars = [
		...required,
		...Array.from(randomBytes(remaining)).map(byte => chars[byte % chars.length]),
	];

	for (let index = passwordChars.length - 1; index > 0; index -= 1) {
		const swapIndex = randomBytes(1)[0] % (index + 1);
		[passwordChars[index], passwordChars[swapIndex]] = [passwordChars[swapIndex], passwordChars[index]];
	}

	return passwordChars.join("");
}

export function generateSecrets(existing?: Partial<GeneratedSecrets>): GeneratedSecrets {
	return {
		postgresPassword: existing?.postgresPassword ?? password(24),
		appDatabasePassword: existing?.appDatabasePassword ?? password(24),
		postgresReplicationPassword: existing?.postgresReplicationPassword ?? password(24),
		zitadelMasterkey: existing?.zitadelMasterkey ?? randHex(16),
		zitadelAdminPassword: existing?.zitadelAdminPassword ?? password(24),
		zitadelDatabasePassword: existing?.zitadelDatabasePassword ?? password(24),
		openfgaDatabasePassword: existing?.openfgaDatabasePassword ?? password(24),
		minikmsDatabasePassword: existing?.minikmsDatabasePassword ?? password(24),
		minikmsRootKey: existing?.minikmsRootKey ?? randHex(32),
		rustfsAccessKey: existing?.rustfsAccessKey ?? "envsyncadmin",
		rustfsSecretKey: existing?.rustfsSecretKey ?? randBase64(24),
	};
}
