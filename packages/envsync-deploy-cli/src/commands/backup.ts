import { createBackup } from "@/lib/backup";
import { resolveContext } from "@/lib/fs";

export async function backup(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const ctx = resolveContext(installPath);
	const archivePath = createBackup(ctx, typeof flags.output === "string" ? flags.output : undefined);
	console.log(archivePath);
}
