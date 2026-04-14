#!/usr/bin/env bun

import { CreateBucketCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { config } from "../src/utils/env";
import { updateRootEnv } from "../src/utils/load-root-env";
import { DB } from "../src/libs/db";
import {
	createKeycloakUser,
	findKeycloakUserByUsername,
	getKeycloakBaseUrl,
	getKeycloakRealm,
	getKeycloakUserById,
	setKeycloakUserPassword,
} from "../src/helpers/keycloak";

const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
const localRealmImportPath = path.join(repoRoot, "docker/keycloak/realm-import/envsync-realm.json");

function buildPublicReadBucketPolicy(bucket: string) {
	return JSON.stringify({
		Version: "2012-10-17",
		Statement: [
			{
				Sid: "AllowPublicReadObjects",
				Effect: "Allow",
				Principal: "*",
				Action: ["s3:GetObject"],
				Resource: [`arn:aws:s3:::${bucket}/*`],
			},
		],
	});
}

async function initRustfsBucket() {
	const client = new S3Client({
		region: config.S3_REGION,
		endpoint: config.S3_ENDPOINT,
		forcePathStyle: true,
		credentials: {
			accessKeyId: config.S3_ACCESS_KEY,
			secretAccessKey: config.S3_SECRET_KEY,
		},
	});

	try {
		await client.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET, ACL: "public-read" }));
		console.log(`RustFS: bucket ${config.S3_BUCKET} created.`);
	} catch (error) {
		const err = error as { name?: string; Code?: string };
		if (err?.name === "BucketAlreadyOwnedByYou" || err?.Code === "BucketAlreadyOwnedByYou") {
			console.log(`RustFS: bucket ${config.S3_BUCKET} already exists.`);
		} else {
			throw error;
		}
	}

	await client.send(
		new PutBucketPolicyCommand({
			Bucket: config.S3_BUCKET,
			Policy: buildPublicReadBucketPolicy(config.S3_BUCKET),
		}),
	);
	console.log(`RustFS: public read policy applied to bucket ${config.S3_BUCKET}.`);
}

