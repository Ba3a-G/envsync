export type AssetSource = "bundle" | "repo";
export type ReleaseChannel = "stable" | "edge";
export type InstallProfile = "single-node" | "e2e";
export type TlsMode = "acme" | "self-signed" | "disabled";

export interface InstallConfig {
	rootDomain: string;
	adminEmail: string;
	installPath: string;
	releaseChannel: ReleaseChannel;
	assetSource: AssetSource;
	profile: InstallProfile;
	tlsMode: TlsMode;
	repoRef?: string;
	namespace: string;
	releaseName: string;
	kubeContext?: string;
	smtp?: {
		host: string;
		port: number;
		secure: boolean;
		user: string;
		pass: string;
		from: string;
	};
}

export interface GeneratedSecrets {
	postgresPassword: string;
	appDatabasePassword: string;
	postgresReplicationPassword: string;
	zitadelMasterkey: string;
	zitadelAdminPassword: string;
	zitadelDatabasePassword: string;
	openfgaDatabasePassword: string;
	minikmsDatabasePassword: string;
	minikmsRootKey: string;
	rustfsAccessKey: string;
	rustfsSecretKey: string;
}

export interface ReleaseManifest {
	version: string;
	chartVersion: string;
	compatibleFrom: string[];
	requiredMigrations: string[];
	backupSchemaVersion: string;
	restoreHooksVersion: string;
	images: Record<string, string>;
	dependencyUpgradePlan: Array<{
		name: string;
		type: "service" | "frontend" | "stateful";
		order: number;
	}>;
}

export interface CommandContext {
	rootDir: string;
	configDir: string;
	backupsDir: string;
	releasesDir: string;
	sharedDir: string;
	installConfigPath: string;
	generatedSecretsPath: string;
	runtimeValuesPath: string;
	manifestPath: string;
}

export interface HealthCheckResult {
	name: string;
	ok: boolean;
	details: string;
}
