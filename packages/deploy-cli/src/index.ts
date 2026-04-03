import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";

interface DeployConfig {
	source: {
		repo_url: string;
		ref: string;
	};
	release: {
		version: string;
	};
	domain: {
		root_domain: string;
		acme_email: string;
	};
	images: {
		api: string;
		keycloak: string;
		web: string;
		landing: string;
		clickstack: string;
		traefik: string;
		otel_agent: string;
	};
	services: {
		stack_name: string;
		api_port: number;
		public_http_port: number;
		public_https_port: number;
		clickstack_ui_port: number;
		clickstack_otlp_http_port: number;
		clickstack_otlp_grpc_port: number;
		keycloak_port: number;
		rustfs_port: number;
		rustfs_console_port: number;
	};
	auth: {
		keycloak_realm: string;
		admin_user: string;
		admin_password: string;
		web_client_id: string;
		api_client_id: string;
		cli_client_id: string;
	};
	observability: {
		retention_days: number;
		public_obs: boolean;
		alert_webhook_url?: string;
		alert_webhook_headers?: Record<string, string>;
	};
	backup: {
		output_dir: string;
		encrypted: boolean;
	};
	smtp: {
		host: string;
		port: number;
		secure: boolean;
		user: string;
		pass: string;
		from: string;
	};
	exposure: {
		public_auth: boolean;
		public_obs: boolean;
		mailpit_enabled: boolean;
		s3_public: boolean;
		s3_console_public: boolean;
	};
	release_channel?: string;
}

interface DeployGeneratedState {
	openfga: {
		store_id: string;
		model_id: string;
	};
	clickstack: {
		operator_email: string;
		operator_password: string;
		access_key: string;
		browser_api_key: string;
	};
	secrets: {
		s3_secret_key: string;
		keycloak_db_password: string;
		keycloak_web_client_secret: string;
		keycloak_api_client_secret: string;
		openfga_db_password: string;
		minikms_root_key: string;
		minikms_db_password: string;
	};
	bootstrap: {
		completed_at: string;
	};
}

interface InternalState {
	config: DeployConfig;
	generated: DeployGeneratedState;
}

type RuntimeEnv = Record<string, string>;
type ServiceHealth = "healthy" | "missing" | "degraded";
type CommandOptions = { dryRun: boolean; force: boolean };

const HOST_ROOT = process.env.ENVSYNC_HOST_ROOT ?? "/opt/envsync";
const ETC_ROOT = process.env.ENVSYNC_ETC_ROOT ?? "/etc/envsync";
const TRAEFIK_STATE_ROOT = process.env.ENVSYNC_TRAEFIK_STATE_ROOT ?? "/var/lib/envsync/traefik";
const DEPLOY_ROOT = path.join(HOST_ROOT, "deploy");
const RELEASES_ROOT = path.join(HOST_ROOT, "releases");
const BACKUPS_ROOT = path.join(HOST_ROOT, "backups");
const REPO_ROOT = process.env.ENVSYNC_REPO_ROOT ?? path.join(HOST_ROOT, "repo");
const DEPLOY_ENV = path.join(ETC_ROOT, "deploy.env");
const DEPLOY_YAML = path.join(ETC_ROOT, "deploy.yaml");
const VERSIONS_LOCK = path.join(DEPLOY_ROOT, "versions.lock.json");
const STACK_FILE = path.join(DEPLOY_ROOT, "docker-stack.yaml");
const BOOTSTRAP_BASE_STACK_FILE = path.join(DEPLOY_ROOT, "docker-stack.bootstrap.base.yaml");
const BOOTSTRAP_STACK_FILE = path.join(DEPLOY_ROOT, "docker-stack.bootstrap.yaml");
const TRAEFIK_DYNAMIC_FILE = path.join(DEPLOY_ROOT, "traefik-dynamic.yaml");
const KEYCLOAK_REALM_FILE = path.join(DEPLOY_ROOT, "keycloak-realm.envsync.json");
const NGINX_WEB_CONF = path.join(DEPLOY_ROOT, "nginx-web.conf");
const NGINX_LANDING_CONF = path.join(DEPLOY_ROOT, "nginx-landing.conf");
const OTEL_AGENT_CONF = path.join(DEPLOY_ROOT, "otel-agent.yaml");
const CLICKSTACK_CLICKHOUSE_CONF = path.join(DEPLOY_ROOT, "clickhouse-listen.xml");
const INTERNAL_CONFIG_JSON = path.join(DEPLOY_ROOT, "config.json");

const STACK_VOLUMES = [
	"postgres_data",
	"redis_data",
	"rustfs_data",
	"keycloak_db_data",
	"openfga_db_data",
	"minikms_db_data",
	"clickstack_data",
	"clickstack_ch_data",
	"clickstack_ch_logs",
] as const;

const REQUIRED_BOOTSTRAP_ENV_KEYS = [
	"S3_SECRET_KEY",
	"KEYCLOAK_WEB_CLIENT_SECRET",
	"KEYCLOAK_API_CLIENT_SECRET",
	"OPENFGA_DB_PASSWORD",
	"MINIKMS_ROOT_KEY",
	"MINIKMS_DB_PASSWORD",
	"OPENFGA_STORE_ID",
	"OPENFGA_MODEL_ID",
] as const;

const REQUIRED_CLICKSTACK_SAVED_SEARCHES = [
	"Frontend Errors - Web",
	"Frontend Errors - Landing",
	"API Errors",
	"Org Onboarding Completed",
	"Apps Created",
	"Users Invited",
	"Webhooks Created",
	"Slow API Traces",
	"Frontend API Calls",
] as const;

const REQUIRED_CLICKSTACK_TAGS = [
	"envsync",
	"frontend",
	"backend",
	"onboarding",
	"applications",
	"webhooks",
	"errors",
	"performance",
	"alerts",
] as const;
const CLICKSTACK_SELFHOST_TEAM_NAME = "EnvSync Self-Hosted Team";

const SEMVER_VERSION_RE = /^\d+\.\d+\.\d+$/;
let currentOptions: CommandOptions = { dryRun: false, force: false };

function formatShellArg(arg: string) {
	if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
	return JSON.stringify(arg);
}

function formatCommand(cmd: string, args: string[]) {
	return [cmd, ...args].map(formatShellArg).join(" ");
}

function logSection(title: string) {
	console.log(`\n${chalk.bold.blue(title)}`);
}

function logStep(message: string) {
	console.log(`${chalk.cyan("[step]")} ${message}`);
}

function logInfo(message: string) {
	console.log(`${chalk.blue("[info]")} ${message}`);
}

function logSuccess(message: string) {
	console.log(`${chalk.green("[ok]")} ${message}`);
}

function logWarn(message: string) {
	console.log(`${chalk.yellow("[warn]")} ${message}`);
}

function logDryRun(message: string) {
	console.log(`${chalk.magenta("[dry-run]")} ${message}`);
}

function logCommand(cmd: string, args: string[]) {
	console.log(chalk.dim(`$ ${formatCommand(cmd, args)}`));
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {}) {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		env: { ...process.env, ...opts.env },
		stdio: opts.quiet ? "pipe" : "inherit",
		encoding: "utf8",
	});
	if (result.status !== 0) {
		const stderr = typeof result.stderr === "string" ? result.stderr : "";
		throw new Error(`Command failed: ${cmd} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`);
	}
	return result.stdout?.toString() ?? "";
}

function tryRun(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {}) {
	try {
		return run(cmd, args, opts);
	} catch {
		return "";
	}
}

function commandSucceeds(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		env: { ...process.env, ...opts.env },
		stdio: "ignore",
		encoding: "utf8",
	});
	return result.status === 0;
}

function runIgnoringAbsent(
	cmd: string,
	args: string[],
	opts: { cwd?: string; env?: Record<string, string>; absentPatterns?: string[] } = {},
) {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd,
		env: { ...process.env, ...opts.env },
		stdio: "pipe",
		encoding: "utf8",
	});
	if (result.status === 0) {
		const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
		if (stdout) console.log(stdout);
		return true;
	}
	const combined = `${typeof result.stdout === "string" ? result.stdout : ""}\n${typeof result.stderr === "string" ? result.stderr : ""}`
		.toLowerCase();
	const absentPatterns = (opts.absentPatterns ?? []).map(pattern => pattern.toLowerCase());
	if (absentPatterns.some(pattern => combined.includes(pattern))) {
		return false;
	}
	const stderr = typeof result.stderr === "string" ? result.stderr : "";
	throw new Error(`Command failed: ${cmd} ${args.join(" ")}${stderr ? `\n${stderr}` : ""}`);
}

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeFile(target: string, content: string, mode?: number) {
	ensureDir(path.dirname(target));
	fs.writeFileSync(target, content, "utf8");
	if (mode != null) fs.chmodSync(target, mode);
}

function writeFileMaybe(target: string, content: string, mode?: number) {
	if (currentOptions.dryRun) {
		logDryRun(`Would write ${target}`);
		return;
	}
	writeFile(target, content, mode);
}

function exists(target: string) {
	return fs.existsSync(target);
}

function randomSecret(bytes = 24) {
	return randomBytes(bytes).toString("hex");
}

function randomStrongPassword() {
	return `EnvSync!${randomBytes(8).toString("hex")}Aa1`;
}

function yamlScalar(value: string | number | boolean): string {
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return `${value}`;
	if (/^[A-Za-z0-9._/@:-]+$/.test(value)) return value;
	return JSON.stringify(value);
}

function toYaml(value: unknown, indent = 0): string {
	const pad = " ".repeat(indent);
	if (Array.isArray(value)) {
		return value
			.map(item => {
				if (typeof item === "object" && item !== null) {
					const child = toYaml(item, indent + 2);
					return `${pad}- ${child.trimStart()}`.includes("\n")
						? `${pad}-\n${child}`
						: `${pad}- ${child.trimStart()}`;
				}
				return `${pad}- ${yamlScalar(item as string | number | boolean)}`;
			})
			.join("\n");
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value)
			.map(([key, item]) => {
				if (Array.isArray(item) || (typeof item === "object" && item !== null)) {
					return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
				}
				return `${pad}${key}: ${yamlScalar(item as string | number | boolean)}`;
			})
			.join("\n");
	}
	return `${pad}${yamlScalar(value as string | number | boolean)}`;
}

function parseYamlScalar(value: string): string | number | boolean {
	const trimmed = value.trim();
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function parseSimpleYamlObject(input: string): Record<string, unknown> {
	const root: Record<string, unknown> = {};
	const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];
	for (const rawLine of input.split(/\r?\n/)) {
		const trimmed = rawLine.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const indent = rawLine.length - rawLine.trimStart().length;
		const separator = trimmed.indexOf(":");
		if (separator === -1) continue;
		const key = trimmed.slice(0, separator).trim();
		const rest = trimmed.slice(separator + 1).trim();
		while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
			stack.pop();
		}
		const parent = stack[stack.length - 1]!.value;
		if (!rest) {
			const child: Record<string, unknown> = {};
			parent[key] = child;
			stack.push({ indent, value: child });
			continue;
		}
		parent[key] = parseYamlScalar(rest);
	}
	return root;
}

function parseEnvFile(content: string): RuntimeEnv {
	const out: RuntimeEnv = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
		}
		out[key] = value;
	}
	return out;
}

async function ask(question: string, fallback = ""): Promise<string> {
	if (!process.stdin.isTTY) return fallback;
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return await new Promise(resolve => {
		rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, answer => {
			rl.close();
			resolve(answer.trim() || fallback);
		});
	});
}

