import path from "node:path";

import { ensureRoleStorageState, waitForUiServices } from "../e2e/helpers/auth";
import type { UiRole } from "../e2e/helpers/config";

const rawRole = process.argv[2] as UiRole | "all" | undefined;
const role = rawRole ?? "master";

await waitForUiServices();

if (role === "all") {
	for (const nextRole of ["master", "admin", "editor", "viewer"] satisfies UiRole[]) {
		console.log(`[ui-login] ensuring ${nextRole} session`);
		const proc = Bun.spawnSync({
			cmd: ["bun", "run", path.resolve(import.meta.dir, "ui-login.ts"), nextRole],
			cwd: path.resolve(import.meta.dir, ".."),
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, ENVSYNC_UI_SUPPRESS_ROLE_LOG: "1" },
		});
		if (proc.exitCode !== 0) {
			throw new Error(`Failed to create ${nextRole} browser session`);
		}
	}
} else {
	if (process.env.ENVSYNC_UI_SUPPRESS_ROLE_LOG !== "1") {
		console.log(`[ui-login] ensuring ${role} session`);
	}
	await ensureRoleStorageState(role);
}
