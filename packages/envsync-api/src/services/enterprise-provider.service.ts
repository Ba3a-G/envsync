import { ValidationError } from "@/libs/errors";

export const enterpriseProviders = [
	"github",
	"gitlab",
	"aws-ssm",
	"vercel",
	"google-secret-manager",
] as const;

export type EnterpriseProvider = typeof enterpriseProviders[number];

type JsonRecord = Record<string, unknown>;

export interface EnterpriseProviderProfile {
	id: EnterpriseProvider;
	name: string;
	scope: string;
	description: string;
	connection_requirements: string[];
	binding_metadata_fields: string[];
	mapping_requirements: string[];
}

const providerProfiles: Record<EnterpriseProvider, EnterpriseProviderProfile> = {
	github: {
		id: "github",
		name: "GitHub",
		scope: "repository-secrets",
		description: "Maps application env types to GitHub repositories and branch-aware repo secret targets.",
		connection_requirements: [
			"Active connections should declare owner/account context and a secret or token reference in auth_config.",
		],
		binding_metadata_fields: ["repository_visibility", "default_secret_prefix", "secret_name_template"],
		mapping_requirements: [
			"target_identifier should point to owner/repo or another GitHub repository target identifier.",
			"branch_ref is required and should match the repository branch or ref used for the mapping.",
		],
	},
	gitlab: {
		id: "gitlab",
		name: "GitLab",
		scope: "project-variables",
		description: "Maps application env types to GitLab projects or groups with branch-aware variable targeting.",
		connection_requirements: [
			"Active connections should declare group/account context and a secret or token reference in auth_config.",
		],
		binding_metadata_fields: ["group_path", "variable_scope", "secret_name_template"],
		mapping_requirements: [
			"target_identifier should point to a GitLab project/group path.",
			"branch_ref is required and should match the environment or ref that the variables apply to.",
		],
	},
	"aws-ssm": {
		id: "aws-ssm",
		name: "AWS SSM",
		scope: "parameter-store",
		description: "Maps application env types to AWS SSM Parameter Store paths and prefixes.",
		connection_requirements: [
			"Active connections should declare a region plus either a credential secret reference or an assumed role in auth_config.",
		],
		binding_metadata_fields: ["region", "kms_key_id", "path_strategy"],
		mapping_requirements: [
			"target_identifier should describe the logical target or parameter namespace.",
			"path_prefix is required and should begin with '/'.",
		],
	},
	vercel: {
		id: "vercel",
		name: "Vercel",
		scope: "project-environments",
		description: "Maps application env types to Vercel projects and deployment environments.",
		connection_requirements: [
			"Active connections should declare a token reference and optionally a team scope in auth_config.",
		],
		binding_metadata_fields: ["team_id", "project_id", "secret_name_template"],
		mapping_requirements: [
			"target_identifier should describe the Vercel project target.",
			"branch_ref is required and acts as the Vercel environment selector for the mapping.",
		],
	},
	"google-secret-manager": {
		id: "google-secret-manager",
		name: "Google Secret Manager",
		scope: "secret-manager",
		description: "Maps application env types to Google Secret Manager projects and optional namespace or prefix rules.",
		connection_requirements: [
			"Active connections should declare project or workload-identity context and a service-account reference in auth_config.",
		],
		binding_metadata_fields: ["project_id", "replication_policy", "secret_name_template"],
		mapping_requirements: [
			"target_identifier should describe the GCP project or logical secret namespace.",
			"path_prefix is optional and can be used as a secret-name prefix.",
		],
	},
};

function hasString(record: JsonRecord | undefined, ...keys: string[]) {
	return keys.some(key => typeof record?.[key] === "string" && String(record[key]).trim().length > 0);
}

function isEmptyRecord(record: JsonRecord | undefined) {
	return !record || Object.keys(record).length === 0;
}

export class EnterpriseProviderService {
	public static listProviders() {
		return enterpriseProviders.map(provider => providerProfiles[provider]);
	}

	public static getProfile(provider: string): EnterpriseProviderProfile {
		this.assertProvider(provider);
		return providerProfiles[provider];
	}

	public static assertProvider(provider: string): asserts provider is EnterpriseProvider {
		if (!(enterpriseProviders as readonly string[]).includes(provider)) {
			throw new ValidationError(`Unsupported provider type: ${provider}`);
		}
	}

