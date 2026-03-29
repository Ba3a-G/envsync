import fs from "node:fs";

import { writeInstallArtifacts } from "@/lib/config";
import { resolveContext } from "@/lib/fs";
import { prompt } from "@/lib/prompts";
import { generateSecrets } from "@/lib/secrets";
import type { AssetSource, InstallConfig, InstallProfile, ReleaseChannel, TlsMode } from "@/lib/types";
import { parseSimpleYaml } from "@/lib/yaml";

function parseAnswersFile(filePath: string): Record<string, string> {
	const text = fs.readFileSync(filePath, "utf8");
	if (filePath.endsWith(".json")) {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]),
		);
	}
	return parseSimpleYaml(text);
}

export async function setup(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const answers = flags["answers-file"]
		? parseAnswersFile(String(flags["answers-file"]))
		: {};
	const nonInteractive = Boolean(flags["non-interactive"]);
	const assetSource = String(flags.source || answers.source || "bundle") as AssetSource;
	const releaseChannel = String(flags.channel || answers.channel || "stable") as ReleaseChannel;
	const profile = String(flags.profile || answers.profile || "single-node") as InstallProfile;
	const tlsMode = String(
		flags["tls-mode"]
		|| answers["tls-mode"]
		|| (profile === "e2e" ? "disabled" : "acme"),
	) as TlsMode;

	const rootDomain = String(
		flags.domain
		|| answers.domain
		|| (nonInteractive ? "envsync.test" : await prompt("Root domain")),
	);
	const adminEmail = String(
		flags.email
		|| answers.email
		|| (nonInteractive ? "admin@envsync.test" : await prompt("Admin email for Let's Encrypt")),
	);
	const repoRef = assetSource === "repo"
		? String(
			flags.ref
			|| answers.ref
			|| (nonInteractive ? "main" : await prompt("Repo ref", "main")),
		)
		: undefined;

	const config: InstallConfig = {
		rootDomain,
		adminEmail,
		installPath,
		releaseChannel,
		assetSource,
		profile,
		tlsMode,
		repoRef,
		namespace: "envsync",
		releaseName: "envsync",
	};

	const ctx = resolveContext(installPath);
	const secrets = generateSecrets();
	writeInstallArtifacts(config, secrets);

	console.log(`Setup complete.
Install path: ${ctx.rootDir}
Config: ${ctx.installConfigPath}
Runtime values: ${ctx.runtimeValuesPath}
Secrets: ${ctx.generatedSecretsPath}`);
}
