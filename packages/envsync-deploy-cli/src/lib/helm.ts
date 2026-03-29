import path from "node:path";

import { runCommand } from "./shell";
import type { ResolvedAssets } from "./assets";
import type { CommandContext } from "./types";

export function helmDeps(chartDir: string): void {
	runCommand("helm", ["dependency", "build", chartDir]);
}

export function helmUpgradeInstall(
	ctx: CommandContext,
	assets: ResolvedAssets,
	runtimeValuesPath: string,
	profile = "single-node",
	additionalArgs: string[] = [],
): void {
	const profileValues = path.join(
		assets.chartDir,
		profile === "e2e" ? "values-selfhosted-e2e.yaml" : "values-selfhosted-single-node.yaml",
	);
	runCommand("helm", [
		"upgrade",
		"--install",
		"envsync",
		assets.chartDir,
		"--namespace",
		"envsync",
		"--create-namespace",
		"-f",
		profileValues,
		"-f",
		runtimeValuesPath,
		"--wait",
		"--timeout",
		"20m",
		...additionalArgs,
	]);
}

export function helmRollback(namespace = "envsync", release = "envsync"): void {
	runCommand("helm", ["rollback", release, "--namespace", namespace]);
}
