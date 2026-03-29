import fs from "node:fs";

import { resolveContext } from "@/lib/fs";
import { gatherHealth } from "@/lib/health";
import { parseSimpleYaml } from "@/lib/yaml";

export async function health(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const ctx = resolveContext(installPath);
	const installConfig = parseSimpleYaml(fs.readFileSync(ctx.installConfigPath, "utf8"));
	const tlsMode = installConfig.tlsMode || "acme";
	const checks = await gatherHealth(installConfig.rootDomain, {
		scheme: tlsMode === "disabled" ? "http" : "https",
		expectCertificates: tlsMode === "acme",
	});
	const asJson = Boolean(flags.json);

	if (asJson) {
		console.log(JSON.stringify(checks, null, 2));
	} else {
		console.table(checks);
	}

	if (checks.some(check => !check.ok)) {
		process.exitCode = 1;
	}
}
