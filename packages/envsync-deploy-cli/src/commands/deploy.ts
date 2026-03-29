import fs from "node:fs";

import { resolveAssets } from "@/lib/assets";
import { helmDeps, helmUpgradeInstall } from "@/lib/helm";
import { resolveContext } from "@/lib/fs";
import { ensureHostsEntries } from "@/lib/hosts";
import { ensureNamespace, waitForDeployment } from "@/lib/kubectl";
import { runCommand } from "@/lib/shell";
import { parseSimpleYaml } from "@/lib/yaml";

export async function deploy(flags: Record<string, string | boolean>): Promise<void> {
	const installPath = String(flags["install-path"] || "/opt/envsync");
	const ctx = resolveContext(installPath);

	if (!fs.existsSync(ctx.installConfigPath)) {
		throw new Error("Run `setup` before `deploy`.");
	}

	const installConfig = parseSimpleYaml(fs.readFileSync(ctx.installConfigPath, "utf8"));
	const source = (installConfig.assetSource || "bundle") as "bundle" | "repo";
	const assets = resolveAssets(ctx, source, undefined, installConfig.repoRef);
	const profile = installConfig.profile || "single-node";
	const tlsMode = installConfig.tlsMode || "acme";
	const scheme = tlsMode === "disabled" ? "http" : "https";

	ensureNamespace("envsync");

	runCommand("helm", [
		"repo",
		"add",
		"ingress-nginx",
		"https://kubernetes.github.io/ingress-nginx",
	], { allowFailure: true });
	if (tlsMode === "acme") {
		runCommand("helm", [
			"repo",
			"add",
			"jetstack",
			"https://charts.jetstack.io",
		], { allowFailure: true });
	}
	runCommand("helm", ["repo", "update"]);

	runCommand("helm", [
		"upgrade",
		"--install",
		"ingress-nginx",
		"ingress-nginx/ingress-nginx",
		"--namespace",
		"ingress-nginx",
		"--create-namespace",
		"--set",
		"controller.service.type=LoadBalancer",
	]);

	if (tlsMode === "acme") {
		runCommand("helm", [
			"upgrade",
			"--install",
			"cert-manager",
			"jetstack/cert-manager",
			"--namespace",
			"cert-manager",
			"--create-namespace",
			"--set",
			"crds.enabled=true",
		]);

		runCommand("bash", [
			"-lc",
			`cat <<'EOF' | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: ${installConfig.adminEmail}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF`,
		]);
	}

	helmDeps(assets.chartDir);
	helmUpgradeInstall(ctx, assets, ctx.runtimeValuesPath, profile);

	if (profile === "e2e") {
		ensureHostsEntries([
			`api.${installConfig.rootDomain}`,
			`auth.${installConfig.rootDomain}`,
			`app.${installConfig.rootDomain}`,
			String(installConfig.rootDomain),
		]);
	}

	for (const deployment of [
		"envsync-api",
		"envsync-zitadel",
		"envsync-openfga",
		"envsync-minikms",
		"envsync-rustfs",
		"envsync-web",
		"envsync-landing",
	]) {
		waitForDeployment("envsync", deployment, "15m");
	}

	console.log(`Deployment complete.
API: ${scheme}://api.${installConfig.rootDomain}
Dashboard: ${scheme}://app.${installConfig.rootDomain}
Landing: ${scheme}://${installConfig.rootDomain}
Auth: ${scheme}://auth.${installConfig.rootDomain}`);
}
