#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dir, "..");
const artifactDir = process.env.DEPLOY_E2E_ARTIFACT_DIR || path.join(repoRoot, ".tmp", "deploy-cli-e2e");
const installPath = process.env.DEPLOY_E2E_INSTALL_PATH || "/tmp/envsync-e2e";
const sourceRef = process.env.DEPLOY_E2E_SOURCE_REF || "main";
const rootDomain = process.env.DEPLOY_E2E_DOMAIN || "envsync.test";
const upgradeVersion = process.env.DEPLOY_E2E_UPGRADE_VERSION || "0.4.0";
const upgradeDepsVersion = process.env.DEPLOY_E2E_UPGRADE_DEPS_VERSION || upgradeVersion;
const answersPath = path.join(artifactDir, "answers.json");

interface StepResult {
	status: number;
	stdout: string;
	stderr: string;
}

function ensureDirs(): void {
	fs.mkdirSync(artifactDir, { recursive: true });
}

function writeAnswersFile(): void {
	const answers = {
		domain: rootDomain,
		email: "admin@envsync.test",
		source: "repo",
		ref: sourceRef,
		profile: "e2e",
		"tls-mode": "disabled",
		channel: "stable",
	};
	fs.writeFileSync(answersPath, `${JSON.stringify(answers, null, 2)}\n`);
}

function runStep(name: string, args: string[]): StepResult {
	const result = spawnSync("bun", ["run", "packages/envsync-deploy-cli/src/index.ts", ...args], {
		cwd: repoRoot,
		stdio: "pipe",
		env: process.env,
	});
	const stdout = result.stdout?.toString() ?? "";
	const stderr = result.stderr?.toString() ?? "";
	fs.writeFileSync(path.join(artifactDir, `${name}.stdout.log`), stdout);
	fs.writeFileSync(path.join(artifactDir, `${name}.stderr.log`), stderr);
	if ((result.status ?? 1) !== 0) {
		throw new Error(`Step failed: ${name}`);
	}
	return {
		status: result.status ?? 0,
		stdout,
		stderr,
	};
}

function runShell(name: string, command: string, allowFailure = false): void {
	const result = spawnSync("bash", ["-lc", command], {
		cwd: repoRoot,
		stdio: "pipe",
		env: process.env,
	});
	fs.writeFileSync(path.join(artifactDir, `${name}.stdout.log`), result.stdout?.toString() ?? "");
	fs.writeFileSync(path.join(artifactDir, `${name}.stderr.log`), result.stderr?.toString() ?? "");
	if ((result.status ?? 1) !== 0 && !allowFailure) {
		throw new Error(`Shell step failed: ${name}`);
	}
}

function collectDiagnostics(): void {
	runShell("kubectl-get-all", "kubectl get all,configmap,secret,ingress,pvc,job -n envsync -o yaml", true);
	runShell("kubectl-describe-pods", "kubectl describe pods -n envsync", true);
	runShell("kubectl-logs-api", "kubectl logs deployment/envsync-api -n envsync --tail=200", true);
	runShell("kubectl-logs-zitadel", "kubectl logs deployment/envsync-zitadel -n envsync --tail=200", true);
	runShell("install-tree", `find ${installPath} -maxdepth 3 -type f | sort`, true);
}

function latestBackupPath(): string {
	const backupDir = path.join(installPath, "backups");
	const files = fs
		.readdirSync(backupDir)
		.filter(file => file.endsWith(".tar.gz"))
		.sort();
	const latest = files.at(-1);
	if (!latest) {
		throw new Error("No backup archive found.");
	}
	return path.join(backupDir, latest);
}

async function main(): Promise<void> {
	ensureDirs();
	writeAnswersFile();

	try {
		runStep("preinstall", ["preinstall", "--install-path", installPath]);
		runStep("setup", [
			"setup",
			"--install-path",
			installPath,
			"--answers-file",
			answersPath,
			"--non-interactive",
		]);
		runStep("deploy", ["deploy", "--install-path", installPath]);
		runStep("health-initial", ["health", "--install-path", installPath, "--json"]);
		const backupStep = runStep("backup", ["backup", "--install-path", installPath]);
		const backupPath = backupStep.stdout.trim().split("\n").filter(Boolean).at(-1) || latestBackupPath();
		runStep("upgrade", [
			"upgrade",
			"--install-path",
			installPath,
			"--version",
			upgradeVersion,
		]);
		runStep("upgrade-deps", [
			"upgrade-deps",
			"--install-path",
			installPath,
			"--version",
			upgradeDepsVersion,
		]);
		runStep("restore", [
			"restore",
			"--install-path",
			installPath,
			"--file",
			backupPath,
			"--yes",
		]);
		runStep("health-final", ["health", "--install-path", installPath, "--json"]);
		console.log(`Deploy CLI E2E completed successfully. Artifacts: ${artifactDir}`);
	} catch (error) {
		collectDiagnostics();
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

await main();
