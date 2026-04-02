import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

type ReleaseChannel = "stable" | "latest";

interface DeployConfig {
	source: {
		repo_url: string;
		ref: string;
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
	release_channel: ReleaseChannel;
}

interface DeployGeneratedState {
	openfga: {
		store_id: string;
		model_id: string;
	};
	secrets: {
		s3_secret_key: string;
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

const HOST_ROOT = "/opt/envsync";
const DEPLOY_ROOT = "/opt/envsync/deploy";
const RELEASES_ROOT = "/opt/envsync/releases";
const BACKUPS_ROOT = "/opt/envsync/backups";
const ETC_ROOT = "/etc/envsync";
const TRAEFIK_STATE_ROOT = "/var/lib/envsync/traefik";
const REPO_ROOT = "/opt/envsync/repo";
const DEPLOY_ENV = "/etc/envsync/deploy.env";
const DEPLOY_YAML = "/etc/envsync/deploy.yaml";
const VERSIONS_LOCK = "/opt/envsync/deploy/versions.lock.json";
const STACK_FILE = "/opt/envsync/deploy/docker-stack.yaml";
const BOOTSTRAP_STACK_FILE = "/opt/envsync/deploy/docker-stack.bootstrap.yaml";
const TRAEFIK_DYNAMIC_FILE = "/opt/envsync/deploy/traefik-dynamic.yaml";
const KEYCLOAK_REALM_FILE = "/opt/envsync/deploy/keycloak-realm.envsync.json";
const NGINX_WEB_CONF = "/opt/envsync/deploy/nginx-web.conf";
const NGINX_LANDING_CONF = "/opt/envsync/deploy/nginx-landing.conf";
const OTEL_AGENT_CONF = "/opt/envsync/deploy/otel-agent.yaml";
const INTERNAL_CONFIG_JSON = "/opt/envsync/deploy/config.json";

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

function ensureDir(dir: string) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeFile(target: string, content: string, mode?: number) {
	ensureDir(path.dirname(target));
	fs.writeFileSync(target, content, "utf8");
	if (mode != null) fs.chmodSync(target, mode);
}

function exists(target: string) {
	return fs.existsSync(target);
}

function randomSecret(bytes = 24) {
	return randomBytes(bytes).toString("hex");
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

function getDeployCliVersion() {
	try {
		const packageJsonPath = new URL("../package.json", import.meta.url);
		const raw = fs.readFileSync(packageJsonPath, "utf8");
		return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
	} catch {
		return process.env.npm_package_version ?? "0.0.0";
	}
}

function defaultSourceConfig() {
	return {
		repo_url: "https://github.com/EnvSync-Cloud/envsync.git",
		ref: `v${getDeployCliVersion()}`,
	};
}

function normalizeConfig(raw: DeployConfig): DeployConfig {
	return {
		...raw,
		source: raw.source ?? defaultSourceConfig(),
	};
}

function emptyGeneratedState(): DeployGeneratedState {
	return {
		openfga: {
			store_id: "",
			model_id: "",
		},
		secrets: {
			s3_secret_key: "",
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
		secrets: {
			s3_secret_key: raw?.secrets?.s3_secret_key ?? defaults.secrets.s3_secret_key,
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
		secrets: {
			s3_secret_key: env.S3_SECRET_KEY ?? normalized.secrets.s3_secret_key,
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

function ensureGeneratedRuntimeState(generated: DeployGeneratedState) {
	return normalizeGeneratedState({
		openfga: generated.openfga,
		secrets: {
			s3_secret_key: generated.secrets.s3_secret_key || randomSecret(16),
			keycloak_web_client_secret: generated.secrets.keycloak_web_client_secret || randomSecret(),
			keycloak_api_client_secret: generated.secrets.keycloak_api_client_secret || randomSecret(),
			openfga_db_password: generated.secrets.openfga_db_password || randomSecret(),
			minikms_root_key: generated.secrets.minikms_root_key || randomBytes(32).toString("hex"),
			minikms_db_password: generated.secrets.minikms_db_password || randomSecret(),
		},
		bootstrap: generated.bootstrap,
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
		KEYCLOAK_REALM: config.auth.keycloak_realm,
		KEYCLOAK_ADMIN_USER: config.auth.admin_user,
		KEYCLOAK_ADMIN_PASSWORD: config.auth.admin_password,
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
		"  routers:",
		"    landing-router:",
		`      rule: Host(\`${hosts.landing}\`)`,
		"      service: landing",
		"      entryPoints: [websecure]",
		"      tls: {}",
		"    web-router:",
		`      rule: Host(\`${hosts.app}\`)`,
		"      service: web",
		"      entryPoints: [websecure]",
		"      tls: {}",
		"    api-router:",
		`      rule: Host(\`${hosts.api}\`)`,
		"      service: envsync-api",
		"      entryPoints: [websecure]",
		"      tls: {}",
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

function renderFrontendRuntimeConfig(config: DeployConfig) {
	const hosts = domainMap(config.domain.root_domain);
	return `window.__ENVSYNC_RUNTIME_CONFIG__ = ${JSON.stringify({
		apiBaseUrl: `https://${hosts.api}`,
		appBaseUrl: `https://${hosts.app}`,
		authBaseUrl: `https://${hosts.auth}`,
		keycloakRealm: config.auth.keycloak_realm,
		webClientId: config.auth.web_client_id,
		apiDocsUrl: `https://${hosts.api}/docs`,
	}, null, 2)};\n`;
}

function renderOtelAgentConfig(config: DeployConfig) {
	return [
		"receivers:",
		"  otlp:",
		"    protocols:",
		"      grpc:",
		"      http:",
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

function renderStack(config: DeployConfig, runtimeEnv: RuntimeEnv, includeAppServices: boolean) {
	const hosts = domainMap(config.domain.root_domain);
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
      - --providers.docker.swarmMode=true
      - --providers.docker.exposedByDefault=false
      - --providers.file.filename=/etc/traefik/dynamic/traefik-dynamic.yaml
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.email=${config.domain.acme_email}
      - --certificatesresolvers.letsencrypt.acme.storage=/var/lib/traefik/acme.json
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
    ports:
      - target: 80
        published: 80
        protocol: tcp
        mode: host
      - target: 443
        published: 443
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
        - traefik.http.routers.s3.rule=Host(\`${hosts.s3}\`)
        - traefik.http.routers.s3.entrypoints=websecure
        - traefik.http.routers.s3.tls.certresolver=letsencrypt
        - traefik.http.services.s3.loadbalancer.server.port=9000
        - traefik.http.routers.s3-console.rule=Host(\`${hosts.s3Console}\`)
        - traefik.http.routers.s3-console.entrypoints=websecure
        - traefik.http.routers.s3-console.tls.certresolver=letsencrypt
        - traefik.http.services.s3-console.loadbalancer.server.port=9001

  keycloak_db:
    image: postgres:17
    environment:
${renderEnvList({
		POSTGRES_USER: "keycloak",
		POSTGRES_PASSWORD: runtimeEnv.KEYCLOAK_ADMIN_PASSWORD,
		POSTGRES_DB: "keycloak",
	})}
    volumes:
      - keycloak_db_data:/var/lib/postgresql/data
    networks: [envsync]

  keycloak:
    image: ${config.images.keycloak}
    entrypoint: ["/bin/sh", "-lc"]
    command:
      - /opt/keycloak/bin/kc.sh import --dir /opt/keycloak/data/import --override true && exec /opt/keycloak/bin/kc.sh start-dev
    environment:
${renderEnvList({
		KC_DB: "postgres",
		KC_DB_URL: "jdbc:postgresql://keycloak_db:5432/keycloak",
		KC_DB_USERNAME: "keycloak",
		KC_DB_PASSWORD: runtimeEnv.KEYCLOAK_ADMIN_PASSWORD,
		KC_BOOTSTRAP_ADMIN_USERNAME: config.auth.admin_user,
		KC_BOOTSTRAP_ADMIN_PASSWORD: config.auth.admin_password,
		KC_HTTP_ENABLED: "true",
		KC_PROXY_HEADERS: "xforwarded",
		KC_HOSTNAME: hosts.auth,
	})}
    volumes:
      - ${KEYCLOAK_REALM_FILE}:/opt/keycloak/data/import/realm.json:ro
    networks: [envsync]
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.keycloak.rule=Host(\`${hosts.auth}\`)
        - traefik.http.routers.keycloak.entrypoints=websecure
        - traefik.http.routers.keycloak.tls.certresolver=letsencrypt
        - traefik.http.services.keycloak.loadbalancer.server.port=8080

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
    networks: [envsync]

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
    networks: [envsync]

  clickstack:
    image: ${config.images.clickstack}
    volumes:
      - clickstack_data:/data/db
      - clickstack_ch_data:/var/lib/clickhouse
      - clickstack_ch_logs:/var/log/clickhouse-server
    networks: [envsync]
    deploy:
      labels:
        - traefik.enable=true
        - traefik.http.routers.obs.rule=Host(\`${hosts.obs}\`)
        - traefik.http.routers.obs.entrypoints=websecure
        - traefik.http.routers.obs.tls.certresolver=letsencrypt
        - traefik.http.services.obs.loadbalancer.server.port=8080

  otel-agent:
    image: ${config.images.otel_agent}
    command: ["--config=/etc/otel-agent.yaml"]
    volumes:
      - ${OTEL_AGENT_CONF}:/etc/otel-agent.yaml:ro
    networks: [envsync]
${includeAppServices ? `

  landing_nginx:
    image: nginx:1.27-alpine
    volumes:
      - ${NGINX_LANDING_CONF}:/etc/nginx/conf.d/default.conf:ro
      - ${RELEASES_ROOT}/landing/current:/srv/landing:ro
    networks: [envsync]

  web_nginx:
    image: nginx:1.27-alpine
    volumes:
      - ${NGINX_WEB_CONF}:/etc/nginx/conf.d/default.conf:ro
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
`.trimStart();
}

function writeDeployArtifacts(config: DeployConfig, generated: DeployGeneratedState) {
	const runtimeEnv = buildRuntimeEnv(config, generated);
	writeFile(DEPLOY_ENV, renderEnvFile(runtimeEnv), 0o600);
	writeFile(
		INTERNAL_CONFIG_JSON,
		JSON.stringify({ config, generated: mergeGeneratedState(runtimeEnv, generated) }, null, 2) + "\n",
	);
	writeFile(VERSIONS_LOCK, JSON.stringify(config.images, null, 2) + "\n");
	writeFile(KEYCLOAK_REALM_FILE, renderKeycloakRealm(config, runtimeEnv));
	writeFile(TRAEFIK_DYNAMIC_FILE, renderTraefikDynamicConfig(config));
	writeFile(STACK_FILE, renderStack(config, runtimeEnv, true));
	writeFile(BOOTSTRAP_STACK_FILE, renderStack(config, runtimeEnv, false));
	writeFile(NGINX_WEB_CONF, renderNginxConf("web"));
	writeFile(NGINX_LANDING_CONF, renderNginxConf("landing"));
	writeFile(OTEL_AGENT_CONF, renderOtelAgentConfig(config));
}

function saveDesiredConfig(config: DeployConfig) {
	const internal = readInternalState();
	const generated = mergeGeneratedState(loadGeneratedEnv(), internal?.generated);
	writeFile(DEPLOY_YAML, toYaml(config) + "\n");
	writeFile(
		INTERNAL_CONFIG_JSON,
		JSON.stringify({ config, generated }, null, 2) + "\n",
	);
}

function ensureRepoCheckout(config: DeployConfig) {
	ensureDir(REPO_ROOT);
	if (!exists(path.join(REPO_ROOT, ".git"))) {
		run("git", ["clone", config.source.repo_url, REPO_ROOT]);
	}
	run("git", ["remote", "set-url", "origin", config.source.repo_url], { cwd: REPO_ROOT });
	run("git", ["fetch", "--tags", "--force", "origin"], { cwd: REPO_ROOT });
	run("git", ["checkout", "--force", config.source.ref], { cwd: REPO_ROOT });
}

function extractStaticBundle(image: string, targetDir: string) {
	ensureDir(targetDir);
	const containerId = run("docker", ["create", image], { quiet: true }).trim();
	try {
		run("docker", ["cp", `${containerId}:/app/dist/.`, targetDir]);
	} finally {
		run("docker", ["rm", "-f", containerId], { quiet: true });
	}
}

function buildKeycloakImage(imageTag: string, repoRoot = REPO_ROOT) {
	const buildContext = path.join(repoRoot, "packages/envsync-keycloak-theme");
	if (!exists(path.join(buildContext, "Dockerfile"))) {
		throw new Error(`Missing Keycloak Docker build context at ${buildContext}`);
	}
	run("docker", ["build", "-t", imageTag, buildContext]);
}

function stackNetworkName(config: DeployConfig) {
	return `${config.services.stack_name}_envsync`;
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

function runBootstrapInit(config: DeployConfig) {
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
	const result = JSON.parse(output) as { openfgaStoreId?: string; openfgaModelId?: string };
	if (!result.openfgaStoreId || !result.openfgaModelId) {
		throw new Error("Bootstrap init did not return OpenFGA IDs");
	}
	return {
		openfgaStoreId: result.openfgaStoreId,
		openfgaModelId: result.openfgaModelId,
	};
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
	const rootDomain = await ask("Root domain", "example.com");
	const acmeEmail = await ask("ACME email", `admin@${rootDomain}`);
	const channel = (await ask("Release channel", "stable")) as ReleaseChannel;
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
		source: defaultSourceConfig(),
		domain: { root_domain: rootDomain, acme_email: acmeEmail },
		images: {
			api: `ghcr.io/envsync-cloud/envsync-api:${channel}`,
			keycloak: `envsync-keycloak:${channel}`,
			web: `ghcr.io/envsync-cloud/envsync-web-static:${channel}`,
			landing: `ghcr.io/envsync-cloud/envsync-landing-static:${channel}`,
			clickstack: "clickhouse/clickstack-all-in-one:latest",
			traefik: "traefik:v3.1",
			otel_agent: "otel/opentelemetry-collector-contrib:0.111.0",
		},
		services: {
			stack_name: "envsync",
			api_port: 4000,
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
		release_channel: channel,
	};

	saveDesiredConfig(config);
	console.log(`Config written to ${DEPLOY_YAML}`);
	console.log(`Pinned source checkout: ${config.source.repo_url} @ ${config.source.ref}`);
	console.log("Create these DNS records:");
	console.log(JSON.stringify(domainMap(rootDomain), null, 2));
}

async function cmdBootstrap() {
	const { config, generated } = loadState();
	const nextGenerated = ensureGeneratedRuntimeState(generated);
	ensureRepoCheckout(config);
	writeDeployArtifacts(config, nextGenerated);
	buildKeycloakImage(config.images.keycloak);
	run("docker", ["stack", "deploy", "-c", BOOTSTRAP_STACK_FILE, config.services.stack_name]);
	waitForTcpService(config, "postgres", "postgres", 5432);
	waitForTcpService(config, "redis", "redis", 6379);
	waitForTcpService(config, "rustfs", "rustfs", 9000);
	waitForTcpService(config, "keycloak", "keycloak", 8080);
	waitForTcpService(config, "openfga", "openfga", 8090);
	waitForTcpService(config, "minikms", "minikms", 50051);
	const initResult = runBootstrapInit(config);
	const bootstrappedGenerated = normalizeGeneratedState({
		openfga: {
			store_id: initResult.openfgaStoreId,
			model_id: initResult.openfgaModelId,
		},
		secrets: nextGenerated.secrets,
		bootstrap: {
			completed_at: new Date().toISOString(),
		},
	});
	writeDeployArtifacts(config, bootstrappedGenerated);
	console.log("Bootstrap completed.");
}

async function cmdDeploy() {
	const { config, generated } = loadState();
	assertBootstrapState(generated);
	ensureRepoCheckout(config);
	writeDeployArtifacts(config, generated);
	buildKeycloakImage(config.images.keycloak);
	ensureDir(`${RELEASES_ROOT}/web/current`);
	ensureDir(`${RELEASES_ROOT}/landing/current`);
	extractStaticBundle(config.images.web, `${RELEASES_ROOT}/web/current`);
	extractStaticBundle(config.images.landing, `${RELEASES_ROOT}/landing/current`);
	writeFile(`${RELEASES_ROOT}/web/current/runtime-config.js`, renderFrontendRuntimeConfig(config));
	writeFile(`${RELEASES_ROOT}/landing/current/runtime-config.js`, renderFrontendRuntimeConfig(config));
	run("docker", ["stack", "deploy", "-c", STACK_FILE, config.services.stack_name]);
}

async function cmdHealth(asJson: boolean) {
	const { config, generated } = loadState();
	const hosts = domainMap(config.domain.root_domain);
	const services = listStackServices(config);
	const stackName = config.services.stack_name;
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
	const { config } = loadState();
	config.images.api = `ghcr.io/envsync-cloud/envsync-api:${config.release_channel}`;
	saveDesiredConfig(config);
	await cmdDeploy();
}

async function cmdUpgradeDeps() {
	const { config } = loadState();
	config.images.traefik = "traefik:v3.1";
	config.images.clickstack = "clickhouse/clickstack-all-in-one:latest";
	config.images.otel_agent = "otel/opentelemetry-collector-contrib:0.111.0";
	saveDesiredConfig(config);
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
}

function restoreDockerVolume(volumeName: string, sourceDir: string) {
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
}

async function cmdBackup() {
	const { config } = loadState();
	ensureDir(config.backup.output_dir);
	const timestamp = new Date().toISOString().replace(/[:]/g, "-");
	const archiveBase = path.join(config.backup.output_dir, `envsync-backup-${timestamp}`);
	const manifestPath = `${archiveBase}.manifest.json`;
	const tarPath = `${archiveBase}.tar.gz`;
	const staged = path.join(BACKUPS_ROOT, `staging-${timestamp}`);
	ensureDir(staged);
	writeFile(path.join(staged, "deploy.env"), fs.readFileSync(DEPLOY_ENV, "utf8"));
	writeFile(path.join(staged, "deploy.yaml"), fs.readFileSync(DEPLOY_YAML, "utf8"));
	writeFile(path.join(staged, "config.json"), fs.readFileSync(INTERNAL_CONFIG_JSON, "utf8"));
	writeFile(path.join(staged, "versions.lock.json"), fs.readFileSync(VERSIONS_LOCK, "utf8"));
	writeFile(path.join(staged, "docker-stack.bootstrap.yaml"), fs.readFileSync(BOOTSTRAP_STACK_FILE, "utf8"));
	writeFile(path.join(staged, "docker-stack.yaml"), fs.readFileSync(STACK_FILE, "utf8"));
	writeFile(path.join(staged, "traefik-dynamic.yaml"), fs.readFileSync(TRAEFIK_DYNAMIC_FILE, "utf8"));
	writeFile(path.join(staged, "keycloak-realm.envsync.json"), fs.readFileSync(KEYCLOAK_REALM_FILE, "utf8"));
	writeFile(path.join(staged, "otel-agent.yaml"), fs.readFileSync(OTEL_AGENT_CONF, "utf8"));
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
	console.log(tarPath);
}

async function cmdRestore(archivePath: string) {
	if (!archivePath) throw new Error("restore requires a .tar.gz path");
	const restoreRoot = path.join(BACKUPS_ROOT, `restore-${Date.now()}`);
	ensureDir(restoreRoot);
	run("bash", ["-lc", `tar -xzf ${JSON.stringify(archivePath)} -C ${JSON.stringify(restoreRoot)}`]);
	writeFile(DEPLOY_ENV, fs.readFileSync(path.join(restoreRoot, "deploy.env"), "utf8"), 0o600);
	writeFile(DEPLOY_YAML, fs.readFileSync(path.join(restoreRoot, "deploy.yaml"), "utf8"));
	writeFile(INTERNAL_CONFIG_JSON, fs.readFileSync(path.join(restoreRoot, "config.json"), "utf8"));
	writeFile(VERSIONS_LOCK, fs.readFileSync(path.join(restoreRoot, "versions.lock.json"), "utf8"));
	writeFile(BOOTSTRAP_STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.bootstrap.yaml"), "utf8"));
	writeFile(STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.yaml"), "utf8"));
	writeFile(TRAEFIK_DYNAMIC_FILE, fs.readFileSync(path.join(restoreRoot, "traefik-dynamic.yaml"), "utf8"));
	writeFile(KEYCLOAK_REALM_FILE, fs.readFileSync(path.join(restoreRoot, "keycloak-realm.envsync.json"), "utf8"));
	writeFile(OTEL_AGENT_CONF, fs.readFileSync(path.join(restoreRoot, "otel-agent.yaml"), "utf8"));
	const config = loadConfig();
	for (const volume of STACK_VOLUMES) {
		restoreDockerVolume(stackVolumeName(config, volume), path.join(restoreRoot, "volumes", volume));
	}
	console.log("Restore completed. Run 'envsync-deploy deploy' to start services.");
}

async function main() {
	const command = process.argv[2];
	const flag = process.argv[3];
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
			await cmdHealth(flag === "--json");
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
			await cmdRestore(flag ?? "");
			break;
		default:
			console.log("Usage: envsync-deploy <preinstall|setup|bootstrap|deploy|health|upgrade|upgrade-deps|backup|restore>");
			process.exit(command ? 1 : 0);
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