	public static validateProviderConnection(input: {
		provider_type: string;
		status?: "active" | "inactive" | "error";
		auth_config?: JsonRecord;
	}) {
		this.assertProvider(input.provider_type);

		if (input.status !== "inactive" && isEmptyRecord(input.auth_config)) {
			throw new ValidationError(
				`${providerProfiles[input.provider_type].name} connections require auth_config before they can be active.`,
				"ENTERPRISE_PROVIDER_CONNECTION_INVALID",
			);
		}

		switch (input.provider_type) {
			case "github":
			case "gitlab":
				if (
					input.status !== "inactive"
					&& !hasString(input.auth_config, "owner", "account", "group_path", "token_secret_ref", "installation_id", "app_id")
				) {
					throw new ValidationError(
						`${providerProfiles[input.provider_type].name} connections require owner/account context or a credential reference in auth_config.`,
						"ENTERPRISE_PROVIDER_CONNECTION_INVALID",
					);
				}
				break;
			case "aws-ssm":
				if (
					input.status !== "inactive"
					&& (
						!hasString(input.auth_config, "region")
						|| !hasString(input.auth_config, "credential_secret_ref", "access_key_secret_ref", "role_arn")
					)
				) {
					throw new ValidationError(
						"AWS SSM connections require region and a credential reference or role_arn in auth_config.",
						"ENTERPRISE_PROVIDER_CONNECTION_INVALID",
					);
				}
				break;
			case "vercel":
				if (input.status !== "inactive" && !hasString(input.auth_config, "token_secret_ref", "team_id", "project_id")) {
					throw new ValidationError(
						"Vercel connections require a token or team/project reference in auth_config.",
						"ENTERPRISE_PROVIDER_CONNECTION_INVALID",
					);
				}
				break;
			case "google-secret-manager":
				if (
					input.status !== "inactive"
					&& !hasString(input.auth_config, "project_id", "service_account_secret_ref", "workload_identity_provider")
				) {
					throw new ValidationError(
						"Google Secret Manager connections require project or workload identity context in auth_config.",
						"ENTERPRISE_PROVIDER_CONNECTION_INVALID",
					);
				}
				break;
		}
	}

	public static validateBinding(input: {
		provider_type: string;
		connection_provider_type: string;
		metadata?: JsonRecord;
	}) {
		this.assertProvider(input.provider_type);
		this.assertProvider(input.connection_provider_type);

		if (input.provider_type !== input.connection_provider_type) {
			throw new ValidationError(
				`Binding provider ${input.provider_type} does not match connection provider ${input.connection_provider_type}.`,
				"ENTERPRISE_BINDING_PROVIDER_MISMATCH",
			);
		}

		if (input.metadata && typeof input.metadata !== "object") {
			throw new ValidationError("Binding metadata must be a JSON object.", "ENTERPRISE_BINDING_INVALID");
		}
	}

	public static validateMapping(input: {
		provider_type: string;
		target_identifier: string;
		branch_ref?: string | null;
		path_prefix?: string | null;
		metadata?: JsonRecord;
	}) {
		this.assertProvider(input.provider_type);

		if (!input.target_identifier.trim()) {
			throw new ValidationError("target_identifier is required.", "ENTERPRISE_MAPPING_INVALID");
		}

		switch (input.provider_type) {
			case "github":
			case "gitlab":
				if (!input.branch_ref?.trim()) {
					throw new ValidationError(
						`${providerProfiles[input.provider_type].name} mappings require branch_ref.`,
						"ENTERPRISE_MAPPING_INVALID",
					);
				}
				break;
			case "vercel":
				if (!input.branch_ref?.trim()) {
					throw new ValidationError(
						"Vercel mappings require branch_ref as the environment selector.",
						"ENTERPRISE_MAPPING_INVALID",
					);
				}
				break;
			case "aws-ssm":
				if (!input.path_prefix?.trim() || !input.path_prefix.startsWith("/")) {
					throw new ValidationError(
						"AWS SSM mappings require path_prefix and it must start with '/'.",
						"ENTERPRISE_MAPPING_INVALID",
					);
				}
				break;
			case "google-secret-manager":
				break;
		}

		if (input.metadata && typeof input.metadata !== "object") {
			throw new ValidationError("Mapping metadata must be a JSON object.", "ENTERPRISE_MAPPING_INVALID");
		}
	}

	public static buildTargetDescriptor(input: {
		provider_type: EnterpriseProvider;
		target_identifier: string;
		branch_ref?: string | null;
		path_prefix?: string | null;
	}) {
		switch (input.provider_type) {
			case "github":
				return {
					repository: input.target_identifier,
					ref: input.branch_ref ?? null,
					scope: "repo_secret",
				};
			case "gitlab":
				return {
					project: input.target_identifier,
					ref: input.branch_ref ?? null,
					scope: "project_variable",
				};
			case "vercel":
				return {
					project: input.target_identifier,
					environment: input.branch_ref ?? null,
					scope: "vercel_env",
				};
			case "aws-ssm":
				return {
					target: input.target_identifier,
					path_prefix: input.path_prefix ?? null,
					scope: "parameter_store",
				};
			case "google-secret-manager":
				return {
					project: input.target_identifier,
					secret_prefix: input.path_prefix ?? null,
					scope: "secret_manager",
				};
		}
	}
}