async function askRequired(question: string): Promise<string> {
	if (!process.stdin.isTTY) {
		throw new Error("Bootstrap confirmation requires an interactive terminal. Re-run with --force to bypass the prompt.");
	}
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return await new Promise(resolve => {
		rl.question(`${question} `, answer => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

function sleepSeconds(seconds: number) {
	spawnSync("sleep", [`${seconds}`], { stdio: "ignore" });
}

function domainMap(rootDomain: string) {
	return {
		landing: rootDomain,
		app: `app.${rootDomain}`,
		api: `api.${rootDomain}`,
		auth: `auth.${rootDomain}`,
		obs: `obs.${rootDomain}`,
		mail: `mail.${rootDomain}`,
		s3: `s3.${rootDomain}`,
		s3Console: `console.s3.${rootDomain}`,
	};
}

function publicHttpsOrigin(config: DeployConfig, host: string) {
	return `https://${host}${config.services.public_https_port === 443 ? "" : `:${config.services.public_https_port}`}`;
}

function publicHttpsOriginVariants(config: DeployConfig, host: string) {
	const canonical = `https://${host}`;
	if (config.services.public_https_port === 443) {
		return [canonical];
	}
	return [canonical, publicHttpsOrigin(config, host)];
}

function getDeployCliVersion() {
	try {
		const packageJsonPath = new URL("../package.json", import.meta.url);
		const raw = fs.readFileSync(packageJsonPath, "utf8");
		return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
	} catch {
		return process.env.npm_package_version ?? "0.0.0";
	}
}

function hasExplicitRepoOverride() {
	return typeof process.env.ENVSYNC_REPO_ROOT === "string" && process.env.ENVSYNC_REPO_ROOT.length > 0;
}

function logReleaseContext(config: DeployConfig) {
	const cliVersion = getDeployCliVersion();
	logInfo(`Configured release version from ${DEPLOY_YAML}: ${config.release.version}`);
	logInfo(`Running deploy-cli version: ${cliVersion}`);
	if (cliVersion !== config.release.version) {
		logWarn(
			`The running deploy-cli version does not change the configured release target. This run will deploy the version pinned in ${DEPLOY_YAML}.`,
		);
	}
}

function assertSemverVersion(version: string, label = "release version") {
	if (!SEMVER_VERSION_RE.test(version)) {
		throw new Error(`Invalid ${label} '${version}'. Expected an exact semver like 0.6.2.`);
	}
}

function versionedImages(version: string) {
	assertSemverVersion(version);
	return {
		api: `ghcr.io/envsync-cloud/envsync-api:${version}`,
		keycloak: `envsync-keycloak:${version}`,
		web: `ghcr.io/envsync-cloud/envsync-web-static:${version}`,
		landing: `ghcr.io/envsync-cloud/envsync-landing-static:${version}`,
	};
}

function defaultSourceConfig(version: string) {
	return {
		repo_url: "https://github.com/EnvSync-Cloud/envsync.git",
		ref: `v${version}`,
	};
}

function resolveReleaseVersion(raw: Partial<DeployConfig>) {
	const releaseVersion = raw.release?.version;
	if (releaseVersion) {
		assertSemverVersion(releaseVersion);
		return releaseVersion;
	}
	if (typeof raw.release_channel === "string" && raw.release_channel.length > 0) {
		if (SEMVER_VERSION_RE.test(raw.release_channel)) {
			return raw.release_channel;
		}
		if (raw.release_channel === "stable" || raw.release_channel === "latest") {
			throw new Error(
				"Legacy release channel config is no longer supported for self-hosted installs. Set an exact release version in /etc/envsync/deploy.yaml.",
			);
		}
		throw new Error(`Invalid legacy release channel '${raw.release_channel}'. Set an exact release version in /etc/envsync/deploy.yaml.`);
	}
	return getDeployCliVersion();
}

function requireDefined<T>(value: T | undefined, label: string): T {
	if (value === undefined) {
		throw new Error(`Missing ${label} in ${DEPLOY_YAML}. Run setup again.`);
	}
	return value;
}

function normalizeConfig(raw: Partial<DeployConfig>): DeployConfig {
	const version = resolveReleaseVersion(raw);
	const derivedImages = versionedImages(version);
	const { release_channel: _legacyReleaseChannel, ...rest } = raw;
	const rootDomain = requireDefined(raw.domain?.root_domain, "domain.root_domain");
	const acmeEmail = requireDefined(raw.domain?.acme_email, "domain.acme_email");
	return {
		...rest,
		source: {
			repo_url: raw.source?.repo_url ?? "https://github.com/EnvSync-Cloud/envsync.git",
			ref: `v${version}`,
		},
		release: {
			version,
		},
		domain: {
			root_domain: rootDomain,
			acme_email: acmeEmail,
		},
		images: {
			api: raw.images?.api ?? derivedImages.api,
			keycloak: raw.images?.keycloak ?? derivedImages.keycloak,
			web: raw.images?.web ?? derivedImages.web,
			landing: raw.images?.landing ?? derivedImages.landing,
			clickstack: raw.images?.clickstack ?? "clickhouse/clickstack-all-in-one:latest",
			traefik: raw.images?.traefik ?? "traefik:v3.6.6",
			otel_agent: raw.images?.otel_agent ?? "otel/opentelemetry-collector-contrib:0.111.0",
		},
		services: {
			stack_name: requireDefined(raw.services?.stack_name, "services.stack_name"),
			api_port: requireDefined(raw.services?.api_port, "services.api_port"),
			public_http_port: raw.services?.public_http_port ?? 80,
			public_https_port: raw.services?.public_https_port ?? 443,
			clickstack_ui_port: requireDefined(raw.services?.clickstack_ui_port, "services.clickstack_ui_port"),
			clickstack_otlp_http_port: requireDefined(raw.services?.clickstack_otlp_http_port, "services.clickstack_otlp_http_port"),
			clickstack_otlp_grpc_port: requireDefined(raw.services?.clickstack_otlp_grpc_port, "services.clickstack_otlp_grpc_port"),
			keycloak_port: requireDefined(raw.services?.keycloak_port, "services.keycloak_port"),
			rustfs_port: requireDefined(raw.services?.rustfs_port, "services.rustfs_port"),
			rustfs_console_port: requireDefined(raw.services?.rustfs_console_port, "services.rustfs_console_port"),
		},
		auth: {
			keycloak_realm: requireDefined(raw.auth?.keycloak_realm, "auth.keycloak_realm"),
			admin_user: requireDefined(raw.auth?.admin_user, "auth.admin_user"),
			admin_password: requireDefined(raw.auth?.admin_password, "auth.admin_password"),
			web_client_id: requireDefined(raw.auth?.web_client_id, "auth.web_client_id"),
			api_client_id: requireDefined(raw.auth?.api_client_id, "auth.api_client_id"),
			cli_client_id: requireDefined(raw.auth?.cli_client_id, "auth.cli_client_id"),
		},
		observability: {
			retention_days: requireDefined(raw.observability?.retention_days, "observability.retention_days"),
			public_obs: requireDefined(raw.observability?.public_obs, "observability.public_obs"),
			alert_webhook_url: raw.observability?.alert_webhook_url,
			alert_webhook_headers: raw.observability?.alert_webhook_headers ?? {},
		},
		backup: {
			output_dir: requireDefined(raw.backup?.output_dir, "backup.output_dir"),
			encrypted: requireDefined(raw.backup?.encrypted, "backup.encrypted"),
		},
		smtp: {
			host: requireDefined(raw.smtp?.host, "smtp.host"),
			port: requireDefined(raw.smtp?.port, "smtp.port"),
			secure: requireDefined(raw.smtp?.secure, "smtp.secure"),
			user: requireDefined(raw.smtp?.user, "smtp.user"),
			pass: requireDefined(raw.smtp?.pass, "smtp.pass"),
			from: requireDefined(raw.smtp?.from, "smtp.from"),
		},
		exposure: {
			public_auth: requireDefined(raw.exposure?.public_auth, "exposure.public_auth"),
			public_obs: requireDefined(raw.exposure?.public_obs, "exposure.public_obs"),
			mailpit_enabled: requireDefined(raw.exposure?.mailpit_enabled, "exposure.mailpit_enabled"),
			s3_public: requireDefined(raw.exposure?.s3_public, "exposure.s3_public"),
			s3_console_public: requireDefined(raw.exposure?.s3_console_public, "exposure.s3_console_public"),
		},
	};
}

function emptyGeneratedState(): DeployGeneratedState {
	return {
		openfga: {
			store_id: "",
			model_id: "",
		},
		clickstack: {
			operator_email: "",
			operator_password: "",
			access_key: "",
			browser_api_key: "",
		},
		secrets: {
			s3_secret_key: "",
			keycloak_db_password: "",
			keycloak_web_client_secret: "",
			keycloak_api_client_secret: "",
			openfga_db_password: "",
			minikms_root_key: "",
			minikms_db_password: "",
		},
		bootstrap: {
			completed_at: "",
		},
	};
}

function normalizeGeneratedState(raw?: Partial<DeployGeneratedState>): DeployGeneratedState {
	const defaults = emptyGeneratedState();
	return {
		openfga: {
			store_id: raw?.openfga?.store_id ?? defaults.openfga.store_id,
			model_id: raw?.openfga?.model_id ?? defaults.openfga.model_id,
		},
		clickstack: {
			operator_email: raw?.clickstack?.operator_email ?? defaults.clickstack.operator_email,
			operator_password: raw?.clickstack?.operator_password ?? defaults.clickstack.operator_password,
			access_key: raw?.clickstack?.access_key ?? defaults.clickstack.access_key,
			browser_api_key: raw?.clickstack?.browser_api_key ?? defaults.clickstack.browser_api_key,
		},
		secrets: {
			s3_secret_key: raw?.secrets?.s3_secret_key ?? defaults.secrets.s3_secret_key,
			keycloak_db_password: raw?.secrets?.keycloak_db_password ?? defaults.secrets.keycloak_db_password,
			keycloak_web_client_secret: raw?.secrets?.keycloak_web_client_secret ?? defaults.secrets.keycloak_web_client_secret,
			keycloak_api_client_secret: raw?.secrets?.keycloak_api_client_secret ?? defaults.secrets.keycloak_api_client_secret,
			openfga_db_password: raw?.secrets?.openfga_db_password ?? defaults.secrets.openfga_db_password,
			minikms_root_key: raw?.secrets?.minikms_root_key ?? defaults.secrets.minikms_root_key,
			minikms_db_password: raw?.secrets?.minikms_db_password ?? defaults.secrets.minikms_db_password,
		},
		bootstrap: {
			completed_at: raw?.bootstrap?.completed_at ?? defaults.bootstrap.completed_at,
		},
	};
}

function readInternalState() {
	if (!exists(INTERNAL_CONFIG_JSON)) return null;
	const raw = JSON.parse(fs.readFileSync(INTERNAL_CONFIG_JSON, "utf8")) as Partial<InternalState>;
	return {
		config: raw.config ? normalizeConfig(raw.config) : undefined,
		generated: normalizeGeneratedState(raw.generated),
	};
}

function loadConfig(): DeployConfig {
	if (!exists(DEPLOY_YAML)) {
		throw new Error(`Missing deploy config at ${DEPLOY_YAML}. Run setup first.`);
	}
	const raw = fs.readFileSync(DEPLOY_YAML, "utf8");
	if (raw.trimStart().startsWith("{")) {
		return normalizeConfig(JSON.parse(raw) as DeployConfig);
	}
	return normalizeConfig(parseSimpleYamlObject(raw) as unknown as DeployConfig);
}

function loadGeneratedEnv() {
	if (!exists(DEPLOY_ENV)) return {};
	return parseEnvFile(fs.readFileSync(DEPLOY_ENV, "utf8"));
}

function mergeGeneratedState(env: RuntimeEnv, generated?: Partial<DeployGeneratedState>) {
	const normalized = normalizeGeneratedState(generated);
	return normalizeGeneratedState({
		openfga: {
			store_id: env.OPENFGA_STORE_ID ?? normalized.openfga.store_id,
			model_id: env.OPENFGA_MODEL_ID ?? normalized.openfga.model_id,
		},
		clickstack: {
			operator_email: env.CLICKSTACK_OPERATOR_EMAIL ?? normalized.clickstack.operator_email,
			operator_password: env.CLICKSTACK_OPERATOR_PASSWORD ?? normalized.clickstack.operator_password,
			access_key: env.CLICKSTACK_ACCESS_KEY ?? normalized.clickstack.access_key,
			browser_api_key: env.CLICKSTACK_BROWSER_API_KEY ?? normalized.clickstack.browser_api_key,
		},
		secrets: {
			s3_secret_key: env.S3_SECRET_KEY ?? normalized.secrets.s3_secret_key,
			keycloak_db_password: env.KEYCLOAK_DB_PASSWORD ?? normalized.secrets.keycloak_db_password,
			keycloak_web_client_secret: env.KEYCLOAK_WEB_CLIENT_SECRET ?? normalized.secrets.keycloak_web_client_secret,
			keycloak_api_client_secret: env.KEYCLOAK_API_CLIENT_SECRET ?? normalized.secrets.keycloak_api_client_secret,
			openfga_db_password: env.OPENFGA_DB_PASSWORD ?? normalized.secrets.openfga_db_password,
			minikms_root_key: env.MINIKMS_ROOT_KEY ?? normalized.secrets.minikms_root_key,
			minikms_db_password: env.MINIKMS_DB_PASSWORD ?? normalized.secrets.minikms_db_password,
		},
		bootstrap: normalized.bootstrap,
	});
}

function loadState() {
	const config = loadConfig();
	const internal = readInternalState();
	const generated = mergeGeneratedState(loadGeneratedEnv(), internal?.generated);
	return { config, generated };
}

function ensureGeneratedRuntimeState(config: DeployConfig, generated: DeployGeneratedState) {
	return normalizeGeneratedState({
		openfga: generated.openfga,
		clickstack: {
			operator_email: generated.clickstack.operator_email || `operator@${config.domain.root_domain}`,
			operator_password: generated.clickstack.operator_password || randomStrongPassword(),
			access_key: generated.clickstack.access_key || `envsync-selfhost-${config.domain.root_domain}-dashboard-access-key`,
			browser_api_key: generated.clickstack.browser_api_key,
		},
		secrets: {
			s3_secret_key: generated.secrets.s3_secret_key || randomSecret(16),
			keycloak_db_password: generated.secrets.keycloak_db_password || "",
			keycloak_web_client_secret: generated.secrets.keycloak_web_client_secret || randomSecret(),
			keycloak_api_client_secret: generated.secrets.keycloak_api_client_secret || randomSecret(),
			openfga_db_password: generated.secrets.openfga_db_password || randomSecret(),
			minikms_root_key: generated.secrets.minikms_root_key || randomBytes(32).toString("hex"),
			minikms_db_password: generated.secrets.minikms_db_password || randomSecret(),
		},
		bootstrap: generated.bootstrap,
	});
}

function resetBootstrapGeneratedState(generated: DeployGeneratedState) {
	return normalizeGeneratedState({
		openfga: {
			store_id: "",
			model_id: "",
		},
		clickstack: generated.clickstack,
		secrets: generated.secrets,
		bootstrap: {
			completed_at: "",
		},
	});
}

function keycloakImageTag(image: string) {
	return image.split(":").slice(1).join(":") || "local";
}

function buildRuntimeEnv(config: DeployConfig, generated: DeployGeneratedState): RuntimeEnv {
	const hosts = domainMap(config.domain.root_domain);
	return {
		NODE_ENV: "production",
		PORT: `${config.services.api_port}`,
		DATABASE_HOST: "postgres",
		DATABASE_PORT: "5432",
		DATABASE_USER: "postgres",
		DATABASE_PASSWORD: "envsync-postgres",
		DATABASE_NAME: "envsync",
		POSTGRES_USER: "postgres",
		POSTGRES_PASSWORD: "envsync-postgres",
		POSTGRES_DB: "envsync",
		S3_BUCKET: "envsync-bucket",
		S3_REGION: "us-east-1",
		S3_ACCESS_KEY: "envsync-rustfs",
		S3_SECRET_KEY: generated.secrets.s3_secret_key,
		S3_BUCKET_URL: `https://${hosts.s3}`,
		S3_ENDPOINT: "http://rustfs:9000",
		REDIS_URL: "redis://redis:6379",
		SMTP_HOST: config.smtp.host,
		SMTP_PORT: `${config.smtp.port}`,
		SMTP_SECURE: `${config.smtp.secure}`,
		SMTP_USER: config.smtp.user,
		SMTP_PASS: config.smtp.pass,
		SMTP_FROM: config.smtp.from,
		KEYCLOAK_URL: "http://keycloak:8080",
		KEYCLOAK_PUBLIC_URL: `https://${hosts.auth}`,
		KEYCLOAK_REALM: config.auth.keycloak_realm,
		KEYCLOAK_ADMIN_USER: config.auth.admin_user,
		KEYCLOAK_ADMIN_PASSWORD: config.auth.admin_password,
		KEYCLOAK_DB_PASSWORD: generated.secrets.keycloak_db_password || config.auth.admin_password,
		KEYCLOAK_WEB_CLIENT_ID: config.auth.web_client_id,
		KEYCLOAK_WEB_CLIENT_SECRET: generated.secrets.keycloak_web_client_secret,
		KEYCLOAK_CLI_CLIENT_ID: config.auth.cli_client_id,
		KEYCLOAK_API_CLIENT_ID: config.auth.api_client_id,
		KEYCLOAK_API_CLIENT_SECRET: generated.secrets.keycloak_api_client_secret,
		KEYCLOAK_WEB_REDIRECT_URI: `https://${hosts.api}/api/access/web/callback`,
		KEYCLOAK_WEB_CALLBACK_URL: `https://${hosts.app}/auth/callback`,
		KEYCLOAK_API_REDIRECT_URI: `https://${hosts.api}/api/access/api/callback`,
		LANDING_PAGE_URL: `https://${hosts.landing}`,
		DASHBOARD_URL: `https://${hosts.app}`,
		OPENFGA_API_URL: "http://openfga:8090",
		OPENFGA_STORE_ID: generated.openfga.store_id,
		OPENFGA_MODEL_ID: generated.openfga.model_id,
		OPENFGA_DB_PASSWORD: generated.secrets.openfga_db_password,
		CLICKSTACK_OPERATOR_EMAIL: generated.clickstack.operator_email,
		CLICKSTACK_OPERATOR_PASSWORD: generated.clickstack.operator_password,
		CLICKSTACK_ACCESS_KEY: generated.clickstack.access_key,
		CLICKSTACK_BROWSER_API_KEY: generated.clickstack.browser_api_key,
		MINIKMS_GRPC_ADDR: "minikms:50051",
		MINIKMS_TLS_ENABLED: "false",
		MINIKMS_ROOT_KEY: generated.secrets.minikms_root_key,
		MINIKMS_DB_USER: "postgres",
		MINIKMS_DB_PASSWORD: generated.secrets.minikms_db_password,
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-agent:4318",
		OTEL_SERVICE_NAME: "envsync-api",
		OTEL_SDK_DISABLED: "false",
		CLICKSTACK_URL: `https://${hosts.obs}`,
		KEYCLOAK_IMAGE_TAG: keycloakImageTag(config.images.keycloak),
	};
}

function renderEnvFile(env: RuntimeEnv) {
	return Object.entries(env)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join("\n") + "\n";
}

function renderEnvList(values: Record<string, string | number | boolean>, indent = 6) {
	const prefix = " ".repeat(indent);
	return Object.entries(values)
		.map(([key, value]) => `${prefix}- ${JSON.stringify(`${key}=${String(value)}`)}`)
		.join("\n");
}

function renderKeycloakRealm(config: DeployConfig, runtimeEnv: RuntimeEnv) {
	const hosts = domainMap(config.domain.root_domain);
	return JSON.stringify(
		{
			realm: config.auth.keycloak_realm,
			enabled: true,
			loginTheme: "envsync",
			emailTheme: "envsync",
			clients: [
				{
					clientId: config.auth.web_client_id,
					name: "EnvSync Web",
					protocol: "openid-connect",
					publicClient: false,
					secret: runtimeEnv.KEYCLOAK_WEB_CLIENT_SECRET,
					standardFlowEnabled: true,
					directAccessGrantsEnabled: false,
					redirectUris: [
						`https://${hosts.api}/api/access/web/callback`,
						`https://${hosts.app}/auth/callback`,
						`https://${hosts.app}`,
					],
					webOrigins: [`https://${hosts.app}`],
					attributes: {
						"post.logout.redirect.uris": "+",
					},
					defaultClientScopes: ["basic", "web-origins", "profile", "email", "roles"],
				},
				{
					clientId: config.auth.api_client_id,
					name: "EnvSync API",
					protocol: "openid-connect",
					publicClient: false,
					secret: runtimeEnv.KEYCLOAK_API_CLIENT_SECRET,
					standardFlowEnabled: true,
					redirectUris: [`https://${hosts.api}/api/access/api/callback`],
					webOrigins: [`https://${hosts.api}`],
					defaultClientScopes: ["basic", "profile", "email", "roles"],
				},
				{
					clientId: config.auth.cli_client_id,
					name: "EnvSync CLI",
					protocol: "openid-connect",
					publicClient: true,
					standardFlowEnabled: false,
					directAccessGrantsEnabled: false,
					attributes: {
						"oauth2.device.authorization.grant.enabled": "true",
					},
					defaultClientScopes: ["basic", "profile", "email", "roles"],
				},
			],
		},
		null,
		2,
	) + "\n";
}

function renderTraefikDynamicConfig(config: DeployConfig) {
	const hosts = domainMap(config.domain.root_domain);
	const otelAllowedOrigins = [
		...publicHttpsOriginVariants(config, hosts.landing),
		...publicHttpsOriginVariants(config, hosts.app),
	];
	return [
		"http:",
		"  middlewares:",
		"    secure-headers:",
		"      headers:",
		"        browserXssFilter: true",
		"        contentTypeNosniff: true",
		"        forceSTSHeader: true",
		"        stsSeconds: 31536000",
		"    gzip:",
		"      compress: {}",
		"    otel-cors:",
		"      headers:",
		"        accessControlAllowOriginList:",
		...otelAllowedOrigins.map(origin => `          - ${origin}`),
		"        accessControlAllowMethods:",
		"          - POST",
		"          - OPTIONS",
		"        accessControlAllowHeaders:",
		"          - Content-Type",
		"          - content-type",
		"          - Authorization",
		"          - authorization",
		"        accessControlAllowCredentials: true",
		"        accessControlMaxAge: 600",
		"        addVaryHeader: true",
		"  services:",
		"    envsync-api:",
		"      weighted:",
		"        services:",
		"          - name: envsync-api-blue",
		"            weight: 100",
		"          - name: envsync-api-green",
		"            weight: 0",
		"    envsync-api-blue:",
		"      loadBalancer:",
		"        servers:",
		"          - url: http://envsync_api_blue:4000",
		"    envsync-api-green:",
		"      loadBalancer:",
		"        servers:",
		"          - url: http://envsync_api_green:4000",
		"    landing:",
		"      loadBalancer:",
		"        servers:",
		"          - url: http://landing_nginx:8080",
		"    web:",
		"      loadBalancer:",
		"        servers:",
		"          - url: http://web_nginx:8080",
		"    clickstack-ui:",
		"      loadBalancer:",
		"        servers:",
		"          - url: http://clickstack:8080",
		"    clickstack-otlp:",
		"      loadBalancer:",
		"        servers:",
		`          - url: http://clickstack:${config.services.clickstack_otlp_http_port}`,
		"  routers:",
		"    landing-router:",
		`      rule: Host(\`${hosts.landing}\`)`,
		"      service: landing",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
		"    web-router:",
		`      rule: Host(\`${hosts.app}\`)`,
		"      service: web",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
		"    obs-otlp-router:",
		`      rule: Host(\`${hosts.obs}\`) && (PathPrefix(\`/v1/traces\`) || PathPrefix(\`/v1/logs\`) || PathPrefix(\`/v1/metrics\`))`,
		"      service: clickstack-otlp",
		"      middlewares: [otel-cors]",
		"      priority: 100",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
		"    obs-api-router:",
		`      rule: Host(\`${hosts.obs}\`) && PathPrefix(\`/api\`)`,
		"      service: clickstack-ui",
		"      priority: 90",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
		"    obs-ui-router:",
		`      rule: Host(\`${hosts.obs}\`)`,
		"      service: clickstack-ui",
		"      priority: 10",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
		"    api-router:",
		`      rule: Host(\`${hosts.api}\`)`,
		"      service: envsync-api",
		"      entryPoints: [websecure]",
		"      tls:",
		"        certResolver: letsencrypt",
	].join("\n") + "\n";
}

function renderNginxConf(kind: "web" | "landing") {
	return [
		"server {",
		"  listen 8080;",
		"  server_name _;",
		`  root /srv/${kind};`,
		"  index index.html;",
		"  location / {",
		"    try_files $uri $uri/ /index.html;",
		"  }",
		"}",
	].join("\n") + "\n";
}

function renderFrontendRuntimeConfig(config: DeployConfig, generated: DeployGeneratedState) {
	const hosts = domainMap(config.domain.root_domain);
	const otelEndpoint = `https://${hosts.obs}`;
	return `window.__ENVSYNC_RUNTIME_CONFIG__ = ${JSON.stringify({
		apiBaseUrl: `https://${hosts.api}`,
		appBaseUrl: `https://${hosts.app}`,
		authBaseUrl: `https://${hosts.auth}`,
		keycloakRealm: config.auth.keycloak_realm,
		webClientId: config.auth.web_client_id,
		apiDocsUrl: `https://${hosts.api}/docs`,
		otelEndpoint,
		hyperdxApiKey: generated.clickstack.browser_api_key || undefined,
		hyperdxUrl: otelEndpoint,
		hyperdxDisabled: generated.clickstack.browser_api_key.length === 0,
		hyperdxAdvancedNetworkCapture: false,
		releaseVersion: config.release.version,
	}, null, 2)};\n`;
}

function renderOtelAgentConfig(config: DeployConfig) {
	return [
		"receivers:",
		"  otlp:",
		"    protocols:",
		"      grpc:",
		"        endpoint: 0.0.0.0:4317",
		"      http:",
		"        endpoint: 0.0.0.0:4318",
		"processors:",
		"  batch: {}",
		"  resource:",
		"    attributes:",
		"      - key: deployment.environment",
		"        value: production",
		"        action: upsert",
		"exporters:",
		"  otlphttp/clickstack:",
		`    endpoint: http://clickstack:${config.services.clickstack_otlp_http_port}`,
		"service:",
		"  pipelines:",
		"    traces:",
		"      receivers: [otlp]",
		"      processors: [resource, batch]",
		"      exporters: [otlphttp/clickstack]",
		"    logs:",
		"      receivers: [otlp]",
		"      processors: [resource, batch]",
		"      exporters: [otlphttp/clickstack]",
		"    metrics:",
		"      receivers: [otlp]",
		"      processors: [resource, batch]",
		"      exporters: [otlphttp/clickstack]",
	].join("\n") + "\n";
}

