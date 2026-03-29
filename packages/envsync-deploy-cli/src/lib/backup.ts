import fs from "node:fs";
import path from "node:path";

import { runCommand } from "./shell";
import type { CommandContext } from "./types";

function timestamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}

export function createBackup(ctx: CommandContext, outputPath?: string): string {
	const backupRoot = path.join(ctx.backupsDir, `backup-${timestamp()}`);
	fs.mkdirSync(backupRoot, { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "metadata"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "config"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "k8s"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "postgres"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "rustfs"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "zitadel"), { recursive: true });
	fs.mkdirSync(path.join(backupRoot, "checksums"), { recursive: true });

	runCommand("bash", [
		"-lc",
		`cp ${ctx.installConfigPath} ${path.join(backupRoot, "config/install.yaml")} && cp ${ctx.runtimeValuesPath} ${path.join(backupRoot, "config/values.runtime.yaml")} && cp ${ctx.generatedSecretsPath} ${path.join(backupRoot, "config/generated-secrets.yaml")}`,
	], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`kubectl -n envsync get all,configmap,secret,ingress,pvc,job -o yaml > ${path.join(backupRoot, "k8s/namespace-resources.yaml")}`,
	]);

	runCommand("bash", [
		"-lc",
		`POSTGRES_POD=$(kubectl -n envsync get pods -l app.kubernetes.io/instance=envsync,app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}') && kubectl -n envsync exec "$POSTGRES_POD" -- sh -c 'pg_dumpall -U postgres' | gzip -c > ${path.join(backupRoot, "postgres/all.sql.gz")}`,
	], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`kubectl -n envsync exec deploy/envsync-rustfs -- tar -C /data -czf - . > ${path.join(backupRoot, "rustfs/data.tar.gz")}`,
	], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`kubectl -n envsync exec deploy/envsync-zitadel -- tar -C /current-dir -czf - . > ${path.join(backupRoot, "zitadel/data.tar.gz")}`,
	], { allowFailure: true });

	const archivePath = outputPath ?? path.join(ctx.backupsDir, `envsync-backup-${timestamp()}.tar.gz`);
	runCommand("tar", ["-C", backupRoot, "-czf", archivePath, "."]);
	runCommand("bash", ["-lc", `shasum -a 256 ${archivePath} > ${path.join(backupRoot, "checksums/SHA256SUMS")}`], { allowFailure: true });

	return archivePath;
}
