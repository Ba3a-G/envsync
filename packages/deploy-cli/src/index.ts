#!/usr/bin/env bun

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

type ReleaseChannel = "stable" | "latest";

interface DeployConfig {
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

function indentBlock(content: string, spaces: number): string {
	const prefix = " ".repeat(spaces);
	return content
		.split("\n")
		.map(line => (line ? `${prefix}${line}` : line))
		.join("\n");
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

function loadConfig(): DeployConfig {
	if (!exists(DEPLOY_YAML)) {
		throw new Error(`Missing deploy config at ${DEPLOY_YAML}. Run setup first.`);
	}
	const raw = fs.readFileSync(DEPLOY_YAML, "utf8");
	if (raw.trimStart().startsWith("{")) {
		return JSON.parse(raw) as DeployConfig;
	}
	return parseSimpleYamlObject(raw) as unknown as DeployConfig;
}

function saveConfig(config: DeployConfig) {
	writeFile(DEPLOY_YAML, toYaml(config) + "\n");
	writeFile(INTERNAL_CONFIG_JSON, JSON.stringify(config, null, 2) + "\n");
	writeFile(DEPLOY_ENV, renderEnv(config), 0o600);
	writeFile(VERSIONS_LOCK, JSON.stringify(config.images, null, 2) + "\n");
	writeFile(KEYCLOAK_REALM_FILE, renderKeycloakRealm(config));
	writeFile(TRAEFIK_DYNAMIC_FILE, renderTraefikDynamicConfig(config));
	writeFile(STACK_FILE, renderStack(config));
	writeFile(NGINX_WEB_CONF, renderNginxConf("web"));
	writeFile(NGINX_LANDING_CONF, renderNginxConf("landing"));
	writeFile(OTEL_AGENT_CONF, renderOtelAgentConfig(config));
}

function buildEnvMap(config: DeployConfig) {
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
		S3_SECRET_KEY: randomSecret(16),
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
		KEYCLOAK_WEB_CLIENT_SECRET: randomSecret(),
		KEYCLOAK_CLI_CLIENT_ID: config.auth.cli_client_id,
		KEYCLOAK_API_CLIENT_ID: config.auth.api_client_id,
		KEYCLOAK_API_CLIENT_SECRET: randomSecret(),
		KEYCLOAK_WEB_REDIRECT_URI: `https://${hosts.api}/api/access/web/callback`,
		KEYCLOAK_WEB_CALLBACK_URL: `https://${hosts.app}/auth/callback`,
		KEYCLOAK_API_REDIRECT_URI: `https://${hosts.api}/api/access/api/callback`,
		LANDING_PAGE_URL: `https://${hosts.landing}`,
		DASHBOARD_URL: `https://${hosts.app}`,
		OPENFGA_API_URL: "http://openfga:8090",
		OPENFGA_STORE_ID: "",
		OPENFGA_MODEL_ID: "",
		OPENFGA_DB_PASSWORD: randomSecret(),
		MINIKMS_GRPC_ADDR: "minikms:50051",
		MINIKMS_TLS_ENABLED: "false",
		MINIKMS_ROOT_KEY: randomBytes(32).toString("hex"),
		MINIKMS_DB_USER: "postgres",
		MINIKMS_DB_PASSWORD: randomSecret(),
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-agent:4318",
		OTEL_SERVICE_NAME: "envsync-api",
		OTEL_SDK_DISABLED: "false",
		CLICKSTACK_URL: `https://${hosts.obs}`,
	};
}

function renderEnv(config: DeployConfig) {
	return Object.entries({
		...buildEnvMap(config),
		KEYCLOAK_IMAGE_TAG: config.images.keycloak.split(":").slice(1).join(":") || "local",
	})
		.map(([k, v]) => `${k}=${v}`)
		.join("\n") + "\n";
}

function renderServiceEnvironment(config: DeployConfig, overrides: Record<string, string> = {}) {
	return toYaml({ ...buildEnvMap(config), ...overrides }, 0);
}

function renderKeycloakRealm(config: DeployConfig) {
	const hosts = domainMap(config.domain.root_domain);
	const webSecret = extractEnvValue("KEYCLOAK_WEB_CLIENT_SECRET");
	const apiSecret = extractEnvValue("KEYCLOAK_API_CLIENT_SECRET");

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
					secret: webSecret,
					standardFlowEnabled: true,
					directAccessGrantsEnabled: false,
					redirectUris: [`https://${hosts.api}/api/access/web/callback`],
					webOrigins: [`https://${hosts.app}`],
					defaultClientScopes: ["basic", "web-origins", "profile", "email", "roles"],
				},
				{
					clientId: config.auth.api_client_id,
					name: "EnvSync API",
					protocol: "openid-connect",
					publicClient: false,
					secret: apiSecret,
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

function extractEnvValue(key: string): string {
	const env = exists(DEPLOY_ENV) ? fs.readFileSync(DEPLOY_ENV, "utf8") : "";
	const line = env.split(/\r?\n/).find(entry => entry.startsWith(`${key}=`));
	return line?.slice(key.length + 1) ?? "";
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
		`    landing-router:`,
		`      rule: Host(\`${hosts.landing}\`)`,
		"      service: landing",
		"      entryPoints: [websecure]",
		"      tls: {}",
		`    web-router:`,
		`      rule: Host(\`${hosts.app}\`)`,
		"      service: web",
		"      entryPoints: [websecure]",
		"      tls: {}",
		`    api-router:`,
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

function renderStack(config: DeployConfig) {
	const hosts = domainMap(config.domain.root_domain);
	const apiEnvironment = renderServiceEnvironment(config, {
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-agent:4318",
		KEYCLOAK_URL: "http://keycloak:8080",
		OPENFGA_API_URL: "http://openfga:8090",
		MINIKMS_GRPC_ADDR: "minikms:50051",
		S3_ENDPOINT: "http://rustfs:9000",
		S3_BUCKET_URL: `https://${hosts.s3}`,
	});
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
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: envsync-postgres
      POSTGRES_DB: envsync
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
      RUSTFS_DATA_DIR: /data
      RUSTFS_ACCESS_KEY: envsync-rustfs
      RUSTFS_SECRET_KEY: ${extractEnvValue("S3_SECRET_KEY")}
      RUSTFS_CONSOLE_ENABLE: "true"
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
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: ${extractEnvValue("KEYCLOAK_ADMIN_PASSWORD")}
      POSTGRES_DB: keycloak
    volumes:
      - keycloak_db_data:/var/lib/postgresql/data
    networks: [envsync]

  keycloak:
    image: ${config.images.keycloak}
    entrypoint: ["/bin/sh", "-lc"]
    command:
      - /opt/keycloak/bin/kc.sh import --dir /opt/keycloak/data/import --override true && exec /opt/keycloak/bin/kc.sh start-dev
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak_db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${extractEnvValue("KEYCLOAK_ADMIN_PASSWORD")}
      KC_BOOTSTRAP_ADMIN_USERNAME: ${config.auth.admin_user}
      KC_BOOTSTRAP_ADMIN_PASSWORD: ${config.auth.admin_password}
      KC_HTTP_ENABLED: "true"
      KC_PROXY_HEADERS: xforwarded
      KC_HOSTNAME: ${hosts.auth}
    volumes:
      - ${DEPLOY_ROOT}/keycloak-realm.envsync.json:/opt/keycloak/data/import/realm.json:ro
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
      POSTGRES_USER: openfga
      POSTGRES_PASSWORD: ${extractEnvValue("OPENFGA_DB_PASSWORD")}
      POSTGRES_DB: openfga
    volumes:
      - openfga_db_data:/var/lib/postgresql/data
    networks: [envsync]

  openfga:
    image: openfga/openfga:v1.12.0
    command: run
    environment:
      OPENFGA_DATASTORE_ENGINE: postgres
      OPENFGA_DATASTORE_URI: postgres://openfga:${extractEnvValue("OPENFGA_DB_PASSWORD")}@openfga_db:5432/openfga?sslmode=disable
      OPENFGA_HTTP_ADDR: 0.0.0.0:8090
      OPENFGA_GRPC_ADDR: 0.0.0.0:8091
    networks: [envsync]

  minikms_db:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${extractEnvValue("MINIKMS_DB_PASSWORD")}
      POSTGRES_DB: minikms
    volumes:
      - minikms_db_data:/var/lib/postgresql/data
    networks: [envsync]

  minikms:
    image: ghcr.io/envsync-cloud/minikms:sha-735dfe8
    environment:
      MINIKMS_ROOT_KEY: ${extractEnvValue("MINIKMS_ROOT_KEY")}
      MINIKMS_DB_URL: postgres://postgres:${extractEnvValue("MINIKMS_DB_PASSWORD")}@minikms_db:5432/minikms?sslmode=disable
      MINIKMS_REDIS_URL: redis://redis:6379
      MINIKMS_TLS_ENABLED: "false"
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
${indentBlock(apiEnvironment, 6)}
    networks: [envsync]

  envsync_api_green:
    image: ${config.images.api}
    environment:
${indentBlock(apiEnvironment, 6)}
    networks: [envsync]

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

	ensureDir(REPO_ROOT);
	if (!exists(path.join(REPO_ROOT, ".git"))) {
		run("git", ["clone", "https://github.com/EnvSync-Cloud/envsync.git", REPO_ROOT]);
	}

	saveConfig(config);
	console.log(`Config written to ${DEPLOY_YAML}`);
	console.log("Create these DNS records:");
	console.log(JSON.stringify(domainMap(rootDomain), null, 2));
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

async function cmdDeploy() {
	const config = loadConfig();
	buildKeycloakImage(config.images.keycloak);
	ensureDir(`${RELEASES_ROOT}/web/current`);
	ensureDir(`${RELEASES_ROOT}/landing/current`);
	extractStaticBundle(config.images.web, `${RELEASES_ROOT}/web/current`);
	extractStaticBundle(config.images.landing, `${RELEASES_ROOT}/landing/current`);
	run("docker", ["stack", "deploy", "-c", STACK_FILE, config.services.stack_name]);
}

async function cmdHealth(asJson: boolean) {
	const config = loadConfig();
	const hosts = domainMap(config.domain.root_domain);
	const services = run("docker", ["stack", "services", config.services.stack_name], { quiet: true });
	const checks = {
		keycloak_image: config.images.keycloak,
		services,
		public: {
			landing: `https://${hosts.landing}`,
			app: `https://${hosts.app}`,
			api: `https://${hosts.api}/health`,
			auth: `https://${hosts.auth}/realms/${config.auth.keycloak_realm}/.well-known/openid-configuration`,
			obs: `https://${hosts.obs}`,
		},
	};
	if (asJson) console.log(JSON.stringify(checks, null, 2));
	else {
		console.log(services);
		console.log(JSON.stringify(checks.public, null, 2));
	}
}

async function cmdUpgrade() {
	const config = loadConfig();
	const nextImage = `ghcr.io/envsync-cloud/envsync-api:${config.release_channel}`;
	config.images.api = nextImage;
	saveConfig(config);
	await cmdDeploy();
}

async function cmdUpgradeDeps() {
	const config = loadConfig();
	config.images.traefik = "traefik:v3.1";
	config.images.clickstack = "clickhouse/clickstack-all-in-one:latest";
	config.images.otel_agent = "otel/opentelemetry-collector-contrib:0.111.0";
	saveConfig(config);
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
	const config = loadConfig();
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
	writeFile(path.join(staged, "docker-stack.yaml"), fs.readFileSync(STACK_FILE, "utf8"));
	writeFile(path.join(staged, "traefik-dynamic.yaml"), fs.readFileSync(TRAEFIK_DYNAMIC_FILE, "utf8"));
	writeFile(path.join(staged, "keycloak-realm.envsync.json"), fs.readFileSync(KEYCLOAK_REALM_FILE, "utf8"));
	writeFile(path.join(staged, "otel-agent.yaml"), fs.readFileSync(OTEL_AGENT_CONF, "utf8"));
	const volumesDir = path.join(staged, "volumes");
	for (const volume of STACK_VOLUMES) {
		const target = path.join(volumesDir, volume);
		backupDockerVolume(stackVolumeName(config, volume), target);
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
	const config = loadConfig();
	const restoreRoot = path.join(BACKUPS_ROOT, `restore-${Date.now()}`);
	ensureDir(restoreRoot);
	run("bash", ["-lc", `tar -xzf ${JSON.stringify(archivePath)} -C ${JSON.stringify(restoreRoot)}`]);
	writeFile(DEPLOY_ENV, fs.readFileSync(path.join(restoreRoot, "deploy.env"), "utf8"), 0o600);
	writeFile(DEPLOY_YAML, fs.readFileSync(path.join(restoreRoot, "deploy.yaml"), "utf8"));
	writeFile(INTERNAL_CONFIG_JSON, fs.readFileSync(path.join(restoreRoot, "config.json"), "utf8"));
	writeFile(VERSIONS_LOCK, fs.readFileSync(path.join(restoreRoot, "versions.lock.json"), "utf8"));
	writeFile(STACK_FILE, fs.readFileSync(path.join(restoreRoot, "docker-stack.yaml"), "utf8"));
	writeFile(TRAEFIK_DYNAMIC_FILE, fs.readFileSync(path.join(restoreRoot, "traefik-dynamic.yaml"), "utf8"));
	writeFile(KEYCLOAK_REALM_FILE, fs.readFileSync(path.join(restoreRoot, "keycloak-realm.envsync.json"), "utf8"));
	writeFile(OTEL_AGENT_CONF, fs.readFileSync(path.join(restoreRoot, "otel-agent.yaml"), "utf8"));
	for (const volume of STACK_VOLUMES) {
		restoreDockerVolume(stackVolumeName(config, volume), path.join(restoreRoot, "volumes", volume));
	}
	await cmdDeploy();
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
			console.log("Usage: envsync-deploy <preinstall|setup|deploy|health|upgrade|upgrade-deps|backup|restore>");
			process.exit(command ? 1 : 0);
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