function renderClickstackClickHouseConfig() {
	return [
		"<clickhouse>",
		"  <listen_host>0.0.0.0</listen_host>",
		"  <listen_try>1</listen_try>",
		"</clickhouse>",
	].join("\n") + "\n";
}

function renderStack(config: DeployConfig, runtimeEnv: RuntimeEnv, mode: "base" | "bootstrap" | "full") {
	const hosts = domainMap(config.domain.root_domain);
	const includeRuntimeInfra = mode !== "base";
	const includeAppServices = mode === "full";
	const stackName = config.services.stack_name;
	const s3RouterName = `${stackName}-s3-router`;
	const s3ServiceName = `${stackName}-s3-service`;
	const s3ConsoleRouterName = `${stackName}-s3-console-router`;
	const s3ConsoleServiceName = `${stackName}-s3-console-service`;
	const apiEnvironment = {
		...runtimeEnv,
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-agent:4318",
		KEYCLOAK_URL: "http://keycloak:8080",
		OPENFGA_API_URL: "http://openfga:8090",
		MINIKMS_GRPC_ADDR: "minikms:50051",
		S3_ENDPOINT: "http://rustfs:9000",
		S3_BUCKET_URL: `https://${hosts.s3}`,
	};

	return `
version: "3.9"
services:
  traefik:
    image: ${config.images.traefik}
    command:
      - --providers.swarm=true
      - --providers.swarm.endpoint=unix:///var/run/docker.sock
      - --providers.swarm.exposedByDefault=false
      - --providers.file.filename=/etc/traefik/dynamic/traefik-dynamic.yaml
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entryPoint.to=websecure
      - --entrypoints.web.http.redirections.entryPoint.scheme=https
      - --entrypoints.web.http.redirections.entryPoint.permanent=true
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=${config.domain.acme_email}
      - --certificatesresolvers.letsencrypt.acme.storage=/var/lib/traefik/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - target: 80
        published: ${config.services.public_http_port}
        protocol: tcp
        mode: host
      - target: 443
        published: ${config.services.public_https_port}
        protocol: tcp
        mode: host
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${TRAEFIK_STATE_ROOT}:/var/lib/traefik
      - ${DEPLOY_ROOT}:/etc/traefik/dynamic:ro
    networks: [envsync]

  postgres:
    image: postgres:17
    environment:
${renderEnvList({
		POSTGRES_USER: "postgres",
		POSTGRES_PASSWORD: "envsync-postgres",
		POSTGRES_DB: "envsync",
	})}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks: [envsync]

  redis:
    image: redis:7
    volumes:
      - redis_data:/data
    networks: [envsync]

  rustfs:
    image: rustfs/rustfs:latest
    environment:
${renderEnvList({
		RUSTFS_DATA_DIR: "/data",
		RUSTFS_ACCESS_KEY: "envsync-rustfs",
		RUSTFS_SECRET_KEY: runtimeEnv.S3_SECRET_KEY,
		RUSTFS_CONSOLE_ENABLE: "true",
	})}
    volumes:
      - rustfs_data:/data
    networks: [envsync]
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.${s3RouterName}.rule=Host(\`${hosts.s3}\`)
        - traefik.http.routers.${s3RouterName}.entrypoints=websecure
        - traefik.http.routers.${s3RouterName}.tls.certresolver=letsencrypt
        - traefik.http.routers.${s3RouterName}.service=${s3ServiceName}
        - traefik.http.services.${s3ServiceName}.loadbalancer.server.port=9000
        - traefik.http.routers.${s3ConsoleRouterName}.rule=Host(\`${hosts.s3Console}\`)
        - traefik.http.routers.${s3ConsoleRouterName}.entrypoints=websecure
        - traefik.http.routers.${s3ConsoleRouterName}.tls.certresolver=letsencrypt
        - traefik.http.routers.${s3ConsoleRouterName}.service=${s3ConsoleServiceName}
        - traefik.http.services.${s3ConsoleServiceName}.loadbalancer.server.port=9001

  keycloak_db:
    image: postgres:17
    environment:
${renderEnvList({
		POSTGRES_USER: "keycloak",
		POSTGRES_PASSWORD: runtimeEnv.KEYCLOAK_DB_PASSWORD,
		POSTGRES_DB: "keycloak",
	})}
    volumes:
      - keycloak_db_data:/var/lib/postgresql/data
    networks: [envsync]
${includeRuntimeInfra ? `
  keycloak:
    image: ${config.images.keycloak}
    entrypoint: ["/bin/sh", "-lc"]
    command:
      - /opt/keycloak/bin/kc.sh import --dir /opt/keycloak/data/import --override true && exec /opt/keycloak/bin/kc.sh start --optimized
    environment:
${renderEnvList({
		KC_DB: "postgres",
		KC_DB_URL: "jdbc:postgresql://keycloak_db:5432/keycloak",
		KC_DB_USERNAME: "keycloak",
		KC_DB_PASSWORD: runtimeEnv.KEYCLOAK_DB_PASSWORD,
		KC_BOOTSTRAP_ADMIN_USERNAME: config.auth.admin_user,
		KC_BOOTSTRAP_ADMIN_PASSWORD: config.auth.admin_password,
		KC_HTTP_ENABLED: "true",
		KC_HEALTH_ENABLED: "true",
		KC_PROXY_HEADERS: "xforwarded",
		KC_HOSTNAME: hosts.auth,
		KC_HOSTNAME_STRICT: "false",
	})}
    configs:
      - source: keycloak_realm
        target: /opt/keycloak/data/import/realm.json
    networks: [envsync]
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.keycloak.rule=Host(\`${hosts.auth}\`)
        - traefik.http.routers.keycloak.entrypoints=websecure
        - traefik.http.routers.keycloak.tls.certresolver=letsencrypt
        - traefik.http.services.keycloak.loadbalancer.server.port=8080` : ""}

  openfga_db:
    image: postgres:17
    environment:
${renderEnvList({
		POSTGRES_USER: "openfga",
		POSTGRES_PASSWORD: runtimeEnv.OPENFGA_DB_PASSWORD,
		POSTGRES_DB: "openfga",
	})}
    volumes:
      - openfga_db_data:/var/lib/postgresql/data
    networks: [envsync]
${includeRuntimeInfra ? `
  openfga:
    image: openfga/openfga:v1.12.0
    command: run
    environment:
${renderEnvList({
		OPENFGA_DATASTORE_ENGINE: "postgres",
		OPENFGA_DATASTORE_URI: `postgres://openfga:${runtimeEnv.OPENFGA_DB_PASSWORD}@openfga_db:5432/openfga?sslmode=disable`,
		OPENFGA_HTTP_ADDR: "0.0.0.0:8090",
		OPENFGA_GRPC_ADDR: "0.0.0.0:8091",
	})}
    networks: [envsync]` : ""}

  minikms_db:
    image: postgres:17
    environment:
${renderEnvList({
		POSTGRES_USER: "postgres",
		POSTGRES_PASSWORD: runtimeEnv.MINIKMS_DB_PASSWORD,
		POSTGRES_DB: "minikms",
	})}
    volumes:
      - minikms_db_data:/var/lib/postgresql/data
    networks: [envsync]
${includeRuntimeInfra ? `
  minikms:
    image: ghcr.io/envsync-cloud/minikms:sha-735dfe8
    environment:
