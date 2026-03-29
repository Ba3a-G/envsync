import fs from "node:fs";

import { ensureContextDirs, resolveContext, writeText } from "./fs";
import { defaultReleaseManifest } from "./release-manifest";
import type { GeneratedSecrets, InstallConfig } from "./types";
import { toYaml } from "./yaml";

export function writeInstallArtifacts(config: InstallConfig, secrets: GeneratedSecrets): void {
	const ctx = resolveContext(config.installPath);
	ensureContextDirs(ctx);

	writeText(ctx.installConfigPath, toYaml(config) + "\n");
	writeText(ctx.generatedSecretsPath, toYaml(secrets) + "\n");
	writeText(ctx.runtimeValuesPath, buildRuntimeValues(config, secrets));
	writeText(
		ctx.manifestPath,
		`${JSON.stringify(defaultReleaseManifest, null, 2)}\n`,
	);
}

export function buildRuntimeValues(config: InstallConfig, secrets: GeneratedSecrets): string {
	const tlsEnabled = config.tlsMode !== "disabled";
	const publicScheme = tlsEnabled ? "https" : "http";
	const clusterIssuer = config.tlsMode === "acme" ? "letsencrypt-prod" : "";
	const values = {
		global: {
			domain: config.rootDomain,
			publicScheme,
			environment: "production",
		},
		api: {
			replicaCount: 1,
			autoscaling: {
				enabled: false,
			},
		},
		web: {
			enabled: true,
			host: `app.${config.rootDomain}`,
		},
		landing: {
			enabled: true,
			host: config.rootDomain,
		},
		ingress: {
			enabled: true,
			className: "nginx",
			hosts: {
				api: `api.${config.rootDomain}`,
				auth: `auth.${config.rootDomain}`,
				web: `app.${config.rootDomain}`,
				landing: config.rootDomain,
			},
			tls: {
				enabled: tlsEnabled,
				secretName: tlsEnabled ? "envsync-tls" : "",
			},
			clusterIssuer,
		},
		smtp: config.smtp ?? {
			host: "smtp.example.com",
			port: 587,
			secure: true,
			user: "",
			pass: "",
			from: `noreply@${config.rootDomain}`,
		},
		postgresql: {
			auth: {
				username: "envsync",
				password: secrets.appDatabasePassword,
				database: "envsync",
				postgresPassword: secrets.postgresPassword,
				replicationPassword: secrets.postgresReplicationPassword,
			},
			architecture: "standalone",
			primary: {
				persistence: {
					enabled: true,
					size: "20Gi",
				},
			},
			readReplicas: {
				replicaCount: 0,
			},
		},
		redis: {
			auth: {
				enabled: true,
				password: secrets.postgresReplicationPassword,
			},
			master: {
				persistence: {
					enabled: true,
				},
			},
		},
		database: {
			sslMode: "disable",
			roles: {
				zitadel: {
					username: "zitadel",
					database: "zitadel",
					password: secrets.zitadelDatabasePassword,
				},
				openfga: {
					username: "openfga",
					database: "openfga",
					password: secrets.openfgaDatabasePassword,
				},
				minikms: {
					username: "minikms",
					database: "minikms",
					password: secrets.minikmsDatabasePassword,
				},
			},
		},
		zitadel: {
			masterkey: secrets.zitadelMasterkey,
			admin: {
				username: "zitadel-admin",
				password: secrets.zitadelAdminPassword,
			},
		},
		minikms: {
			rootKey: secrets.minikmsRootKey,
		},
		rustfs: {
			accessKey: secrets.rustfsAccessKey,
			secretKey: secrets.rustfsSecretKey,
		},
	};

	return `${toYaml(values)}\n`;
}

export function readInstallConfig(installPath: string): string {
	const ctx = resolveContext(installPath);
	if (!fs.existsSync(ctx.installConfigPath)) {
		throw new Error(`Missing install config: ${ctx.installConfigPath}`);
	}
	return fs.readFileSync(ctx.installConfigPath, "utf8");
}
