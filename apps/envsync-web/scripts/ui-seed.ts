import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const apiCliPath = path.resolve(repoRoot, "packages/envsync-api/scripts/cli.ts");
const seededOrgSlug = process.env.ENVSYNC_UI_ORG_SLUG ?? `envsync-ui-${Date.now()}`;
const seededOrgName = process.env.ENVSYNC_UI_ORG_NAME ?? `EnvSync UI ${seededOrgSlug.slice("envsync-ui-".length)}`;

function runSeedCommand(command: string, args: string[]) {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", apiCliPath, command, ...args],
		cwd: repoRoot,
		env: process.env,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (proc.exitCode !== 0) {
		throw new Error(`UI seed command failed: bun run ${path.relative(repoRoot, apiCliPath)} ${command} ${args.join(" ")}`);
	}
}

runSeedCommand("bootstrap-ui-harness", [
	"--org-slug",
	seededOrgSlug,
	"--org-name",
	seededOrgName,
]);