async function getAdminToken() {
	const res = await fetch(`${getKeycloakBaseUrl()}/realms/master/protocol/openid-connect/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "password",
			client_id: "admin-cli",
			username: config.KEYCLOAK_ADMIN_USER,
			password: config.KEYCLOAK_ADMIN_PASSWORD,
		}),
	});
	if (!res.ok) throw new Error(`Keycloak admin login failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as { access_token: string };
}

function loadImportedRealmClients() {
	if (!fs.existsSync(localRealmImportPath)) return null;

	const parsed = JSON.parse(fs.readFileSync(localRealmImportPath, "utf8")) as {
		clients?: Array<{
			clientId?: string;
			publicClient?: boolean;
			secret?: string;
		}>;
	};

	const clients = parsed.clients ?? [];
	const web = clients.find(client => client.clientId === config.KEYCLOAK_WEB_CLIENT_ID);
	const api = clients.find(client => client.clientId === config.KEYCLOAK_API_CLIENT_ID);
	const cli = clients.find(client => client.clientId === config.KEYCLOAK_CLI_CLIENT_ID);

	if (!web?.secret || !api?.secret || !cli) return null;

	return {
		web: { clientId: config.KEYCLOAK_WEB_CLIENT_ID, clientSecret: web.secret },
		api: { clientId: config.KEYCLOAK_API_CLIENT_ID, clientSecret: api.secret },
		cli: { clientId: config.KEYCLOAK_CLI_CLIENT_ID, clientSecret: "" },
	};
}

async function ensureKeycloakClient(
	token: string,
	clientId: string,
	opts: {
		publicClient: boolean;
		redirectUris: string[];
		standardFlowEnabled: boolean;
		deviceGrant?: boolean;
		webOrigins?: string[];
		attributes?: Record<string, string>;
	},
) {
	const base = `${getKeycloakBaseUrl()}/admin/realms/${getKeycloakRealm()}`;
	const lookup = await fetch(`${base}/clients?clientId=${encodeURIComponent(clientId)}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!lookup.ok) throw new Error(`Keycloak client lookup failed: ${lookup.status} ${await lookup.text()}`);
	const existing = ((await lookup.json()) as Array<{ id: string }>)[0];
	if (existing?.id) {
		if (opts.publicClient) return { clientId, clientSecret: "" };
		const secretRes = await fetch(`${base}/clients/${existing.id}/client-secret`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		const secretData = (await secretRes.json()) as { value: string };
		return { clientId, clientSecret: secretData.value };
	}

	const createRes = await fetch(`${base}/clients`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			clientId,
			name: clientId,
			protocol: "openid-connect",
			publicClient: opts.publicClient,
			standardFlowEnabled: opts.standardFlowEnabled,
			directAccessGrantsEnabled: false,
			serviceAccountsEnabled: false,
			redirectUris: opts.redirectUris,
			webOrigins: opts.webOrigins ?? ["*"],
			attributes: {
				...(opts.attributes ?? {}),
				...(opts.deviceGrant ? { "oauth2.device.authorization.grant.enabled": "true" } : {}),
			},
		}),
	});
	if (!createRes.ok && createRes.status !== 201) {
		throw new Error(`Keycloak client create failed: ${createRes.status} ${await createRes.text()}`);
	}

	return ensureKeycloakClient(token, clientId, opts);
}

async function initKeycloakClients() {
	let web: { clientId: string; clientSecret: string };
	let api: { clientId: string; clientSecret: string };
	let cli: { clientId: string; clientSecret: string };

	try {
		const { access_token } = await getAdminToken();
		const webCallbackOrigin = new URL(config.KEYCLOAK_WEB_CALLBACK_URL).origin;
		web = await ensureKeycloakClient(access_token, config.KEYCLOAK_WEB_CLIENT_ID, {
			publicClient: false,
			redirectUris: [config.KEYCLOAK_WEB_REDIRECT_URI, config.KEYCLOAK_WEB_CALLBACK_URL, webCallbackOrigin],
			standardFlowEnabled: true,
			webOrigins: [webCallbackOrigin],
			attributes: { "post.logout.redirect.uris": "+" },
		});
		api = await ensureKeycloakClient(access_token, config.KEYCLOAK_API_CLIENT_ID, {
			publicClient: false,
			redirectUris: [config.KEYCLOAK_API_REDIRECT_URI],
			standardFlowEnabled: true,
		});
		cli = await ensureKeycloakClient(access_token, config.KEYCLOAK_CLI_CLIENT_ID, {
			publicClient: true,
			redirectUris: [],
			standardFlowEnabled: false,
			deviceGrant: true,
		});
	} catch (error) {
		const imported = loadImportedRealmClients();
		if (!imported) {
			throw error;
		}
		web = imported.web;
		api = imported.api;
		cli = imported.cli;
		console.log("Keycloak: admin bootstrap unavailable locally, using imported realm client definitions.");
	}

	updateRootEnv({
		KEYCLOAK_WEB_CLIENT_ID: web.clientId,
		KEYCLOAK_WEB_CLIENT_SECRET: web.clientSecret,
		KEYCLOAK_API_CLIENT_ID: api.clientId,
		KEYCLOAK_API_CLIENT_SECRET: api.clientSecret,
		KEYCLOAK_CLI_CLIENT_ID: cli.clientId,
	});
	console.log("Keycloak: clients bootstrapped and written to root .env");
}

async function init() {
	await initRustfsBucket();
	await initKeycloakClients();
	console.log("\nInit done.");
}

const DEV_ORG_NAME = "EnvSync Dev";
const DEV_ORG_SLUG = "envsync-dev";
const DEV_USER_PASSWORD = "Test@1234";

async function ensureDevOrg() {
	const db = await DB.getInstance();
	let org = await db.selectFrom("orgs").selectAll().where("slug", "=", DEV_ORG_SLUG).executeTakeFirst();
	if (!org) {
		const id = randomUUID();
		await db.insertInto("orgs").values({
			id,
			name: DEV_ORG_NAME,
			slug: DEV_ORG_SLUG,
			metadata: { seeded_by: "cli" },
			created_at: new Date(),
			updated_at: new Date(),
		}).execute();
		org = await db.selectFrom("orgs").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
		console.log(`Created org "${DEV_ORG_NAME}" (${id})`);
	}

	return org;
}

async function ensureDefaultRoles(orgId: string) {
	const db = await DB.getInstance();
	const existingRoles = await db
		.selectFrom("org_role")
		.selectAll()
		.where("org_id", "=", orgId)
		.execute();

	if (existingRoles.length === 0) {
		const { RoleService } = await import("../src/services/role.service");
		await RoleService.createDefaultRoles(orgId);
		console.log("Created default roles");
	}

	return db
		.selectFrom("org_role")
		.selectAll()
		.where("org_id", "=", orgId)
		.execute();
}

function getFlagValue(rawArgs: string[], flagName: string) {
	const inlinePrefix = `--${flagName}=`;
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg.startsWith(inlinePrefix)) {
			return arg.slice(inlinePrefix.length);
		}
		if (arg === `--${flagName}`) {
			return rawArgs[index + 1];
		}
	}

	return undefined;
}

function normalizeRoleName(value: string) {
	return value.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function resolveRequestedRole(
	roles: Array<{ id: string; name: string; is_master: boolean }>,
	requestedRole: string | undefined,
) {
	if (!requestedRole) {
		return roles.find(role => role.is_master) ?? null;
	}

	const normalizedRequestedRole = normalizeRoleName(requestedRole);
	const roleAliases = new Map<string, string>([
		["master", "Org Admin"],
		["org admin", "Org Admin"],
		["admin", "Org Admin"],
		["billing admin", "Billing Admin"],
		["manager", "Manager"],
		["editor", "Developer"],
		["developer", "Developer"],
		["viewer", "Viewer"],
	]);
	const resolvedRoleName = roleAliases.get(normalizedRequestedRole) ?? requestedRole;
	const normalizedRoleName = normalizeRoleName(resolvedRoleName);

	return roles.find(role => normalizeRoleName(role.name) === normalizedRoleName) ?? null;
}

async function ensureUserRoleAccess(userId: string, orgId: string, roleId: string) {
	const { AuthorizationService } = await import("../src/services/authorization.service");
	await AuthorizationService.resyncUserRole(userId, orgId, roleId);
}

async function ensureOrgResourceAccess(orgId: string) {
	const { AuthorizationService } = await import("../src/services/authorization.service");
	const db = await DB.getInstance();

	const [apps, envTypes] = await Promise.all([
		db.selectFrom("app").select(["id", "org_id"]).where("org_id", "=", orgId).execute(),
		db.selectFrom("env_type").select(["id", "app_id", "org_id"]).where("org_id", "=", orgId).execute(),
	]);

	for (const app of apps) {
		await AuthorizationService.writeAppOrgRelation(app.id, app.org_id);
	}

	for (const envType of envTypes) {
		await AuthorizationService.writeEnvTypeRelations(envType.id, envType.app_id, envType.org_id);
	}

	console.log(`OpenFGA resource relations synced for ${apps.length} apps and ${envTypes.length} env types`);
}

async function ensureOrgCertificates(orgId: string, orgName: string, userId: string, email: string) {
	const { CertificateService } = await import("../src/services/certificate.service");
	const { CertificateRoleMapper } = await import("../src/services/certificate-role.mapper");
	const { KMSClient } = await import("../src/libs/kms/client");
	const { getVaultSessionToken, invalidateSessionToken } = await import("../src/libs/kms/session-manager");
	const { RoleService } = await import("../src/services/role.service");
	const db = await DB.getInstance();

	const orgCA = await CertificateService.getOrgCA(orgId);
	if (!orgCA) {
		await CertificateService.initOrgCA(orgId, orgName, userId, "Seeded local development CA", {
			seeded_by: "cli",
		});
		console.log("Seeded organization CA");
	}

	const memberCert = await db
		.selectFrom("org_certificates")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("user_id", "=", userId)
		.where("cert_type", "=", "member")
		.where("status", "=", "active")
		.executeTakeFirst();

	if (!memberCert) {
		const user = await db.selectFrom("users").select(["role_id"]).where("id", "=", userId).executeTakeFirstOrThrow();
		const role = await RoleService.getRole(user.role_id);
		await CertificateService.issueMemberCert({
			org_id: orgId,
			target_user_id: userId,
			target_email: email,
			issued_by_user_id: userId,
			envsync_pki_role: CertificateRoleMapper.toPkiRole(role),
			is_system_generated: true,
			persist_private_key: true,
			description: "Seeded local member certificate",
			metadata: {
				role_id: role.id,
				role_name: role.name,
				issued_source: "cli_seed",
				seeded_by: "cli",
			},
		});
		console.log("Seeded member certificate");
		return;
	}

	try {
		const kms = await KMSClient.getInstance();
		const sessionToken = await getVaultSessionToken(userId, orgId);
		const session = await kms.validateSession(sessionToken);
		if (!session.scopes.includes("vault:write")) {
			throw new Error(`Seed member session missing vault:write (${session.scopes.join(",")})`);
		}
	} catch {
		invalidateSessionToken(userId, orgId);
		const user = await db.selectFrom("users").select(["role_id"]).where("id", "=", userId).executeTakeFirstOrThrow();
		const role = await RoleService.getRole(user.role_id);
		await CertificateService.issueMemberCert({
			org_id: orgId,
			target_user_id: userId,
			target_email: email,
			issued_by_user_id: userId,
			envsync_pki_role: CertificateRoleMapper.toPkiRole(role),
			is_system_generated: true,
			persist_private_key: true,
			description: "Refreshed seeded local member certificate",
			metadata: {
				role_id: role.id,
				role_name: role.name,
				issued_source: "cli_seed",
				seeded_by: "cli",
			},
		});
		console.log("Refreshed member certificate");
	}
}

async function ensureSeededApps(orgId: string) {
	const { AppService } = await import("../src/services/app.service");
	const { EnvTypeService } = await import("../src/services/env_type.service");
	const db = await DB.getInstance();

	const appDefinitions = [
		{
			name: "Core Platform",
			description: "Primary API and worker configuration.",
			enable_secrets: true,
			is_managed_secret: false,
			envs: [
				{ name: "Development", color: "#22c55e", is_default: true, is_protected: false },
				{ name: "Staging", color: "#f59e0b", is_default: false, is_protected: true },
				{ name: "Production", color: "#ef4444", is_default: false, is_protected: true },
			],
		},
		{
			name: "Dashboard Web",
			description: "Frontend dashboard configuration and public endpoints.",
			enable_secrets: true,
			is_managed_secret: false,
			envs: [
				{ name: "Development", color: "#06b6d4", is_default: true, is_protected: false },
				{ name: "Preview", color: "#8b5cf6", is_default: false, is_protected: false },
				{ name: "Production", color: "#ec4899", is_default: false, is_protected: true },
			],
		},
	] as const;

	const seededApps: Record<string, { id: string; envs: Record<string, { id: string }> }> = {};

	for (const definition of appDefinitions) {
		const existingApp = await db
			.selectFrom("app")
			.selectAll()
			.where("org_id", "=", orgId)
			.where("name", "=", definition.name)
			.executeTakeFirst();

		const appId = existingApp?.id ?? (await AppService.createApp({
				name: definition.name,
				org_id: orgId,
				description: definition.description,
				metadata: { seeded_by: "cli", preset: "local-dev" },
				enable_secrets: definition.enable_secrets,
				is_managed_secret: definition.is_managed_secret,
			})).id;
		if (!existingApp) {
			console.log(`Seeded app "${definition.name}"`);
		}

		const envs: Record<string, { id: string }> = {};
		for (const envDefinition of definition.envs) {
			let envType = await db
				.selectFrom("env_type")
				.selectAll()
				.where("org_id", "=", orgId)
				.where("app_id", "=", appId)
				.where("name", "=", envDefinition.name)
				.executeTakeFirst();

			if (!envType) {
				envType = await EnvTypeService.createEnvType({
					name: envDefinition.name,
					org_id: orgId,
					app_id: appId,
					color: envDefinition.color,
					is_default: envDefinition.is_default,
					is_protected: envDefinition.is_protected,
				});
				console.log(`  Seeded env "${envDefinition.name}" for "${definition.name}"`);
			}

			envs[envDefinition.name] = { id: envType.id };
		}

		seededApps[definition.name] = { id: appId, envs };
	}

	return seededApps;
}

async function ensureSeededSecrets(orgId: string, userId: string, apps: Record<string, { id: string; envs: Record<string, { id: string }> }>) {
	const { SecretService } = await import("../src/services/secret.service");

	const secretDefinitions = [
		{
			appName: "Core Platform",
			envName: "Development",
			key: "DATABASE_URL",
			value: "postgres://envsync:envsync@localhost:5432/envsync_dev",
		},
		{
			appName: "Core Platform",
			envName: "Development",
			key: "REDIS_URL",
			value: "redis://localhost:6379",
		},
		{
			appName: "Core Platform",
			envName: "Staging",
			key: "JWT_SECRET",
			value: "envsync-staging-jwt-secret",
		},
		{
			appName: "Dashboard Web",
			envName: "Development",
			key: "VITE_API_BASE_URL",
			value: "http://api.lvh.me:4000",
		},
		{
			appName: "Dashboard Web",
			envName: "Production",
			key: "VITE_AUTH_BASE_URL",
			value: "https://auth.example.com",
		},
	] as const;

	for (const definition of secretDefinitions) {
		const app = apps[definition.appName];
		const envType = app?.envs[definition.envName];
		if (!app || !envType) {
			continue;
		}

		const existing = await SecretService.getSecret({
			key: definition.key,
			env_type_id: envType.id,
			app_id: app.id,
			org_id: orgId,
			user_id: userId,
		});

		if (!existing) {
			await SecretService.createSecret({
				key: definition.key,
				value: definition.value,
				env_type_id: envType.id,
				app_id: app.id,
				org_id: orgId,
				user_id: userId,
			});
			console.log(`Seeded secret ${definition.key} in ${definition.appName}/${definition.envName}`);
		}
	}
}

async function ensureSeededTeam(orgId: string, userId: string) {
	const { TeamService } = await import("../src/services/team.service");
	const db = await DB.getInstance();

	const existingTeam = await db
		.selectFrom("teams")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("name", "=", "Platform")
		.executeTakeFirst();

	const teamId = existingTeam?.id ?? (await TeamService.createTeam({
			name: "Platform",
			org_id: orgId,
			description: "Seeded platform team for local development.",
			color: "#0f766e",
		}) as { id: string }).id;
	if (!existingTeam) {
		console.log('Seeded team "Platform"');
	}

	const member = await db
		.selectFrom("team_members")
		.selectAll()
		.where("team_id", "=", teamId)
		.where("user_id", "=", userId)
		.executeTakeFirst();

	if (!member) {
		await TeamService.addTeamMember(teamId, userId);
		console.log('Added dev user to team "Platform"');
	}
}

async function ensureSeededApiKey(orgId: string, userId: string) {
	const { ApiKeyService } = await import("../src/services/api_key.service");
	const db = await DB.getInstance();

	const existing = await db
		.selectFrom("api_keys")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("user_id", "=", userId)
		.where("description", "=", "Seeded local development key")
		.executeTakeFirst();

	if (!existing) {
		await ApiKeyService.createKey({
			org_id: orgId,
			user_id: userId,
			description: "Seeded local development key",
		});
		console.log("Seeded API key");
	}
}

async function ensureSeededWebhook(orgId: string, userId: string, appId?: string) {
	const { WebhookService } = await import("../src/services/webhook.service");
	const db = await DB.getInstance();

	const existing = await db
		.selectFrom("webhook_store")
		.selectAll()
		.where("org_id", "=", orgId)
		.where("name", "=", "Local Debug Webhook")
		.executeTakeFirst();

	if (!existing) {
		await WebhookService.createWebhook({
			name: "Local Debug Webhook",
			org_id: orgId,
			user_id: userId,
			url: "http://localhost:8025/api/v1/messages",
			webhook_type: "CUSTOM",
			linked_to: appId ? "app" : "org",
			app_id: appId,
			event_types: ["app_created", "secret_created", "cert_member_issued", "webhook_triggered"],
		});
		console.log("Seeded webhook");
	}
}

async function seedDevWorkspace(orgId: string, orgName: string, userId: string, email: string) {
	await ensureOrgCertificates(orgId, orgName, userId, email);
	const apps = await ensureSeededApps(orgId);
	await ensureSeededSecrets(orgId, userId, apps);
	await ensureSeededTeam(orgId, userId);
	await ensureSeededApiKey(orgId, userId);
	await ensureSeededWebhook(orgId, userId, apps["Core Platform"]?.id);
}

async function createDevUser() {
	const rawArgs = process.argv.slice(3);
	const positional = rawArgs.filter((arg, index) => {
		if (!arg.startsWith("--")) {
			return index === 0 || rawArgs[index - 1] !== "--role";
		}
		return false;
	});
	const flags = new Set(rawArgs.filter(arg => arg.startsWith("--")));
	const requestedRole = getFlagValue(rawArgs, "role");
	const email = positional[0] ?? "dev@envsync.local";
	const fullName = positional[1] ?? "EnvSync Dev";
	const password = DEV_USER_PASSWORD;
	const db = await DB.getInstance();

	const org = await ensureDevOrg();
	const roles = await ensureDefaultRoles(org.id);
	const role = resolveRequestedRole(roles, requestedRole);
	if (!role) {
		throw new Error(`Requested role "${requestedRole ?? "master"}" does not exist in org ${org.id}`);
	}

	let user = await db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();

	if (!user) {
		const parts = fullName.trim().split(/\s+/).filter(Boolean);
		const idp = await createKeycloakUser({
			userName: email,
			email,
			firstName: parts[0] ?? "EnvSync",
			lastName: parts.slice(1).join(" ") || "Dev",
			password,
		});

		const userId = randomUUID();
		await db.insertInto("users").values({
			id: userId,
			email,
			org_id: org.id,
			role_id: role.id,
			auth_service_id: idp.id,
			full_name: fullName,
			is_active: true,
			profile_picture_url: null,
			created_at: new Date(),
			updated_at: new Date(),
		}).execute();
		user = await db.selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirstOrThrow();
		console.log(`Dev user created: ${email} / ${password}`);
	} else {
		console.log(`Dev user already exists: ${email}`);

		let idpUser = user.auth_service_id ? await getKeycloakUserById(user.auth_service_id) : null;
		if (!idpUser) {
			idpUser = await findKeycloakUserByUsername(email);
		}
		if (!idpUser) {
			const parts = fullName.trim().split(/\s+/).filter(Boolean);
			idpUser = await createKeycloakUser({
				userName: email,
				email,
				firstName: parts[0] ?? "EnvSync",
				lastName: parts.slice(1).join(" ") || "Dev",
				password,
			});
			console.log("Recreated missing Keycloak user for existing dev account");
		}
		if (user.auth_service_id !== idpUser.id) {
			await db.updateTable("users")
				.set({ auth_service_id: idpUser.id, updated_at: new Date() })
				.where("id", "=", user.id)
				.execute();
			user = await db.selectFrom("users").selectAll().where("id", "=", user.id).executeTakeFirstOrThrow();
			console.log("Synced dev user auth_service_id with Keycloak");
		}
		await setKeycloakUserPassword(idpUser.id, password);
		console.log(`Dev user login reset: ${email} / ${password}`);
		if (user.role_id !== role.id) {
			const { UserService } = await import("../src/services/user.service");
			await UserService.updateUser(user.id, { role_id: role.id });
			user = await db.selectFrom("users").selectAll().where("id", "=", user.id).executeTakeFirstOrThrow();
			console.log(`Updated dev user role to ${role.name}`);
		}
	}

	await ensureUserRoleAccess(user.id, org.id, role.id);
	console.log("Dev user permissions synced");

	if (flags.has("--seed")) {
		await seedDevWorkspace(org.id, org.name, user.id, email);
		console.log("Seeded local development workspace");
	}

	await ensureOrgResourceAccess(org.id);
}

const cmd = process.argv[2];
if (cmd === "init") {
	await init();
} else if (cmd === "create-dev-user") {
	await createDevUser();
} else {
	console.log("Usage: bun run scripts/cli.ts <init|create-dev-user>");
	process.exit(cmd ? 1 : 0);
}