${renderEnvList({
		MINIKMS_ROOT_KEY: runtimeEnv.MINIKMS_ROOT_KEY,
		MINIKMS_DB_URL: `postgres://postgres:${runtimeEnv.MINIKMS_DB_PASSWORD}@minikms_db:5432/minikms?sslmode=disable`,
		MINIKMS_REDIS_URL: "redis://redis:6379",
		MINIKMS_GRPC_ADDR: "0.0.0.0:50051",
		MINIKMS_TLS_ENABLED: "false",
	})}
    networks: [envsync]` : ""}

  clickstack:
    image: ${config.images.clickstack}
    environment:
${renderEnvList({
		HYPERDX_APP_URL: `https://${hosts.obs}`,
		HYPERDX_API_URL: `https://${hosts.obs}`,
		FRONTEND_URL: `https://${hosts.obs}`,
	})}
    volumes:
      - clickstack_data:/data/db
      - clickstack_ch_data:/var/lib/clickhouse
      - clickstack_ch_logs:/var/log/clickhouse-server
    configs:
      - source: clickstack_clickhouse_conf
        target: /etc/clickhouse-server/config.d/envsync-listen-host.xml
    networks: [envsync]
    healthcheck:
      disable: true

  otel-agent:
    image: ${config.images.otel_agent}
    command: ["--config=/etc/otel-agent.yaml"]
    configs:
      - source: otel_agent_conf
        target: /etc/otel-agent.yaml
    networks: [envsync]
${includeAppServices ? `

  landing_nginx:
    image: nginx:1.27-alpine
    configs:
      - source: nginx_landing_conf
        target: /etc/nginx/conf.d/default.conf
    volumes:
      - ${RELEASES_ROOT}/landing/current:/srv/landing:ro
    networks: [envsync]

  web_nginx:
    image: nginx:1.27-alpine
    configs:
      - source: nginx_web_conf
        target: /etc/nginx/conf.d/default.conf
    volumes:
      - ${RELEASES_ROOT}/web/current:/srv/web:ro
    networks: [envsync]

  envsync_api_blue:
    image: ${config.images.api}
    environment:
${renderEnvList(apiEnvironment)}
    networks: [envsync]

  envsync_api_green:
    image: ${config.images.api}
    environment:
${renderEnvList(apiEnvironment)}
    networks: [envsync]` : ""}

networks:
  envsync:
    driver: overlay
    attachable: true

volumes:
  postgres_data:
  redis_data:
  rustfs_data:
  keycloak_db_data:
  openfga_db_data:
  minikms_db_data:
  clickstack_data:
  clickstack_ch_data:
  clickstack_ch_logs:

configs:
  keycloak_realm:
    file: ${KEYCLOAK_REALM_FILE}
  clickstack_clickhouse_conf:
    file: ${CLICKSTACK_CLICKHOUSE_CONF}
  otel_agent_conf:
    file: ${OTEL_AGENT_CONF}
  nginx_landing_conf:
    file: ${NGINX_LANDING_CONF}
  nginx_web_conf:
    file: ${NGINX_WEB_CONF}
