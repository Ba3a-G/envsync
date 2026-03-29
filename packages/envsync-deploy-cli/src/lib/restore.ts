import fs from "node:fs";
import path from "node:path";

import { ensureContextDirs } from "./fs";
import { runCommand } from "./shell";
import type { CommandContext } from "./types";

export function restoreBackup(ctx: CommandContext, archivePath: string): string {
	if (!fs.existsSync(archivePath)) {
		throw new Error(`Backup archive not found: ${archivePath}`);
	}

	ensureContextDirs(ctx);
	const restoreDir = path.join(ctx.sharedDir, "restore-workdir");
	runCommand("rm", ["-rf", restoreDir], { allowFailure: true });
	runCommand("mkdir", ["-p", restoreDir]);
	runCommand("tar", ["-C", restoreDir, "-xzf", archivePath]);

	const configDir = path.join(restoreDir, "config");
	runCommand("bash", [
		"-lc",
		`cp ${path.join(configDir, "install.yaml")} ${ctx.installConfigPath} && cp ${path.join(configDir, "values.runtime.yaml")} ${ctx.runtimeValuesPath} && cp ${path.join(configDir, "generated-secrets.yaml")} ${ctx.generatedSecretsPath}`,
	]);

	runCommand("kubectl", ["apply", "-f", path.join(restoreDir, "k8s/namespace-resources.yaml")], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`POSTGRES_POD=$(kubectl -n envsync get pods -l app.kubernetes.io/instance=envsync,app.kubernetes.io/name=postgresql -o jsonpath='{.items[0].metadata.name}') && gunzip -c ${path.join(restoreDir, "postgres/all.sql.gz")} | kubectl -n envsync exec -i "$POSTGRES_POD" -- psql -U postgres`,
	], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`cat ${path.join(restoreDir, "rustfs/data.tar.gz")} | kubectl -n envsync exec -i deploy/envsync-rustfs -- tar -C /data -xzf -`,
	], { allowFailure: true });

	runCommand("bash", [
		"-lc",
		`cat ${path.join(restoreDir, "zitadel/data.tar.gz")} | kubectl -n envsync exec -i deploy/envsync-zitadel -- tar -C /current-dir -xzf -`,
	], { allowFailure: true });

	return restoreDir;
}
