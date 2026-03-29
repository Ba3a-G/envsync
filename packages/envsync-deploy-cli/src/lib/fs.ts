import fs from "node:fs";
import path from "node:path";

import type { CommandContext } from "./types";

export const DEFAULT_INSTALL_PATH = "/opt/envsync";

export function resolveContext(installPath = DEFAULT_INSTALL_PATH): CommandContext {
	const rootDir = path.resolve(installPath);
	const configDir = path.join(rootDir, "config");
	const backupsDir = path.join(rootDir, "backups");
	const releasesDir = path.join(rootDir, "releases");
	const sharedDir = path.join(rootDir, "shared");

	return {
		rootDir,
		configDir,
		backupsDir,
		releasesDir,
		sharedDir,
		installConfigPath: path.join(configDir, "install.yaml"),
		generatedSecretsPath: path.join(configDir, "generated-secrets.yaml"),
		runtimeValuesPath: path.join(configDir, "values.runtime.yaml"),
		manifestPath: path.join(configDir, "deploy-manifest.json"),
	};
}

export function ensureContextDirs(ctx: CommandContext): void {
	for (const dir of [ctx.rootDir, ctx.configDir, ctx.backupsDir, ctx.releasesDir, ctx.sharedDir]) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

export function readTextIfExists(filePath: string): string | undefined {
	if (!fs.existsSync(filePath)) {
		return undefined;
	}
	return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath: string, content: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
}
