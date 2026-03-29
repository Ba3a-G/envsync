import { confirm } from "@/lib/prompts";
import { resolveContext } from "@/lib/fs";
import { restoreBackup } from "@/lib/restore";

export async function restore(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const file = String(flags.file || "");
	if (!file) {
		throw new Error("`restore` requires --file <backup.tar.gz>");
	}

	if (!flags.yes) {
		const ok = await confirm(`Restore ${file}? This will overwrite cluster state.`, false);
		if (!ok) {
			console.log("Restore cancelled.");
			return;
		}
	}

	const ctx = resolveContext(installPath);
	const restoreDir = restoreBackup(ctx, file);
	console.log(`Restore complete from ${restoreDir}`);
}
