import fs from "node:fs";

import { createBackup } from "@/lib/backup";
import { resolveAssets } from "@/lib/assets";
import { resolveContext } from "@/lib/fs";
import { gatherHealth } from "@/lib/health";
import { helmRollback, helmUpgradeInstall } from "@/lib/helm";
import { runCommand } from "@/lib/shell";
import { parseSimpleYaml } from "@/lib/yaml";

export async function upgrade(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const ctx = resolveContext(installPath);
	const installConfig = parseSimpleYaml(fs.readFileSync(ctx.installConfigPath, "utf8"));
	const assets = resolveAssets(ctx, (installConfig.assetSource || "bundle") as "bundle" | "repo", String(flags.version || "0.1.0"), installConfig.repoRef);
	const backupPath = createBackup(ctx);
	const tlsMode = installConfig.tlsMode || "acme";
	const profile = installConfig.profile || "single-node";

	try {
		helmUpgradeInstall(ctx, assets, ctx.runtimeValuesPath, profile, ["--set", `api.image.tag=${flags["api-tag"] || assets.manifest.version}`]);
		const checks = await gatherHealth(installConfig.rootDomain, {
			scheme: tlsMode === "disabled" ? "http" : "https",
			expectCertificates: tlsMode === "acme",
		});
		if (checks.some(check => !check.ok)) {
			throw new Error("Health gates failed after upgrade.");
		}
		console.log(`Upgrade complete. Backup: ${backupPath}`);
	} catch (error) {
		helmRollback();
		throw error;
	}
}