`.trimStart();
}

function writeDeployArtifacts(config: DeployConfig, generated: DeployGeneratedState) {
	const runtimeEnv = buildRuntimeEnv(config, generated);
	logStep("Rendering deploy artifacts");
	writeFileMaybe(DEPLOY_ENV, renderEnvFile(runtimeEnv), 0o600);
	writeFileMaybe(
		INTERNAL_CONFIG_JSON,
		JSON.stringify({ config, generated: mergeGeneratedState(runtimeEnv, generated) }, null, 2) + "\n",
	);
	writeFileMaybe(VERSIONS_LOCK, JSON.stringify(config.images, null, 2) + "\n");
	writeFileMaybe(KEYCLOAK_REALM_FILE, renderKeycloakRealm(config, runtimeEnv));
	writeFileMaybe(TRAEFIK_DYNAMIC_FILE, renderTraefikDynamicConfig(config));
	writeFileMaybe(BOOTSTRAP_BASE_STACK_FILE, renderStack(config, runtimeEnv, "base"));
	writeFileMaybe(BOOTSTRAP_STACK_FILE, renderStack(config, runtimeEnv, "bootstrap"));
	writeFileMaybe(STACK_FILE, renderStack(config, runtimeEnv, "full"));
	writeFileMaybe(NGINX_WEB_CONF, renderNginxConf("web"));
	writeFileMaybe(NGINX_LANDING_CONF, renderNginxConf("landing"));
	writeFileMaybe(OTEL_AGENT_CONF, renderOtelAgentConfig(config));
	writeFileMaybe(CLICKSTACK_CLICKHOUSE_CONF, renderClickstackClickHouseConfig());
	logSuccess(currentOptions.dryRun ? "Deploy artifacts previewed" : "Deploy artifacts written");
}

function saveDesiredConfig(config: DeployConfig) {
	const internal = readInternalState();
	const generated = mergeGeneratedState(loadGeneratedEnv(), internal?.generated);
	logStep(`Saving desired config to ${DEPLOY_YAML}`);
	writeFileMaybe(DEPLOY_YAML, toYaml(config) + "\n");
	writeFileMaybe(
		INTERNAL_CONFIG_JSON,
		JSON.stringify({ config, generated }, null, 2) + "\n",
	);
	logSuccess(currentOptions.dryRun ? "Desired config previewed" : "Desired config saved");
}

function ensureRepoCheckout(config: DeployConfig) {
	logStep(`Ensuring pinned repo checkout at ${config.source.ref}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would ensure repo checkout at ${REPO_ROOT}`);
		return;
	}
	if (hasExplicitRepoOverride()) {
		if (!exists(path.join(REPO_ROOT, ".git"))) {
			throw new Error(`ENVSYNC_REPO_ROOT is set but no git repo was found at ${REPO_ROOT}`);
		}
		logInfo(`Using local repo override at ${REPO_ROOT}`);
		logSuccess("Local repo override is ready");
		return;
	}
	ensureDir(REPO_ROOT);
	if (!exists(path.join(REPO_ROOT, ".git"))) {
		logCommand("git", ["clone", config.source.repo_url, REPO_ROOT]);
		run("git", ["clone", config.source.repo_url, REPO_ROOT]);
	}
	logCommand("git", ["remote", "set-url", "origin", config.source.repo_url]);
	run("git", ["remote", "set-url", "origin", config.source.repo_url], { cwd: REPO_ROOT });
	logCommand("git", ["fetch", "--tags", "--force", "origin"]);
	run("git", ["fetch", "--tags", "--force", "origin"], { cwd: REPO_ROOT });
	logCommand("git", ["checkout", "--force", config.source.ref]);
	run("git", ["checkout", "--force", config.source.ref], { cwd: REPO_ROOT });
	logSuccess(`Pinned repo checkout ready at ${config.source.ref}`);
}

function extractStaticBundle(image: string, targetDir: string) {
	logStep(`Extracting static bundle from ${image}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would extract ${image} into ${targetDir}`);
		return;
	}
	ensureDir(targetDir);
	const containerId = run("docker", ["create", image], { quiet: true }).trim();
	try {
		run("docker", ["cp", `${containerId}:/app/dist/.`, targetDir]);
	} finally {
		run("docker", ["rm", "-f", containerId], { quiet: true });
	}
	logSuccess(`Static bundle extracted to ${targetDir}`);
}

function buildKeycloakImage(imageTag: string, repoRoot = REPO_ROOT) {
	const buildContext = path.join(repoRoot, "packages/envsync-keycloak-theme");
	if (!exists(path.join(buildContext, "Dockerfile"))) {
		throw new Error(`Missing Keycloak Docker build context at ${buildContext}`);
	}
	logStep(`Building Keycloak image ${imageTag}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would build ${imageTag} from ${buildContext}`);
		return;
	}
	logCommand("docker", ["build", "-t", imageTag, buildContext]);
	run("docker", ["build", "-t", imageTag, buildContext]);
	logSuccess(`Built Keycloak image ${imageTag}`);
}

function stackNetworkName(config: DeployConfig) {
	return `${config.services.stack_name}_envsync`;
}

function assertSwarmManager() {
	if (currentOptions.dryRun) {
		logDryRun("Skipping Docker Swarm manager validation");
		return;
	}
	logStep("Validating Docker Swarm manager state");
	const state = tryRun("docker", ["info", "--format", "{{.Swarm.LocalNodeState}}|{{.Swarm.ControlAvailable}}"], { quiet: true }).trim();
	if (state !== "active|true") {
		throw new Error("Docker Swarm is not initialized on this node. Run 'docker swarm init' or 'envsync-deploy preinstall' first.");
	}
	logSuccess("Docker Swarm manager is ready");
}

function waitForCommand(
	config: DeployConfig,
	label: string,
	image: string,
	command: string,
	timeoutSeconds = 120,
	env: Record<string, string> = {},
	volumes: string[] = [],
) {
	if (currentOptions.dryRun) {
		logDryRun(`Would wait for ${label}`);
		return;
	}
	logStep(`Waiting for ${label}`);
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		const args = ["run", "--rm", "--network", stackNetworkName(config)];
		for (const volume of volumes) {
			args.push("-v", volume);
		}
		for (const [key, value] of Object.entries(env)) {
			args.push("-e", `${key}=${value}`);
		}
		args.push(image, "sh", "-lc", command);
		if (commandSucceeds("docker", args)) {
			logSuccess(`${label} is ready`);
			return;
		}
		sleepSeconds(2);
	}
	throw new Error(`Timed out waiting for ${label}`);
}

function waitForPostgresService(config: DeployConfig, label: string, host: string, user: string, password: string) {
	waitForCommand(config, `${label} database readiness`, "postgres:17", `pg_isready -h ${host} -U ${user}`, 120, {
		PGPASSWORD: password,
	});
}

function waitForRedisService(config: DeployConfig) {
	waitForCommand(config, "redis readiness", "redis:7", "redis-cli -h redis ping | grep PONG");
}

function waitForTcpService(config: DeployConfig, label: string, host: string, port: number, timeoutSeconds = 120) {
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		if (commandSucceeds(
			"docker",
			["run", "--rm", "--network", stackNetworkName(config), "alpine:3.20", "sh", "-lc", `nc -z -w 2 ${host} ${port}`],
		)) {
			return;
		}
		sleepSeconds(2);
	}
	throw new Error(`Timed out waiting for ${label} at ${host}:${port}`);
}

function waitForHttpService(config: DeployConfig, label: string, url: string, timeoutSeconds = 120) {
	if (currentOptions.dryRun) {
		logDryRun(`Would wait for ${label} at ${url}`);
		return;
	}
	logStep(`Waiting for ${label} on ${url}`);
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		if (
			commandSucceeds("docker", [
				"run",
				"--rm",
				"--network",
				stackNetworkName(config),
				"alpine:3.20",
				"sh",
				"-lc",
				`wget -q -O /dev/null ${JSON.stringify(url)}`,
			])
		) {
			logSuccess(`${label} is ready`);
			return;
		}
		sleepSeconds(2);
	}
	throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function serviceContainerId(config: DeployConfig, serviceName: string) {
	const output = tryRun(
		"docker",
		[
			"ps",
			"--filter",
			`label=com.docker.swarm.service.name=${config.services.stack_name}_${serviceName}`,
			"--format",
			"{{.ID}}",
		],
		{ quiet: true },
	);
	return output
		.split(/\r?\n/)
		.map(line => line.trim())
		.find(Boolean) ?? "";
}

function runOpenFgaMigrate(config: DeployConfig, runtimeEnv: RuntimeEnv) {
	logStep("Running OpenFGA datastore migrations");
	if (currentOptions.dryRun) {
		logDryRun("Would run OpenFGA datastore migrations");
		logCommand("docker", [
			"run",
			"--rm",
			"--network",
			stackNetworkName(config),
			"-e",
			"OPENFGA_DATASTORE_ENGINE=postgres",
			"-e",
			`OPENFGA_DATASTORE_URI=postgres://openfga:${runtimeEnv.OPENFGA_DB_PASSWORD}@openfga_db:5432/openfga?sslmode=disable`,
			"openfga/openfga:v1.12.0",
			"migrate",
		]);
		return;
	}
	run("docker", [
		"run",
		"--rm",
		"--network",
		stackNetworkName(config),
		"-e",
		"OPENFGA_DATASTORE_ENGINE=postgres",
		"-e",
		`OPENFGA_DATASTORE_URI=postgres://openfga:${runtimeEnv.OPENFGA_DB_PASSWORD}@openfga_db:5432/openfga?sslmode=disable`,
		"openfga/openfga:v1.12.0",
		"migrate",
	]);
	logSuccess("OpenFGA datastore migrations completed");
}

function runMiniKmsMigrate(config: DeployConfig, runtimeEnv: RuntimeEnv) {
	logStep("Running miniKMS datastore migrations");
	if (currentOptions.dryRun) {
		logDryRun("Would run miniKMS datastore migrations");
		logCommand("docker", [
			"run",
			"--rm",
			"--network",
			stackNetworkName(config),
			"-e",
			`PGPASSWORD=${runtimeEnv.MINIKMS_DB_PASSWORD}`,
			"-v",
			`${path.join(REPO_ROOT, "docker/minikms/migrations")}:/migrations:ro`,
			"postgres:17",
			"sh",
			"-lc",
			"psql -h minikms_db -U postgres -d minikms -f /migrations/001_initial_schema.sql && psql -h minikms_db -U postgres -d minikms -f /migrations/002_vault_storage.sql",
		]);
		return;
	}
	run("docker", [
		"run",
		"--rm",
		"--network",
		stackNetworkName(config),
		"-e",
		`PGPASSWORD=${runtimeEnv.MINIKMS_DB_PASSWORD}`,
		"-v",
		`${path.join(REPO_ROOT, "docker/minikms/migrations")}:/migrations:ro`,
		"postgres:17",
		"sh",
		"-lc",
		"psql -h minikms_db -U postgres -d minikms -f /migrations/001_initial_schema.sql && psql -h minikms_db -U postgres -d minikms -f /migrations/002_vault_storage.sql",
	]);
	logSuccess("miniKMS datastore migrations completed");
}

function runBootstrapInit(config: DeployConfig) {
	logStep("Running API bootstrap init");
	if (currentOptions.dryRun) {
		logDryRun("Would run API bootstrap init and persist generated OpenFGA IDs");
		logCommand("docker", [
			"run",
			"--rm",
			"--network",
			stackNetworkName(config),
			"--env-file",
			DEPLOY_ENV,
			"-e",
			"SKIP_ROOT_ENV=1",
			"-e",
			"SKIP_ROOT_ENV_WRITE=1",
			config.images.api,
			"bun",
			"run",
			"scripts/prod-init.ts",
			"--json",
			"--no-write-root-env",
		]);
		return {
			openfgaStoreId: "",
			openfgaModelId: "",
		};
	}
	const output = run(
		"docker",
		[
			"run",
			"--rm",
			"--network",
			stackNetworkName(config),
			"--env-file",
			DEPLOY_ENV,
			"-e",
			"SKIP_ROOT_ENV=1",
			"-e",
			"SKIP_ROOT_ENV_WRITE=1",
			config.images.api,
			"bun",
			"run",
			"scripts/prod-init.ts",
			"--json",
			"--no-write-root-env",
		],
		{ quiet: true },
	).trim();
	const result = parseBootstrapInitJson(output);
	if (!result.openfgaStoreId || !result.openfgaModelId) {
		throw new Error("Bootstrap init did not return OpenFGA IDs");
	}
	logSuccess("API bootstrap init completed");
	return {
		openfgaStoreId: result.openfgaStoreId,
		openfgaModelId: result.openfgaModelId,
	};
}

function parseClickstackBootstrapJson(output: string) {
	const trimmed = output.trim();
	if (!trimmed) {
		throw new Error("ClickStack bootstrap returned no JSON output");
	}

	const lines = trimmed
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean);

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const candidate = lines[index]!;
		if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
		try {
			return JSON.parse(candidate) as {
				operatorEmail?: string;
				accessKey?: string;
				browserApiKey?: string;
			};
		} catch {
			continue;
		}
	}

	throw new Error(`ClickStack bootstrap returned non-JSON output.\nCaptured stdout:\n${trimmed}`);
}

function runClickstackBootstrap(config: DeployConfig) {
	logStep("Running ClickStack self-host bootstrap");
	const { generated } = loadState();
	if (currentOptions.dryRun) {
		logDryRun("Would bootstrap ClickStack sources and dashboards");
		logCommand("node", [path.join(REPO_ROOT, "scripts/bootstrap-clickstack-selfhost.mjs")]);
		return {
			browserApiKey: generated.clickstack.browser_api_key,
		};
	}
	const deadline = Date.now() + 180 * 1000;
	let lastError = "unknown error";
	while (Date.now() < deadline) {
		try {
			const output = run("node", [path.join(REPO_ROOT, "scripts/bootstrap-clickstack-selfhost.mjs")], {
				env: {
					ENVSYNC_STACK_NAME: config.services.stack_name,
					ENVSYNC_ROOT_DOMAIN: config.domain.root_domain,
					ENVSYNC_CLICKSTACK_OPERATOR_EMAIL: generated.clickstack.operator_email,
					ENVSYNC_CLICKSTACK_OPERATOR_PASSWORD: generated.clickstack.operator_password,
					ENVSYNC_CLICKSTACK_ACCESS_KEY: generated.clickstack.access_key,
					ENVSYNC_CLICKSTACK_BROWSER_API_KEY: generated.clickstack.browser_api_key,
					ENVSYNC_CLICKSTACK_ALERT_WEBHOOK_URL: config.observability.alert_webhook_url ?? "",
					ENVSYNC_CLICKSTACK_ALERT_WEBHOOK_HEADERS: JSON.stringify(config.observability.alert_webhook_headers ?? {}),
				},
				quiet: true,
			});
			const result = parseClickstackBootstrapJson(output);
			logSuccess("ClickStack self-host bootstrap completed");
			return result;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			sleepSeconds(3);
		}
	}
	throw new Error(`Timed out bootstrapping ClickStack: ${lastError}`);
}

