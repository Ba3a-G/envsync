import { describe, expect, test } from "bun:test";

import {
	buildRuntimeEnv,
	renderApiMaintenanceConf,
	renderClickstackClickHouseConfig,
	renderFrontendRuntimeConfig,
	renderKeycloakRealm,
	renderNginxConf,
	renderOtelAgentConfig,
	renderStack,
	renderTraefikDynamicConfig,
	type DeployConfig,
	type DeployGeneratedState,
} from "./render";

const config: DeployConfig = {
	source: {
		repo_url: "https://github.com/EnvSync-Cloud/envsync.git",
		ref: "main",
	},
	release: {
		version: "0.8.4",
	},
	domain: {
		root_domain: "enterprise.example.com",
		acme_email: "ops@example.com",
	},
	images: {
		api: "ghcr.io/envsync-cloud/envsync-api:0.8.4",
		keycloak: "envsync-keycloak:0.8.4",
		web: "ghcr.io/envsync-cloud/envsync-web-static:0.8.4",
		landing: "ghcr.io/envsync-cloud/envsync-landing-static:0.8.4",
		clickstack: "ghcr.io/envsync-cloud/clickstack:0.8.4",
		traefik: "traefik:v3.1",
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
		admin_user: "admin",
		admin_password: "admin",
		web_client_id: "envsync-web",
		api_client_id: "envsync-api",
		cli_client_id: "envsync-cli",
	},
	observability: {
		retention_days: 14,
		public_obs: true,
	},
	backup: {
		output_dir: "/backups",
		encrypted: true,
	},
	smtp: {
		host: "smtp.example.com",
		port: 587,
		secure: false,
		user: "smtp-user",
		pass: "smtp-pass",
		from: "ops@example.com",
	},
	exposure: {
		public_auth: true,
		public_obs: true,
		mailpit_enabled: false,
		s3_public: false,
		s3_console_public: false,
	},
	upgrade: {
		maintenance_mode_enabled: true,
		db_snapshot_on_api_upgrade: true,
		keep_failed_upgrade_db_snapshot: true,
	},
};

const generated: DeployGeneratedState = {
	openfga: {
		store_id: "store_123",
		model_id: "model_456",
	},
	deployment: {
		active_slot: "blue",
		previous_slot: "green",
		maintenance_mode: false,
		slots: {
			blue: {
				api_image: "ghcr.io/envsync-cloud/envsync-api:0.8.4",
				release_version: "0.8.4",
				deployed_at: "2026-04-30T00:00:00.000Z",
			},
			green: {
				api_image: "ghcr.io/envsync-cloud/envsync-api:0.7.7",
				release_version: "0.7.7",
				deployed_at: "2026-04-29T00:00:00.000Z",
			},
		},
	},
	clickstack: {
		operator_email: "ops@example.com",
		operator_password: "clickstack-pass",
		access_key: "clickstack-access",
		browser_api_key: "browser-api-key",
	},
	secrets: {
		s3_secret_key: "s3-secret-key",
		keycloak_db_password: "keycloak-db-pass",
		keycloak_web_client_secret: "web-client-secret",
		keycloak_api_client_secret: "api-client-secret",
		openfga_db_password: "openfga-db-pass",
		minikms_root_key: "minikms-root-key",
		minikms_db_password: "minikms-db-pass",
	},
	bootstrap: {
		completed_at: "2026-04-30T00:00:00.000Z",
	},
};

const paths = {
	traefikStateRoot: "/var/lib/envsync/traefik",
	deployRoot: "/opt/envsync/deploy",
	releasesRoot: "/opt/envsync/releases",
	keycloakRealmFile: "/opt/envsync/deploy/keycloak-realm.envsync.json",
	clickstackClickhouseConf: "/opt/envsync/deploy/clickhouse-listen.xml",
	otelAgentConf: "/opt/envsync/deploy/otel-agent.yaml",
	nginxLandingConf: "/opt/envsync/deploy/nginx-landing.conf",
	nginxWebConf: "/opt/envsync/deploy/nginx-web.conf",
	nginxApiMaintenanceConf: "/opt/envsync/deploy/nginx-api-maintenance.conf",
} as const;

describe("deploy render helpers", () => {
	test("render enterprise runtime and stack artifacts with expected hostnames and mounted outputs", () => {
		const runtimeEnv = buildRuntimeEnv(config, generated);
		const stackBase = renderStack(config, runtimeEnv, generated, "base", paths);
		const stackFull = renderStack(config, runtimeEnv, generated, "full", paths);
		const traefik = renderTraefikDynamicConfig(config, generated);
		const keycloakRealm = renderKeycloakRealm(config, runtimeEnv);
		const frontendRuntime = renderFrontendRuntimeConfig(config, generated);

		expect(runtimeEnv.KEYCLOAK_WEB_CLIENT_SECRET).toBe("web-client-secret");
		expect(runtimeEnv.OPENFGA_STORE_ID).toBe("store_123");
		expect(runtimeEnv.DASHBOARD_URL).toBe("https://app.enterprise.example.com");

		expect(stackBase).not.toContain("landing_nginx");
		expect(stackBase).not.toContain("envsync_api_blue");

		expect(stackFull).toContain("landing_nginx");
		expect(stackFull).toContain("web_nginx");
		expect(stackFull).toContain("envsync_api_blue");
		expect(stackFull).toContain("envsync_api_green");
		expect(stackFull).toContain("/opt/envsync/releases/web/current:/srv/web:ro");
		expect(stackFull).toContain("/opt/envsync/releases/landing/current:/srv/landing:ro");
		expect(stackFull).toContain("/opt/envsync/deploy/keycloak-realm.envsync.json");
		expect(stackFull).toContain("https://s3.enterprise.example.com/envsync-bucket");

		expect(traefik).toContain("Host(`app.enterprise.example.com`)");
		expect(traefik).toContain("Host(`api.enterprise.example.com`)");
		expect(traefik).toContain("Host(`enterprise.example.com`)");
		expect(traefik).toContain("obs.enterprise.example.com");

		expect(keycloakRealm).toContain("\"clientId\": \"envsync-web\"");
		expect(keycloakRealm).toContain("https://api.enterprise.example.com/api/access/web/callback");
		expect(keycloakRealm).toContain("https://app.enterprise.example.com/auth/callback");

		expect(frontendRuntime).toContain("https://api.enterprise.example.com");
		expect(frontendRuntime).toContain("\"activeApiSlot\": \"blue\"");
		expect(frontendRuntime).toContain("\"releaseVersion\": \"0.8.4\"");
	});

	test("render supporting nginx and otel artifacts", () => {
		expect(renderNginxConf("web")).toContain("root /srv/web;");
		expect(renderNginxConf("landing")).toContain("root /srv/landing;");
		expect(renderApiMaintenanceConf()).toContain("Upgrade in progress. Please retry shortly.");
		expect(renderOtelAgentConfig(config)).toContain("endpoint: http://clickstack:4318");
		expect(renderClickstackClickHouseConfig()).toContain("<listen_host>0.0.0.0</listen_host>");
	});
});
