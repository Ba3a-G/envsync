import { ensureUbuntuSupport, installK3sIfNeeded, verifyK3s } from "@/lib/k3s";
import { hasCommand, runCommand } from "@/lib/shell";

const requiredTools = ["curl", "git", "tar", "gzip", "openssl"];

export async function preinstall(): Promise<void> {
	ensureUbuntuSupport();

	for (const tool of requiredTools) {
		if (!hasCommand(tool)) {
			throw new Error(`Missing required system tool: ${tool}`);
		}
	}

	installK3sIfNeeded();

	if (!hasCommand("kubectl")) {
		runCommand("bash", ["-lc", "sudo ln -sf /usr/local/bin/k3s /usr/local/bin/kubectl"]);
	}

	if (!hasCommand("helm")) {
		runCommand("bash", ["-lc", "curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"]);
	}

	verifyK3s();
	console.log("Preinstall complete. k3s, kubectl, and helm are ready.");
}
