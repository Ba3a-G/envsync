import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { importPKCS8, SignJWT } from "jose";
import sodium from "libsodium-wrappers";

import { DB } from "@/libs/db";
import { NotFoundError, ValidationError } from "@/libs/errors";

import { type EnterpriseProvider } from "./enterprise-provider.service";

type JsonRecord = Record<string, unknown>;

export interface EnterpriseSyncItem {
	key: string;
	value: string;
	kind: "env" | "secret";
}

export interface EnterpriseSyncContext {
	org_id: string;
	app_id: string;
	env_type_id: string;
	provider_type: EnterpriseProvider;
	connection: {
		id: string;
		name: string;
		provider_type: EnterpriseProvider;
		auth_config: JsonRecord;
		metadata: JsonRecord;
	};
	binding: {
		id: string;
		metadata: JsonRecord;
	};
	mapping: {
		id: string;
		target_identifier: string;
		branch_ref: string | null;
		path_prefix: string | null;
		metadata: JsonRecord;
	};
	items: EnterpriseSyncItem[];
}

export interface EnterpriseSyncResult {
	written_count: number;
	target: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const strings = value.filter(item => typeof item === "string" && item.trim().length > 0).map(item => item.trim());
	return strings.length > 0 ? strings : undefined;
}

function sanitizeSecretKey(key: string) {
	return key.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function sanitizeGoogleSecretId(key: string) {
	const normalized = key.replace(/[^A-Za-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
	return normalized || "ENVSYNC_SECRET";
}

async function fetchJson(url: string, init: RequestInit, allowStatuses: number[] = []) {
	const response = await fetch(url, init);
	if (allowStatuses.includes(response.status)) {
		return { response, body: null as unknown };
	}

	const text = await response.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}

	if (!response.ok) {
		const message = typeof body === "object" && body && "message" in body
			? String((body as { message?: unknown }).message)
			: typeof body === "string" && body
				? body
				: response.statusText;
		throw new ValidationError(`Provider request failed: ${message}`, "ENTERPRISE_PROVIDER_SYNC_FAILED");
	}

	return { response, body };
}

export class EnterpriseProviderSyncService {
	private static async getOrgSecretValue(org_id: string, key: string) {
		const db = await DB.getInstance();
		const secret = await db
			.selectFrom("org_secret")
			.selectAll()
			.where("org_id", "=", org_id)
			.where("key", "=", key)
			.executeTakeFirst();
		if (!secret) {
			throw new NotFoundError("OrgSecret", key, "ENTERPRISE_ORG_SECRET_NOT_FOUND");
		}
		return secret.value;
	}

	private static async resolveConfigValue(org_id: string, config: JsonRecord, key: string) {
		const direct = asString(config[key]);
		if (direct) {
			return direct;
		}

		const secretRef = asString(config[`${key}_secret_ref`]);
		if (secretRef) {
			return this.getOrgSecretValue(org_id, secretRef);
		}

		return undefined;
	}

	private static buildRemoteKey(item: EnterpriseSyncItem, context: EnterpriseSyncContext) {
		const prefix = asString(context.binding.metadata.name_prefix)
			?? asString(context.mapping.metadata.name_prefix)
			?? asString(context.connection.metadata.name_prefix);
		const baseKey = prefix ? `${prefix}_${item.key}` : item.key;
		return sanitizeSecretKey(baseKey);
	}

	private static getGithubRepo(target_identifier: string) {
		const [owner, repo] = target_identifier.split("/");
		if (!owner || !repo) {
			throw new ValidationError(
				"GitHub target_identifier must be in owner/repo format.",
				"ENTERPRISE_GITHUB_TARGET_INVALID",
			);
		}
		return { owner, repo };
	}

	private static getGitlabBaseUrl(auth_config: JsonRecord) {
		return asString(auth_config.base_url) ?? "https://gitlab.com";
	}

	private static getVercelBaseUrl(auth_config: JsonRecord) {
		return asString(auth_config.base_url) ?? "https://api.vercel.com";
	}

	private static async syncGithub(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		const token = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "token");
		if (!token) {
			throw new ValidationError("GitHub connection requires token or token_secret_ref.", "ENTERPRISE_GITHUB_AUTH_MISSING");
		}

		const { owner, repo } = this.getGithubRepo(context.mapping.target_identifier);
		const headers = {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			"Content-Type": "application/json",
		};

		const { body: publicKeyBody } = await fetchJson(
			`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/public-key`,
			{ method: "GET", headers },
		);
		const publicKey = publicKeyBody as { key: string; key_id: string };

		await sodium.ready;
		const keyBytes = sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL);

		for (const item of context.items) {
			const secretName = this.buildRemoteKey(item, context);
			const encrypted = sodium.crypto_box_seal(sodium.from_string(item.value), keyBytes);
			const encryptedValue = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

			await fetchJson(
				`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets/${encodeURIComponent(secretName)}`,
				{
					method: "PUT",
					headers,
					body: JSON.stringify({
						encrypted_value: encryptedValue,
						key_id: publicKey.key_id,
					}),
				},
			);
		}

		return {
			written_count: context.items.length,
			target: {
				repository: `${owner}/${repo}`,
				ref: context.mapping.branch_ref,
				scope: "repo_secret",
			},
		};
	}

	private static async syncGitlab(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		const token = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "token");
		if (!token) {
			throw new ValidationError("GitLab connection requires token or token_secret_ref.", "ENTERPRISE_GITLAB_AUTH_MISSING");
		}

		const baseUrl = this.getGitlabBaseUrl(context.connection.auth_config).replace(/\/$/, "");
		const projectId = encodeURIComponent(context.mapping.target_identifier);
		const environmentScope = context.mapping.branch_ref ?? "*";

		for (const item of context.items) {
			const key = this.buildRemoteKey(item, context);
			const body = new URLSearchParams({
				key,
				value: item.value,
				environment_scope: environmentScope,
				raw: "true",
				masked: item.kind === "secret" ? "true" : "false",
				protected: asString(context.mapping.metadata.protected) === "true" ? "true" : "false",
				variable_type: "env_var",
			});

			const updateUrl = `${baseUrl}/api/v4/projects/${projectId}/variables/${encodeURIComponent(key)}`;
			const updateResponse = await fetch(updateUrl, {
				method: "PUT",
				headers: {
					"PRIVATE-TOKEN": token,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					...Object.fromEntries(body.entries()),
					"filter[environment_scope]": environmentScope,
				}),
			});

			if (updateResponse.status === 404) {
				await fetchJson(
					`${baseUrl}/api/v4/projects/${projectId}/variables`,
					{
						method: "POST",
						headers: {
							"PRIVATE-TOKEN": token,
							"Content-Type": "application/x-www-form-urlencoded",
						},
						body,
					},
				);
				continue;
			}

			const updateText = await updateResponse.text();
			if (!updateResponse.ok) {
				let message = updateResponse.statusText;
				try {
					const parsed = updateText ? JSON.parse(updateText) as { message?: unknown } : null;
					if (parsed?.message) {
						message = typeof parsed.message === "string" ? parsed.message : JSON.stringify(parsed.message);
					}
				} catch {
					if (updateText) {
						message = updateText;
					}
				}
				throw new ValidationError(`Provider request failed: ${message}`, "ENTERPRISE_PROVIDER_SYNC_FAILED");
			}
		}

		return {
			written_count: context.items.length,
			target: {
				project: context.mapping.target_identifier,
				environment_scope: environmentScope,
			},
		};
	}

	private static async syncVercel(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		const token = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "token");
		if (!token) {
			throw new ValidationError("Vercel connection requires token or token_secret_ref.", "ENTERPRISE_VERCEL_AUTH_MISSING");
		}

		const baseUrl = this.getVercelBaseUrl(context.connection.auth_config).replace(/\/$/, "");
		const project = encodeURIComponent(context.mapping.target_identifier);
		const teamId = asString(context.connection.auth_config.team_id) ?? asString(context.binding.metadata.team_id);
		const slug = asString(context.connection.auth_config.slug) ?? asString(context.binding.metadata.slug);
		const customEnvironmentIds = asStringArray(context.mapping.metadata.customEnvironmentIds);
		const query = new URLSearchParams({ upsert: "true" });
		if (teamId) query.set("teamId", teamId);
		if (slug) query.set("slug", slug);

		let targets = asStringArray(context.mapping.metadata.targets);
		if (!targets) {
			const branchRef = context.mapping.branch_ref ?? "";
			if (["production", "preview", "development"].includes(branchRef)) {
				targets = [branchRef];
			} else {
				targets = ["preview"];
			}
		}

		for (const item of context.items) {
			await fetchJson(
				`${baseUrl}/v10/projects/${project}/env?${query.toString()}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						key: this.buildRemoteKey(item, context),
						value: item.value,
						type: item.kind === "secret" ? "encrypted" : "plain",
						target: targets,
						gitBranch: context.mapping.branch_ref ?? undefined,
						customEnvironmentIds,
						comment: asString(context.mapping.metadata.comment) ?? undefined,
					}),
				},
			);
		}

		return {
			written_count: context.items.length,
			target: {
				project: context.mapping.target_identifier,
				targets,
				gitBranch: context.mapping.branch_ref,
			},
		};
	}

	private static async syncAwsSsm(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		const region = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "region");
		if (!region) {
			throw new ValidationError("AWS SSM connection requires region.", "ENTERPRISE_AWS_SSM_CONFIG_MISSING");
		}

		const accessKeyId = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "access_key_id");
		const secretAccessKey = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "secret_access_key");
		if (!accessKeyId || !secretAccessKey) {
			throw new ValidationError(
				"AWS SSM connection requires access_key_id and secret_access_key or matching secret refs.",
				"ENTERPRISE_AWS_SSM_AUTH_MISSING",
			);
		}

		const client = new SSMClient({
			region,
			credentials: {
				accessKeyId,
				secretAccessKey,
				sessionToken: await this.resolveConfigValue(context.org_id, context.connection.auth_config, "session_token"),
			},
		});

		const prefix = context.mapping.path_prefix ?? "/";
		const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
		const targetPrefix = context.mapping.target_identifier.replace(/^\/+|\/+$/g, "");
		const kmsKeyId = asString(context.mapping.metadata.kms_key_id)
			?? asString(context.binding.metadata.kms_key_id)
			?? asString(context.connection.auth_config.kms_key_id);

		for (const item of context.items) {
			const name = `${normalizedPrefix}/${targetPrefix}/${this.buildRemoteKey(item, context)}`.replace(/\/+/g, "/");
			await client.send(new PutParameterCommand({
				Name: name,
				Value: item.value,
				Type: "SecureString",
				Overwrite: true,
				KeyId: kmsKeyId,
			}));
		}

		return {
			written_count: context.items.length,
			target: {
				path_prefix: normalizedPrefix,
				target: context.mapping.target_identifier,
				region,
			},
		};
	}

	private static async getGoogleAccessToken(serviceAccountJson: string) {
		const credentials = JSON.parse(serviceAccountJson) as {
			client_email?: string;
			private_key?: string;
			token_uri?: string;
		};
		if (!credentials.client_email || !credentials.private_key) {
			throw new ValidationError(
				"Google Secret Manager service account JSON is missing client_email or private_key.",
				"ENTERPRISE_GSM_AUTH_INVALID",
			);
		}

		const now = Math.floor(Date.now() / 1000);
		const key = await importPKCS8(credentials.private_key, "RS256");
		const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/cloud-platform" })
			.setProtectedHeader({ alg: "RS256", typ: "JWT" })
			.setIssuer(credentials.client_email)
			.setSubject(credentials.client_email)
			.setAudience(credentials.token_uri ?? "https://oauth2.googleapis.com/token")
			.setIssuedAt(now)
			.setExpirationTime(now + 3600)
			.sign(key);

		const tokenResponse = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion,
			}),
		});

		const tokenBody = await tokenResponse.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
		if (!tokenResponse.ok || !tokenBody?.access_token) {
			throw new ValidationError(
				`Failed to obtain Google access token: ${tokenBody?.error_description ?? tokenResponse.statusText}`,
				"ENTERPRISE_GSM_AUTH_INVALID",
			);
		}

		return tokenBody.access_token;
	}

	private static async syncGoogleSecretManager(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		const serviceAccountJson = await this.resolveConfigValue(context.org_id, context.connection.auth_config, "service_account_json");
		if (!serviceAccountJson) {
			throw new ValidationError(
				"Google Secret Manager connection requires service_account_json or service_account_json_secret_ref.",
				"ENTERPRISE_GSM_AUTH_MISSING",
			);
		}

		const accessToken = await this.getGoogleAccessToken(serviceAccountJson);
		const projectId = context.mapping.target_identifier;
		const prefix = (context.mapping.path_prefix ?? "").replace(/^\/+|\/+$/g, "");

		for (const item of context.items) {
			const secretId = sanitizeGoogleSecretId(prefix ? `${prefix}-${this.buildRemoteKey(item, context)}` : this.buildRemoteKey(item, context));
			const createUrl = `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/secrets?secretId=${encodeURIComponent(secretId)}`;
			const replication = asString(context.connection.auth_config.replication_policy) === "user-managed"
				? { userManaged: { replicas: [{ location: asString(context.connection.auth_config.replica_location) ?? "us-central1" }] } }
				: { automatic: {} };

			const createResponse = await fetch(createUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ replication }),
			});
			if (createResponse.status !== 409 && !createResponse.ok) {
				const body = await createResponse.text();
				throw new ValidationError(`Provider request failed: ${body || createResponse.statusText}`, "ENTERPRISE_PROVIDER_SYNC_FAILED");
			}

			await fetchJson(
				`https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(secretId)}:addVersion`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						payload: {
							data: Buffer.from(item.value, "utf-8").toString("base64"),
						},
					}),
				},
			);
		}

		return {
			written_count: context.items.length,
			target: {
				project: projectId,
				secret_prefix: prefix || null,
			},
		};
	}

	public static async sync(context: EnterpriseSyncContext): Promise<EnterpriseSyncResult> {
		switch (context.provider_type) {
			case "github":
				return this.syncGithub(context);
			case "gitlab":
				return this.syncGitlab(context);
			case "vercel":
				return this.syncVercel(context);
			case "aws-ssm":
				return this.syncAwsSsm(context);
			case "google-secret-manager":
				return this.syncGoogleSecretManager(context);
		}
	}
}