function logClickstackCredentials(generated: DeployGeneratedState) {
	logInfo(`ClickStack operator email: ${generated.clickstack.operator_email}`);
	logInfo(`ClickStack operator password: ${generated.clickstack.operator_password}`);
	logInfo(`ClickStack access key: ${generated.clickstack.access_key}`);
	if (generated.clickstack.browser_api_key) {
		logInfo(`ClickStack browser API key: ${generated.clickstack.browser_api_key}`);
	}
}

function parseBootstrapInitJson(output: string) {
	const trimmed = output.trim();
	if (!trimmed) {
		throw new Error("Bootstrap init returned no JSON output");
	}

	try {
		return JSON.parse(trimmed) as { openfgaStoreId?: string; openfgaModelId?: string };
	} catch {
		const lines = trimmed
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(Boolean);

		for (let index = lines.length - 1; index >= 0; index -= 1) {
			const candidate = lines[index]!;
			if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
			try {
				return JSON.parse(candidate) as { openfgaStoreId?: string; openfgaModelId?: string };
			} catch {
				continue;
			}
		}

		throw new Error(
			`Bootstrap init returned non-JSON output.\nCaptured stdout:\n${trimmed}`,
		);
	}
}

function readRenderedRuntimeConfig(filePath: string) {
	if (!exists(filePath)) return null;
	const raw = fs.readFileSync(filePath, "utf8").trim();
	const prefix = "window.__ENVSYNC_RUNTIME_CONFIG__ = ";
	if (!raw.startsWith(prefix) || !raw.endsWith(";")) return null;
	try {
		return JSON.parse(raw.slice(prefix.length, -1)) as {
			hyperdxApiKey?: string;
			hyperdxUrl?: string;
			hyperdxDisabled?: boolean;
			releaseVersion?: string;
		};
	} catch {
		return null;
	}
}

function resolveClickstackContainerId(config: DeployConfig) {
	const output = tryRun(
		"docker",
		[
			"ps",
			"--filter",
			`label=com.docker.swarm.service.name=${config.services.stack_name}_clickstack`,
			"--format",
			"{{.ID}}",
		],
		{ quiet: true },
	).trim();
	return output.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "";
}

function runClickstackMongoJson<T>(config: DeployConfig, script: string): T | null {
	const containerId = resolveClickstackContainerId(config);
	if (!containerId) return null;
	try {
		const payload = Buffer.from(script, "utf8").toString("base64");
		const output = run(
			"docker",
			[
				"exec",
				"-e",
				`HDX_SCRIPT=${payload}`,
				containerId,
				"sh",
				"-lc",
				"printf '%s' \"$HDX_SCRIPT\" | base64 -d >/tmp/envsync-clickstack-health.js && mongo hyperdx --quiet /tmp/envsync-clickstack-health.js",
			],
			{ quiet: true },
		).trim();
		const parsed = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1);
		if (!parsed) return null;
		return JSON.parse(parsed) as T;
	} catch {
		return null;
	}
}

function getClickstackSearchState(config: DeployConfig) {
	return runClickstackMongoJson<{
		sourceNames: string[];
		savedSearches: Array<{ name: string; tags?: string[] }>;
		dashboardTags: string[];
	}>(config, `
var team = db.teams.findOne({ name: ${JSON.stringify(CLICKSTACK_SELFHOST_TEAM_NAME)} });
if (!team) {
  print(JSON.stringify({ sourceNames: [], savedSearches: [], dashboardTags: [] }));
  quit();
}

var sourceNames = db.sources.find({ team: team._id }, { name: 1 }).toArray().map(function(source) {
  return source.name;
}).filter(Boolean);

var savedSearches = db.savedsearches.find({ team: team._id }, { name: 1, tags: 1 }).toArray().map(function(search) {
  return {
    name: search.name,
    tags: Array.isArray(search.tags) ? search.tags : []
  };
}).filter(function(search) {
  return Boolean(search.name);
});

var dashboardTags = [];
db.dashboards.find({ team: team._id }, { tags: 1 }).toArray().forEach(function(dashboard) {
  if (Array.isArray(dashboard.tags)) {
    dashboard.tags.forEach(function(tag) {
      dashboardTags.push(tag);
    });
  }
});

print(JSON.stringify({
  sourceNames: sourceNames,
  savedSearches: savedSearches,
  dashboardTags: dashboardTags
}));
`);
}

function hasCompleteBootstrapState(generated: DeployGeneratedState) {
	return REQUIRED_BOOTSTRAP_ENV_KEYS.every(key => {
		switch (key) {
			case "S3_SECRET_KEY":
				return generated.secrets.s3_secret_key.length > 0;
			case "KEYCLOAK_WEB_CLIENT_SECRET":
				return generated.secrets.keycloak_web_client_secret.length > 0;
			case "KEYCLOAK_API_CLIENT_SECRET":
				return generated.secrets.keycloak_api_client_secret.length > 0;
			case "OPENFGA_DB_PASSWORD":
				return generated.secrets.openfga_db_password.length > 0;
			case "MINIKMS_ROOT_KEY":
				return generated.secrets.minikms_root_key.length > 0;
			case "MINIKMS_DB_PASSWORD":
				return generated.secrets.minikms_db_password.length > 0;
			case "OPENFGA_STORE_ID":
				return generated.openfga.store_id.length > 0;
			case "OPENFGA_MODEL_ID":
				return generated.openfga.model_id.length > 0;
			default:
				return false;
		}
	});
}

function assertBootstrapState(generated: DeployGeneratedState) {
	if (!hasCompleteBootstrapState(generated)) {
		throw new Error("Missing bootstrap state. Run 'envsync-deploy bootstrap' first.");
	}
}

function parseReplicaHealth(raw: string): ServiceHealth {
	const match = raw.match(/^(\d+)\/(\d+)$/);
	if (!match) return raw.trim() ? "degraded" : "missing";
	const current = Number(match[1]);
	const desired = Number(match[2]);
	if (desired === 0) return "missing";
	if (current === desired) return "healthy";
	return "degraded";
}

function listStackServices(config: DeployConfig) {
	const output = tryRun(
		"docker",
		["stack", "services", config.services.stack_name, "--format", "{{.Name}}|{{.Replicas}}"],
		{ quiet: true },
	);
	const services = new Map<string, ServiceHealth>();
	for (const line of output.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const [name, replicas] = line.split("|");
		services.set(name, parseReplicaHealth(replicas ?? ""));
	}
	return services;
}

function listManagedContainers(config: DeployConfig) {
	const output = tryRun("docker", ["ps", "-aq", "--filter", `name=^/${config.services.stack_name}_`], { quiet: true });
	return output
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean);
}

function stackExists(config: DeployConfig) {
	const output = tryRun("docker", ["stack", "ls", "--format", "{{.Name}}"], { quiet: true });
	return output
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
		.includes(config.services.stack_name);
}

function waitForStackRemoval(config: DeployConfig, timeoutSeconds = 60) {
	if (currentOptions.dryRun) {
		logDryRun(`Would wait for stack ${config.services.stack_name} to be removed`);
		return;
	}
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		if (!stackExists(config)) {
			return;
		}
		sleepSeconds(2);
	}
	throw new Error(`Timed out waiting for stack ${config.services.stack_name} to be removed`);
}

async function confirmBootstrapReset(config: DeployConfig) {
	const volumeNames = STACK_VOLUMES.map(volume => stackVolumeName(config, volume));
	const containerIds = listManagedContainers(config);
	const networkName = stackNetworkName(config);
	logWarn("Bootstrap will delete existing EnvSync Docker resources before rebuilding infra.");
	logWarn(`Stack: ${config.services.stack_name}`);
	logWarn(`Network: ${networkName}`);
	logWarn(`Volumes: ${volumeNames.join(", ")}`);
	if (containerIds.length > 0) {
		logWarn(`Containers: ${containerIds.join(", ")}`);
	} else {
		logWarn("Containers: none currently matched");
	}
	logWarn("This removes existing deployment data for the managed EnvSync services.");
	if (currentOptions.force) {
		logWarn("Skipping confirmation because --force was provided.");
		logSuccess("Destructive bootstrap reset confirmed");
		return;
	}
	const response = await askRequired(chalk.bold.red('Type "yes" to continue:'));
	if (response !== "yes") {
		throw new Error("Bootstrap aborted. Confirmation did not match 'yes'.");
	}
	logSuccess("Destructive bootstrap reset confirmed");
}

function cleanupBootstrapState(config: DeployConfig) {
	const volumeNames = STACK_VOLUMES.map(volume => stackVolumeName(config, volume));
	const containerIds = listManagedContainers(config);
	const networkName = stackNetworkName(config);

	logStep("Removing existing EnvSync deployment resources");
	if (currentOptions.dryRun) {
		if (stackExists(config)) {
			logDryRun(`Would remove stack ${config.services.stack_name}`);
			logCommand("docker", ["stack", "rm", config.services.stack_name]);
		} else {
			logDryRun(`No existing stack named ${config.services.stack_name} found`);
		}
		if (containerIds.length > 0) {
			logDryRun(`Would remove containers: ${containerIds.join(", ")}`);
			logCommand("docker", ["rm", "-f", ...containerIds]);
		}
		logDryRun(`Would remove network ${networkName} if present`);
		logCommand("docker", ["network", "rm", networkName]);
		for (const volumeName of volumeNames) {
			logDryRun(`Would remove volume ${volumeName}`);
			logCommand("docker", ["volume", "rm", "-f", volumeName]);
		}
		logSuccess("Bootstrap cleanup preview completed");
		return;
	}

	if (stackExists(config)) {
		logCommand("docker", ["stack", "rm", config.services.stack_name]);
		run("docker", ["stack", "rm", config.services.stack_name]);
		waitForStackRemoval(config);
	}

	const refreshedContainers = listManagedContainers(config);
	if (refreshedContainers.length > 0) {
		logCommand("docker", ["rm", "-f", ...refreshedContainers]);
		const removed = runIgnoringAbsent("docker", ["rm", "-f", ...refreshedContainers], {
			absentPatterns: ["no such container", "not found"],
		});
		if (!removed) {
			logInfo("Managed containers were already absent");
		}
	}

	if (commandSucceeds("docker", ["network", "inspect", networkName])) {
		logCommand("docker", ["network", "rm", networkName]);
		const removed = runIgnoringAbsent("docker", ["network", "rm", networkName], {
			absentPatterns: ["network", "not found", "no such network"],
		});
		if (!removed) {
			logInfo(`Network ${networkName} was already absent`);
		}
	}

	for (const volumeName of volumeNames) {
		if (commandSucceeds("docker", ["volume", "inspect", volumeName])) {
			logCommand("docker", ["volume", "rm", "-f", volumeName]);
			const removed = runIgnoringAbsent("docker", ["volume", "rm", "-f", volumeName], {
				absentPatterns: ["no such volume", "not found"],
			});
			if (!removed) {
				logInfo(`Volume ${volumeName} was already absent`);
			}
		}
	}

	logSuccess("Existing EnvSync deployment resources removed");
}

function serviceHealth(services: Map<string, ServiceHealth>, name: string) {
	return services.get(`${name}`) ?? "missing";
}

function apiHealth(services: Map<string, ServiceHealth>, stackName: string): ServiceHealth {
	const blue = serviceHealth(services, `${stackName}_envsync_api_blue`);
	const green = serviceHealth(services, `${stackName}_envsync_api_green`);
	if (blue === "missing" && green === "missing") return "missing";
	if (blue === "healthy" || green === "healthy") return "healthy";
	return "degraded";
}

function waitForHealthyServices(
	config: DeployConfig,
	checks: Array<{ label: string; getHealth: (services: Map<string, ServiceHealth>) => ServiceHealth }>,
	timeoutSeconds = 180,
) {
	if (currentOptions.dryRun) {
		logDryRun(`Would wait for ${checks.map(check => check.label).join(", ")} service readiness`);
		return;
	}
	const deadline = Date.now() + timeoutSeconds * 1000;
	while (Date.now() < deadline) {
		const services = listStackServices(config);
		const pending = checks.filter(check => check.getHealth(services) !== "healthy");
		if (pending.length === 0) {
			return;
		}
		sleepSeconds(3);
	}
	const services = listStackServices(config);
	const pending = checks
		.map(check => `${check.label}=${check.getHealth(services)}`)
		.join(", ");
	throw new Error(`Timed out waiting for deployed services to become healthy: ${pending}`);
}

