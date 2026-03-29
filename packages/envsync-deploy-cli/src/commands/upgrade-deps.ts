import fs from "node:fs";

import { createBackup } from "@/lib/backup";
import { resolveAssets } from "@/lib/assets";
import { resolveContext } from "@/lib/fs";
import { gatherHealth } from "@/lib/health";
import { helmUpgradeInstall } from "@/lib/helm";
import { parseSimpleYaml } from "@/lib/yaml";

export async function upgradeDeps(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const ctx = resolveContext(installPath);
	const installConfig = parseSimpleYaml(fs.readFileSync(ctx.installConfigPath, "utf8"));
	const assets = resolveAssets(ctx, (installConfig.assetSource || "bundle") as "bundle" | "repo", String(flags.version || "0.1.0"), installConfig.repoRef);
	const backupPath = createBackup(ctx);
	const tlsMode = installConfig.tlsMode || "acme";
	const profile = installConfig.profile || "single-node";

	helmUpgradeInstall(ctx, assets, ctx.runtimeValuesPath, profile, [
		"--set",
		`web.image.tag=${flags["web-tag"] || assets.manifest.version}`,
		"--set",
		`landing.image.tag=${flags["landing-tag"] || assets.manifest.version}`,
	]);

	const checks = await gatherHealth(installConfig.rootDomain, {
		scheme: tlsMode === "disabled" ? "http" : "https",
		expectCertificates: tlsMode === "acme",
	});
	if (checks.some(check => !check.ok)) {
		throw new Error(`Dependency upgrade failed health checks. Backup: ${backupPath}`);
	}

	console.log(`Dependency upgrade complete. Backup: ${backupPath}`);
}
