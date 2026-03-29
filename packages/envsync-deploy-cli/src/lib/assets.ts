import fs from "node:fs";
import path from "node:path";

import { defaultReleaseManifest } from "./release-manifest";
import { runCommand } from "./shell";
import type { AssetSource, CommandContext, ReleaseManifest } from "./types";

const repoRoot = path.resolve(import.meta.dir, "../../../../");
const rootManifestPath = path.join(repoRoot, "deploy/deploy-manifest.json");

export interface ResolvedAssets {
	releaseDir: string;
	chartDir: string;
	manifest: ReleaseManifest;
}

export function resolveAssets(
	ctx: CommandContext,
	source: AssetSource,
	version = defaultReleaseManifest.version,
	repoRef?: string,
): ResolvedAssets {
	const releaseDir = path.join(ctx.releasesDir, version);
	fs.mkdirSync(releaseDir, { recursive: true });

	if (source === "repo") {
		const cloneDir = path.join(releaseDir, "repo");
		if (!fs.existsSync(cloneDir)) {
			runCommand("git", ["clone", repoRoot, cloneDir]);
			if (repoRef) {
				runCommand("git", ["checkout", repoRef], { cwd: cloneDir });
			}
		}

		return {
			releaseDir: cloneDir,
			chartDir: path.join(cloneDir, "helm/envsync"),
			manifest: defaultReleaseManifest,
		};
	}

	const bundleDir = path.join(releaseDir, "bundle");
	const bundleChartDir = path.join(bundleDir, "helm/envsync");

	if (!fs.existsSync(bundleChartDir)) {
		runCommand("mkdir", ["-p", path.join(bundleDir, "helm")]);
		runCommand("cp", ["-R", path.join(repoRoot, "helm/envsync"), bundleChartDir]);
	}

	const manifestPath = path.join(bundleDir, "deploy-manifest.json");
	if (!fs.existsSync(manifestPath)) {
		if (fs.existsSync(rootManifestPath)) {
			runCommand("cp", [rootManifestPath, manifestPath]);
		} else {
			fs.writeFileSync(manifestPath, `${JSON.stringify(defaultReleaseManifest, null, 2)}\n`);
		}
	}

	return {
		releaseDir: bundleDir,
		chartDir: bundleChartDir,
		manifest: defaultReleaseManifest,
	};
}