async function cmdPreinstall() {
	ensureDir(HOST_ROOT);
	ensureDir(DEPLOY_ROOT);
	ensureDir(RELEASES_ROOT);
	ensureDir(BACKUPS_ROOT);
	ensureDir(ETC_ROOT);
	ensureDir(TRAEFIK_STATE_ROOT);
	run("bash", ["-lc", "command -v apt-get >/dev/null"]);
	run("sudo", ["apt-get", "update"]);
	run("sudo", ["apt-get", "install", "-y", "docker.io", "docker-compose-v2", "git", "curl", "jq", "openssl", "tar"]);
	run("sudo", ["systemctl", "enable", "--now", "docker"]);
	try {
		run("docker", ["swarm", "init"]);
	} catch {
	}
	run("docker", ["buildx", "version"]);
	run("bash", ["-lc", "curl -fsSL https://ghcr.io >/dev/null"]);
	run("bash", ["-lc", "curl -fsSL https://acme-v02.api.letsencrypt.org/directory >/dev/null"]);
}

async function cmdSetup() {
	logSection("Setup");
	const rootDomain = await ask("Root domain", "example.com");
	const acmeEmail = await ask("ACME email", `admin@${rootDomain}`);
	const releaseVersion = await ask("Release version", getDeployCliVersion());
	assertSemverVersion(releaseVersion, "release version");
	const releaseImages = versionedImages(releaseVersion);
	const adminUser = await ask("Keycloak admin user", "admin");
	const adminPassword = await ask("Keycloak admin password", randomSecret(12));
	const smtpHost = await ask("SMTP host", "smtp.example.com");
	const smtpPort = Number(await ask("SMTP port", "587"));
	const smtpSecure = (await ask("SMTP secure (true/false)", "true")) === "true";
	const smtpUser = await ask("SMTP user", "");
	const smtpPass = await ask("SMTP pass", "");
	const smtpFrom = await ask("SMTP from", `noreply@${rootDomain}`);
	const retentionDays = Number(await ask("ClickStack retention days", "30"));
	const publicAuth = (await ask("Expose auth.<domain> publicly (true/false)", "true")) === "true";
	const publicObs = (await ask("Expose obs.<domain> publicly (true/false)", "true")) === "true";
	const mailpitEnabled = (await ask("Enable mailpit (true/false)", "false")) === "true";

	const config: DeployConfig = {
		source: defaultSourceConfig(releaseVersion),
		release: {
			version: releaseVersion,
		},
		domain: { root_domain: rootDomain, acme_email: acmeEmail },
		images: {
			api: releaseImages.api,
			keycloak: releaseImages.keycloak,
			web: releaseImages.web,
			landing: releaseImages.landing,
			clickstack: "clickhouse/clickstack-all-in-one:latest",
			traefik: "traefik:v3.6.6",
			otel_agent: "otel/opentelemetry-collector-contrib:0.111.0",
		},
		services: {
			stack_name: "envsync",
			api_port: 4000,
			public_http_port: 80,
			public_https_port: 443,
			clickstack_ui_port: 8080,
			clickstack_otlp_http_port: 4318,
			clickstack_otlp_grpc_port: 4317,
			keycloak_port: 8080,
			rustfs_port: 9000,
			rustfs_console_port: 9001,
		},
		auth: {
			keycloak_realm: "envsync",
			admin_user: adminUser,
			admin_password: adminPassword,
			web_client_id: "envsync-web",
			api_client_id: "envsync-api",
			cli_client_id: "envsync-cli",
		},
		observability: {
			retention_days: retentionDays,
			public_obs: publicObs,
		},
		backup: {
			output_dir: BACKUPS_ROOT,
			encrypted: true,
		},
		smtp: {
			host: smtpHost,
			port: smtpPort,
			secure: smtpSecure,
			user: smtpUser,
			pass: smtpPass,
			from: smtpFrom,
		},
		exposure: {
			public_auth: publicAuth,
			public_obs: publicObs,
			mailpit_enabled: mailpitEnabled,
			s3_public: true,
			s3_console_public: true,
		},
	};

	saveDesiredConfig(config);
	logSuccess(`Config written to ${DEPLOY_YAML}`);
	logInfo(`Pinned source checkout: ${config.source.repo_url} @ ${config.source.ref}`);
	logInfo("Create these DNS records:");
	console.log(JSON.stringify(domainMap(rootDomain), null, 2));
}

async function cmdBootstrap() {
	logSection("Bootstrap");
	const { config, generated } = loadState();
	const nextGenerated = ensureGeneratedRuntimeState(config, resetBootstrapGeneratedState(generated));
	const runtimeEnv = buildRuntimeEnv(config, nextGenerated);
	logReleaseContext(config);
	assertSwarmManager();
	if (currentOptions.dryRun) {
		logWarn("Dry-run mode: bootstrap reset will be previewed but not executed.");
	}
	await confirmBootstrapReset(config);
	cleanupBootstrapState(config);
	ensureRepoCheckout(config);
	writeDeployArtifacts(config, nextGenerated);
	buildKeycloakImage(config.images.keycloak);
	if (currentOptions.dryRun) {
		logDryRun(`Would deploy base bootstrap stack for ${config.services.stack_name}`);
		logCommand("docker", ["stack", "deploy", "-c", BOOTSTRAP_BASE_STACK_FILE, config.services.stack_name]);
	} else {
		logStep("Deploying base bootstrap stack");
		logCommand("docker", ["stack", "deploy", "-c", BOOTSTRAP_BASE_STACK_FILE, config.services.stack_name]);
		run("docker", ["stack", "deploy", "-c", BOOTSTRAP_BASE_STACK_FILE, config.services.stack_name]);
		logSuccess("Base bootstrap stack deployed");
	}
	waitForPostgresService(config, "postgres", "postgres", "postgres", "envsync-postgres");
	waitForRedisService(config);
	waitForTcpService(config, "rustfs", "rustfs", 9000);
	waitForPostgresService(config, "keycloak", "keycloak_db", "keycloak", runtimeEnv.KEYCLOAK_DB_PASSWORD);
	waitForPostgresService(config, "openfga", "openfga_db", "openfga", runtimeEnv.OPENFGA_DB_PASSWORD);
	waitForPostgresService(config, "minikms", "minikms_db", "postgres", runtimeEnv.MINIKMS_DB_PASSWORD);
	runOpenFgaMigrate(config, runtimeEnv);
	runMiniKmsMigrate(config, runtimeEnv);
	if (currentOptions.dryRun) {
		logDryRun(`Would deploy runtime bootstrap stack for ${config.services.stack_name}`);
		logCommand("docker", ["stack", "deploy", "-c", BOOTSTRAP_STACK_FILE, config.services.stack_name]);
	} else {
		logStep("Deploying runtime bootstrap stack");
		logCommand("docker", ["stack", "deploy", "-c", BOOTSTRAP_STACK_FILE, config.services.stack_name]);
		run("docker", ["stack", "deploy", "-c", BOOTSTRAP_STACK_FILE, config.services.stack_name]);
		logSuccess("Runtime bootstrap stack deployed");
	}
	waitForHttpService(config, "keycloak management readiness", "http://keycloak:9000/health/ready", 180);
	waitForHttpService(config, "openfga", "http://openfga:8090/stores");
	waitForTcpService(config, "minikms", "minikms", 50051);
	const initResult = runBootstrapInit(config);
	const clickstackBootstrapResult = runClickstackBootstrap(config);
	const persistedGenerated = normalizeGeneratedState({
		openfga: {
			store_id: initResult.openfgaStoreId,
			model_id: initResult.openfgaModelId,
		},
		clickstack: {
			...nextGenerated.clickstack,
			browser_api_key: clickstackBootstrapResult.browserApiKey ?? nextGenerated.clickstack.browser_api_key,
		},
		secrets: nextGenerated.secrets,
		bootstrap: nextGenerated.bootstrap,
	});
	if (!currentOptions.dryRun) {
		writeDeployArtifacts(config, persistedGenerated);
	}
	if (currentOptions.dryRun) {
		logDryRun("Skipping generated OpenFGA ID persistence in preview mode");
		logSuccess("Bootstrap dry-run completed");
		return;
	}
	const bootstrappedGenerated = normalizeGeneratedState({
		openfga: {
			store_id: initResult.openfgaStoreId,
			model_id: initResult.openfgaModelId,
		},
		clickstack: persistedGenerated.clickstack,
		secrets: nextGenerated.secrets,
		bootstrap: {
			completed_at: new Date().toISOString(),
		},
	});
	writeDeployArtifacts(config, bootstrappedGenerated);
	logClickstackCredentials(bootstrappedGenerated);
	logSuccess("Bootstrap completed");
}

async function cmdDeploy() {
	logSection("Deploy");
	const { config, generated } = loadState();
	logReleaseContext(config);
	assertSwarmManager();
	assertBootstrapState(generated);
	if (!currentOptions.dryRun) {
		const services = listStackServices(config);
		if (
			serviceHealth(services, `${config.services.stack_name}_keycloak`) === "missing" ||
			serviceHealth(services, `${config.services.stack_name}_openfga`) === "missing" ||
			serviceHealth(services, `${config.services.stack_name}_minikms`) === "missing"
		) {
			throw new Error("Bootstrap has not completed successfully. Run 'envsync-deploy bootstrap' again.");
		}
	} else {
		logDryRun("Skipping runtime bootstrap service validation");
	}
	ensureRepoCheckout(config);
	writeDeployArtifacts(config, generated);
	buildKeycloakImage(config.images.keycloak);
	if (currentOptions.dryRun) {
		logDryRun(`Would ensure ${RELEASES_ROOT}/web/current exists`);
		logDryRun(`Would ensure ${RELEASES_ROOT}/landing/current exists`);
	} else {
		ensureDir(`${RELEASES_ROOT}/web/current`);
		ensureDir(`${RELEASES_ROOT}/landing/current`);
	}
	extractStaticBundle(config.images.web, `${RELEASES_ROOT}/web/current`);
	extractStaticBundle(config.images.landing, `${RELEASES_ROOT}/landing/current`);
	writeFileMaybe(`${RELEASES_ROOT}/web/current/runtime-config.js`, renderFrontendRuntimeConfig(config, generated));
	writeFileMaybe(`${RELEASES_ROOT}/landing/current/runtime-config.js`, renderFrontendRuntimeConfig(config, generated));
	if (currentOptions.dryRun) {
		logDryRun(`Would deploy full stack for ${config.services.stack_name}`);
		logCommand("docker", ["stack", "deploy", "-c", STACK_FILE, config.services.stack_name]);
		logSuccess("Deploy dry-run completed");
		return;
	}
	logStep("Deploying full stack");
	logCommand("docker", ["stack", "deploy", "-c", STACK_FILE, config.services.stack_name]);
	run("docker", ["stack", "deploy", "-c", STACK_FILE, config.services.stack_name]);
	waitForHealthyServices(config, [
		{ label: "traefik", getHealth: services => serviceHealth(services, `${config.services.stack_name}_traefik`) },
		{ label: "keycloak", getHealth: services => serviceHealth(services, `${config.services.stack_name}_keycloak`) },
		{ label: "openfga", getHealth: services => serviceHealth(services, `${config.services.stack_name}_openfga`) },
		{ label: "minikms", getHealth: services => serviceHealth(services, `${config.services.stack_name}_minikms`) },
		{ label: "clickstack", getHealth: services => serviceHealth(services, `${config.services.stack_name}_clickstack`) },
		{ label: "landing", getHealth: services => serviceHealth(services, `${config.services.stack_name}_landing_nginx`) },
		{ label: "web", getHealth: services => serviceHealth(services, `${config.services.stack_name}_web_nginx`) },
		{ label: "api", getHealth: services => apiHealth(services, config.services.stack_name) },
	]);
	logSuccess("Deploy completed");
}

