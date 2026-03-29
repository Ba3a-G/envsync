import os from "node:os";

import { hasCommand, runCommand } from "./shell";

export function ensureUbuntuSupport(): void {
	if (os.platform() !== "linux") {
		throw new Error("Self-hosted install currently supports Linux hosts only.");
	}
}

export function installK3sIfNeeded(): void {
	if (hasCommand("k3s")) {
		return;
	}
	runCommand("bash", ["-lc", "curl -sfL https://get.k3s.io | sh -s - --write-kubeconfig-mode 644"]);
}

export function verifyK3s(): void {
	runCommand("kubectl", ["get", "nodes"]);
}
