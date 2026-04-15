import path from "node:path";

import { getUiHarnessConfig, type UiRole } from "../e2e/helpers/config";

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const apiCliPath = path.resolve(repoRoot, "packages/envsync-api/scripts/cli.ts");
const roleOrder: UiRole[] = ["master", "admin", "editor", "viewer"];

function runSeedCommand(args: string[]) {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", apiCliPath, "create-dev-user", ...args],
		cwd: repoRoot,
		env: process.env,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (proc.exitCode !== 0) {
		throw new Error(`UI seed command failed: bun run ${path.relative(repoRoot, apiCliPath)} create-dev-user ${args.join(" ")}`);
	}
}

const uiConfig = getUiHarnessConfig();
for (const role of roleOrder) {
	const credential = uiConfig.roleCredentials[role];
	const args = [
		credential.email,
		credential.fullName,
		"--role",
		credential.seedRole,
	];
	if (role === "master") {
		args.push("--seed");
	}
	runSeedCommand(args);
}