async function cmdHealth(asJson: boolean) {
	const { config, generated } = loadState();
	const hosts = domainMap(config.domain.root_domain);
	const services = listStackServices(config);
	const stackName = config.services.stack_name;
	const traefikDynamic = exists(TRAEFIK_DYNAMIC_FILE) ? fs.readFileSync(TRAEFIK_DYNAMIC_FILE, "utf8") : "";
	const webRuntimeConfig = readRenderedRuntimeConfig(path.join(RELEASES_ROOT, "web", "current", "runtime-config.js"));
	const landingRuntimeConfig = readRenderedRuntimeConfig(path.join(RELEASES_ROOT, "landing", "current", "runtime-config.js"));
	const clickstackSearchState = getClickstackSearchState(config);
	const sourceNames = new Set(clickstackSearchState?.sourceNames ?? []);
	const savedSearchNames = new Set((clickstackSearchState?.savedSearches ?? []).map(search => search.name).filter(Boolean));
	const savedSearchTags = new Set((clickstackSearchState?.savedSearches ?? []).flatMap(search => search.tags ?? []));
	const dashboardTags = new Set(clickstackSearchState?.dashboardTags ?? []);
	const combinedTags = new Set([...savedSearchTags, ...dashboardTags]);
	const bootstrapServices = {
		postgres: serviceHealth(services, `${stackName}_postgres`),
		redis: serviceHealth(services, `${stackName}_redis`),
		rustfs: serviceHealth(services, `${stackName}_rustfs`),
		keycloak: serviceHealth(services, `${stackName}_keycloak`),
		openfga: serviceHealth(services, `${stackName}_openfga`),
		minikms: serviceHealth(services, `${stackName}_minikms`),
	};
	const checks = {
		bootstrap: {
			completed: hasCompleteBootstrapState(generated) && generated.bootstrap.completed_at.length > 0,
			completed_at: generated.bootstrap.completed_at || null,
			services: bootstrapServices,
		},
		deploy: {
			api: apiHealth(services, stackName),
			web: serviceHealth(services, `${stackName}_web_nginx`),
			landing: serviceHealth(services, `${stackName}_landing_nginx`),
		},
		observability: {
			service: serviceHealth(services, `${stackName}_clickstack`),
			obs_ui: {
				url: `https://${hosts.obs}`,
				configured: traefikDynamic.includes("obs-ui-router"),
			},
			obs_api: {
				url: `https://${hosts.obs}/api`,
				configured: traefikDynamic.includes("obs-api-router"),
			},
			obs_otlp: {
				url: `https://${hosts.obs}/v1/traces`,
				configured: traefikDynamic.includes("obs-otlp-router"),
			},
			frontend_otel_endpoint: {
				web: `https://${hosts.obs}`,
				landing: `https://${hosts.obs}`,
			},
			browser_replay_runtime: {
				web: {
					configured: Boolean(webRuntimeConfig?.hyperdxApiKey && webRuntimeConfig?.hyperdxUrl && !webRuntimeConfig?.hyperdxDisabled),
					hyperdx_url: webRuntimeConfig?.hyperdxUrl ?? null,
				},
				landing: {
					configured: Boolean(landingRuntimeConfig?.hyperdxApiKey && landingRuntimeConfig?.hyperdxUrl && !landingRuntimeConfig?.hyperdxDisabled),
					hyperdx_url: landingRuntimeConfig?.hyperdxUrl ?? null,
				},
			},
			sessions_source: {
				configured: sourceNames.has("Sessions"),
			},
			saved_searches: {
				configured: REQUIRED_CLICKSTACK_SAVED_SEARCHES.every(name => savedSearchNames.has(name)),
				required: [...REQUIRED_CLICKSTACK_SAVED_SEARCHES],
				missing: REQUIRED_CLICKSTACK_SAVED_SEARCHES.filter(name => !savedSearchNames.has(name)),
			},
			tags: {
				configured: REQUIRED_CLICKSTACK_TAGS.every(tag => combinedTags.has(tag)),
				required: [...REQUIRED_CLICKSTACK_TAGS],
				missing: REQUIRED_CLICKSTACK_TAGS.filter(tag => !combinedTags.has(tag)),
			},
		},
		public: {
			landing: `https://${hosts.landing}`,
			app: `https://${hosts.app}`,
			api: `https://${hosts.api}/health`,
			auth: `https://${hosts.auth}/realms/${config.auth.keycloak_realm}/.well-known/openid-configuration`,
			obs: `https://${hosts.obs}`,
		},
	};
	if (asJson) {
		console.log(JSON.stringify(checks, null, 2));
		return;
	}
	console.log(JSON.stringify(checks, null, 2));
}

async function cmdUpgrade() {
	logSection("Upgrade");
	const { config } = loadState();
	logReleaseContext(config);
	config.images = {
		...config.images,
		...versionedImages(config.release.version),
	};
	saveDesiredConfig(config);
	if (currentOptions.dryRun) {
		logDryRun(`Would upgrade stack to release ${config.release.version}`);
	}
	await cmdDeploy();
}

async function cmdUpgradeDeps() {
	logSection("Upgrade Dependencies");
	const { config } = loadState();
	logReleaseContext(config);
	config.images.traefik = "traefik:v3.6.6";
	config.images.clickstack = "clickhouse/clickstack-all-in-one:latest";
	config.images.otel_agent = "otel/opentelemetry-collector-contrib:0.111.0";
	saveDesiredConfig(config);
	if (currentOptions.dryRun) {
		logDryRun("Would refresh dependency image tags and redeploy");
	}
	await cmdDeploy();
}

function sha256File(filePath: string) {
	const hash = createHash("sha256");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("hex");
}

function stackVolumeName(config: DeployConfig, name: (typeof STACK_VOLUMES)[number]) {
	return `${config.services.stack_name}_${name}`;
}

function backupDockerVolume(volumeName: string, targetDir: string) {
	logStep(`Backing up Docker volume ${volumeName}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would back up ${volumeName} into ${targetDir}`);
		return;
	}
	ensureDir(targetDir);
	run("docker", [
		"run",
		"--rm",
		"-v",
		`${volumeName}:/from:ro`,
		"-v",
		`${targetDir}:/to`,
		"alpine:3.20",
		"sh",
		"-lc",
		"cd /from && tar -czf /to/volume.tar.gz .",
	]);
	logSuccess(`Backed up Docker volume ${volumeName}`);
}

function restoreDockerVolume(volumeName: string, sourceDir: string) {
	logStep(`Restoring Docker volume ${volumeName}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would restore ${volumeName} from ${sourceDir}`);
		return;
	}
	run("docker", ["volume", "create", volumeName], { quiet: true });
	run("docker", [
		"run",
		"--rm",
		"-v",
		`${volumeName}:/to`,
		"-v",
		`${sourceDir}:/from:ro`,
		"alpine:3.20",
		"sh",
		"-lc",
		"cd /to && tar -xzf /from/volume.tar.gz",
	]);
	logSuccess(`Restored Docker volume ${volumeName}`);
}

async function cmdBackup() {
	logSection("Backup");
	const { config } = loadState();
	const timestamp = new Date().toISOString().replace(/[:]/g, "-");
	const archiveBase = path.join(config.backup.output_dir, `envsync-backup-${timestamp}`);
	const manifestPath = `${archiveBase}.manifest.json`;
	const tarPath = `${archiveBase}.tar.gz`;
	const staged = path.join(BACKUPS_ROOT, `staging-${timestamp}`);
	logInfo(`Backup archive target: ${tarPath}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would stage backup files in ${staged}`);
		for (const volume of STACK_VOLUMES) {
			backupDockerVolume(stackVolumeName(config, volume), path.join(staged, "volumes", volume));
		}
		logDryRun(`Would write manifest ${manifestPath}`);
		logDryRun(`Would create archive ${tarPath}`);
		logSuccess("Backup dry-run completed");
		console.log(tarPath);
		return;
	}
	ensureDir(config.backup.output_dir);
	ensureDir(staged);
	writeFile(path.join(staged, "deploy.env"), fs.readFileSync(DEPLOY_ENV, "utf8"));
	writeFile(path.join(staged, "deploy.yaml"), fs.readFileSync(DEPLOY_YAML, "utf8"));
	writeFile(path.join(staged, "config.json"), fs.readFileSync(INTERNAL_CONFIG_JSON, "utf8"));
	writeFile(path.join(staged, "versions.lock.json"), fs.readFileSync(VERSIONS_LOCK, "utf8"));
	writeFile(path.join(staged, "docker-stack.bootstrap.base.yaml"), fs.readFileSync(BOOTSTRAP_BASE_STACK_FILE, "utf8"));
	writeFile(path.join(staged, "docker-stack.bootstrap.yaml"), fs.readFileSync(BOOTSTRAP_STACK_FILE, "utf8"));
	writeFile(path.join(staged, "docker-stack.yaml"), fs.readFileSync(STACK_FILE, "utf8"));
	writeFile(path.join(staged, "traefik-dynamic.yaml"), fs.readFileSync(TRAEFIK_DYNAMIC_FILE, "utf8"));
	writeFile(path.join(staged, "keycloak-realm.envsync.json"), fs.readFileSync(KEYCLOAK_REALM_FILE, "utf8"));
	writeFile(path.join(staged, "otel-agent.yaml"), fs.readFileSync(OTEL_AGENT_CONF, "utf8"));
	writeFile(path.join(staged, "clickhouse-listen.xml"), fs.readFileSync(CLICKSTACK_CLICKHOUSE_CONF, "utf8"));
	const volumesDir = path.join(staged, "volumes");
	for (const volume of STACK_VOLUMES) {
		backupDockerVolume(stackVolumeName(config, volume), path.join(volumesDir, volume));
	}
	run("bash", ["-lc", `tar -czf ${JSON.stringify(tarPath)} -C ${JSON.stringify(staged)} .`]);
	const manifest = {
		archive: path.basename(tarPath),
		sha256: sha256File(tarPath),
		created_at: new Date().toISOString(),
		stack_name: config.services.stack_name,
		volumes: STACK_VOLUMES.map(volume => stackVolumeName(config, volume)),
	};
	writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
	logSuccess("Backup completed");
	console.log(tarPath);
}

async function cmdRestore(archivePath: string) {
	if (!archivePath) throw new Error("restore requires a .tar.gz path");
	logSection("Restore");
	const restoreRoot = path.join(BACKUPS_ROOT, `restore-${Date.now()}`);
	logInfo(`Restore archive: ${archivePath}`);
	if (currentOptions.dryRun) {
		logDryRun(`Would extract ${archivePath} into ${restoreRoot}`);
		logDryRun(`Would restore deploy files into ${DEPLOY_ROOT} and ${ETC_ROOT}`);
		logDryRun("Would restore all managed Docker volumes from the archive");
		logSuccess("Restore dry-run completed");
		return;
	}
	ensureDir(restoreRoot);
	run("bash", ["-lc", `tar -xzf ${JSON.stringify(archivePath)} -C ${JSON.stringify(restoreRoot)}`]);
	writeFile(DEPLOY_ENV, fs.readFileSync(path.join(restoreRoot, "deploy.env"), "utf8"), 0o600);
	writeFile(DEPLOY_YAML, fs.readFileSync(path.join(restoreRoot, "deploy.yaml"), "utf8"));
	writeFile(INTERNAL_CONFIG_JSON, fs.readFileSync(path.join(restoreRoot, "config.json"), "utf8"));
	writeFile(VERSIONS_LOCK, fs.readFileSync(path.join(restoreRoot, "versions.lock.json"), "utf8"));
	writeFile(BOOTSTRAP_BASE_STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.bootstrap.base.yaml"), "utf8"));
	writeFile(BOOTSTRAP_STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.bootstrap.yaml"), "utf8"));
	writeFile(STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.yaml"), "utf8"));
	writeFile(TRAEFIK_DYNAMIC_FILE, fs.readFileSync(path.join(restoreRoot, "traefik-dynamic.yaml"), "utf8"));
	writeFile(KEYCLOAK_REALM_FILE, fs.readFileSync(path.join(restoreRoot, "keycloak-realm.envsync.json"), "utf8"));
	writeFile(OTEL_AGENT_CONF, fs.readFileSync(path.join(restoreRoot, "otel-agent.yaml"), "utf8"));
	writeFile(CLICKSTACK_CLICKHOUSE_CONF, fs.readFileSync(path.join(restoreRoot, "clickhouse-listen.xml"), "utf8"));
	const config = loadConfig();
	for (const volume of STACK_VOLUMES) {
		restoreDockerVolume(stackVolumeName(config, volume), path.join(restoreRoot, "volumes", volume));
	}
	logSuccess("Restore completed. Run 'envsync-deploy deploy' to start services.");
}

async function main() {
	const argv = process.argv.slice(2);
	const command = argv[0];
	const args = argv.slice(1);
	currentOptions = {
		dryRun: args.includes("--dry-run"),
		force: args.includes("--force"),
	};
	const positionals = args.filter(arg => arg !== "--dry-run" && arg !== "--force");
	switch (command) {
		case "preinstall":
			await cmdPreinstall();
			break;
		case "setup":
			await cmdSetup();
			break;
		case "bootstrap":
			await cmdBootstrap();
			break;
		case "deploy":
			await cmdDeploy();
			break;
		case "health":
			await cmdHealth(positionals[0] === "--json");
			break;
		case "upgrade":
			await cmdUpgrade();
			break;
		case "upgrade-deps":
			await cmdUpgradeDeps();
			break;
		case "backup":
			await cmdBackup();
			break;
		case "restore":
			await cmdRestore(positionals[0] ?? "");
			break;
		default:
			console.log(
				"Usage: envsync-deploy <preinstall|setup|bootstrap|deploy|health|upgrade|upgrade-deps|backup|restore> [--dry-run] [--force]",
			);
			process.exit(command ? 1 : 0);
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
