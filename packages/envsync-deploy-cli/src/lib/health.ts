import { runCommand } from "./shell";
import type { HealthCheckResult } from "./types";

export interface HealthOptions {
	scheme?: "http" | "https";
	expectCertificates?: boolean;
}

async function checkHttp(name: string, url: string): Promise<HealthCheckResult> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		return {
			name,
			ok: response.ok,
			details: `${response.status} ${response.statusText}`,
		};
	} catch (error) {
		return {
			name,
			ok: false,
			details: error instanceof Error ? error.message : "request failed",
		};
	}
}

export async function gatherHealth(rootDomain: string, options: HealthOptions = {}): Promise<HealthCheckResult[]> {
	const checks: HealthCheckResult[] = [];
	const scheme = options.scheme ?? "https";
	const expectCertificates = options.expectCertificates ?? true;

	const node = runCommand("kubectl", ["get", "nodes", "--no-headers"], { capture: true, allowFailure: true });
	checks.push({
		name: "node-ready",
		ok: node.status === 0 && node.stdout.includes(" Ready"),
		details: node.stdout.trim() || node.stderr.trim() || "no node output",
	});

	const pods = runCommand("kubectl", ["-n", "envsync", "get", "pods", "--no-headers"], { capture: true, allowFailure: true });
	checks.push({
		name: "pods-ready",
		ok: pods.status === 0 && !pods.stdout.split("\n").filter(Boolean).some(line => !line.includes("Running") && !line.includes("Completed")),
		details: pods.stdout.trim() || pods.stderr.trim() || "no pod output",
	});

	const pvc = runCommand("kubectl", ["-n", "envsync", "get", "pvc", "--no-headers"], { capture: true, allowFailure: true });
	checks.push({
		name: "pvc-bound",
		ok: pvc.status === 0 && !pvc.stdout.split("\n").filter(Boolean).some(line => !line.includes("Bound")),
		details: pvc.stdout.trim() || pvc.stderr.trim() || "no pvc output",
	});

	const certs = runCommand("kubectl", ["-n", "envsync", "get", "certificate", "--no-headers"], { capture: true, allowFailure: true });
	checks.push({
		name: "certificates",
		ok: expectCertificates
			? certs.status === 0 && !certs.stdout.split("\n").filter(Boolean).some(line => !line.includes("True"))
			: true,
		details: expectCertificates
			? certs.stdout.trim() || certs.stderr.trim() || "cert-manager certificates not found"
			: "certificate checks skipped",
	});

	checks.push(await checkHttp("api-health", `${scheme}://api.${rootDomain}/health`));
	checks.push(await checkHttp("dashboard", `${scheme}://app.${rootDomain}`));
	checks.push(await checkHttp("landing", `${scheme}://${rootDomain}`));
	checks.push(await checkHttp("zitadel-discovery", `${scheme}://auth.${rootDomain}/.well-known/openid-configuration`));

	return checks;
}
