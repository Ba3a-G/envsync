import { runCommand } from "./shell";

export function ensureNamespace(namespace: string): void {
	runCommand("kubectl", ["create", "namespace", namespace, "--dry-run=client", "-o", "yaml"], {
		capture: true,
	});
	runCommand("bash", [
		"-lc",
		`kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`,
	]);
}

export function waitForDeployment(namespace: string, name: string, timeout = "10m"): void {
	runCommand("kubectl", [
		"-n",
		namespace,
		"rollout",
		"status",
		`deployment/${name}`,
		"--timeout",
		timeout,
	]);
}

export function waitForJob(namespace: string, name: string, timeout = "15m"): void {
	runCommand("kubectl", ["-n", namespace, "wait", "--for=condition=complete", `job/${name}`, "--timeout", timeout]);
}
