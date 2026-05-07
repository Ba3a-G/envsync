import type { EnterpriseProvider } from "@/api/enterprise/types";

export type ProviderFieldKind = "text" | "select" | "secret-ref";

export interface ProviderFieldOption {
  label: string;
  value: string;
}

export interface ProviderFieldConfig {
  key: string;
  label: string;
  kind: ProviderFieldKind;
  placeholder?: string;
  helper?: string;
  options?: ProviderFieldOption[];
}

export interface ProviderUiConfig {
  id: EnterpriseProvider;
  name: string;
  description: string;
  title: string;
  providerHeadline: string;
  targetLabel: string;
  helper: string;
  branchLabel: string;
  targetPlaceholder: string;
  branchPlaceholder: string;
  pathLabel: string;
  pathPlaceholder: string;
  usesBranch: boolean;
  usesPath: boolean;
  connectionAuthFields: ProviderFieldConfig[];
  connectionMetadataFields: ProviderFieldConfig[];
  bindingFields: ProviderFieldConfig[];
  mappingFields: ProviderFieldConfig[];
}

const yesNoOptions: ProviderFieldOption[] = [
  { label: "Not set", value: "" },
  { label: "yes", value: "yes" },
  { label: "no", value: "no" },
];

const secretPrefixField: ProviderFieldConfig = {
  key: "secret_name_template",
  label: "Secret name template",
  kind: "text",
  placeholder: "{{app}}_{{env}}_{{key}}",
  helper: "Optional template for remote secret names.",
};

export const enterpriseProviderUi: Record<EnterpriseProvider, ProviderUiConfig> = {
  github: {
    id: "github",
    name: "GitHub",
    description: "Map environment types to GitHub repositories, branches, and repo secrets.",
    title: "GitHub repository mapping",
    providerHeadline: "Register the GitHub account context and how EnvSync should name repository secrets by default.",
    targetLabel: "Repository target",
    helper: "Bind a GitHub connection to this app, then decide which repository and branch should receive each environment type.",
    branchLabel: "Branch or ref",
    targetPlaceholder: "owner/repository",
    branchPlaceholder: "main",
    pathLabel: "Path prefix",
    pathPlaceholder: "Not used for GitHub",
    usesBranch: true,
    usesPath: false,
    connectionAuthFields: [
      { key: "owner", label: "Owner or org", kind: "text", placeholder: "envsync-cloud" },
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "github-token" },
      { key: "installation_id", label: "Installation ID", kind: "text", placeholder: "123456" },
      { key: "app_id", label: "GitHub App ID", kind: "text", placeholder: "98765" },
    ],
    connectionMetadataFields: [
      { key: "repository_visibility", label: "Repository visibility", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "private", value: "private" },
        { label: "internal", value: "internal" },
        { label: "public", value: "public" },
      ]},
      { key: "default_secret_prefix", label: "Default secret prefix", kind: "text", placeholder: "ENVSYNC" },
      secretPrefixField,
    ],
    bindingFields: [
      { key: "repository_visibility", label: "Repository visibility", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "private", value: "private" },
        { label: "internal", value: "internal" },
        { label: "public", value: "public" },
      ]},
      { key: "default_secret_prefix", label: "Default secret prefix", kind: "text", placeholder: "ENVSYNC" },
      secretPrefixField,
    ],
    mappingFields: [
      secretPrefixField,
      { key: "environment_label", label: "Environment label", kind: "text", placeholder: "production" },
    ],
  },
  gitlab: {
    id: "gitlab",
    name: "GitLab",
    description: "Tie this app to GitLab projects or group variables with branch-aware targeting.",
    title: "GitLab project mapping",
    providerHeadline: "Capture GitLab group or project access and the variable conventions this org wants to use.",
    targetLabel: "Project target",
    helper: "Use the app context to choose which GitLab project or group variable path owns each environment type.",
    branchLabel: "Branch or ref",
    targetPlaceholder: "group/project",
    branchPlaceholder: "main",
    pathLabel: "Path prefix",
    pathPlaceholder: "Not used for GitLab",
    usesBranch: true,
    usesPath: false,
    connectionAuthFields: [
      { key: "group_path", label: "Group path", kind: "text", placeholder: "platform/team" },
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "gitlab-token" },
      { key: "account", label: "Account label", kind: "text", placeholder: "prod-gitlab" },
    ],
    connectionMetadataFields: [
      { key: "variable_scope", label: "Default variable scope", kind: "text", placeholder: "*" },
      { key: "secret_name_template", label: "Variable name template", kind: "text", placeholder: "{{app}}_{{env}}_{{key}}" },
      { key: "masked_by_default", label: "Mask variables by default", kind: "select", options: yesNoOptions },
    ],
    bindingFields: [
      { key: "group_path", label: "Group path", kind: "text", placeholder: "platform/team" },
      { key: "variable_scope", label: "Default variable scope", kind: "text", placeholder: "*" },
      secretPrefixField,
    ],
    mappingFields: [
      { key: "variable_scope", label: "Variable scope", kind: "text", placeholder: "production" },
      secretPrefixField,
    ],
  },
  vercel: {
    id: "vercel",
    name: "Vercel",
    description: "Route env types into Vercel projects and deployment environments.",
    title: "Vercel environment mapping",
    providerHeadline: "Store the Vercel token reference and the default team or project identifiers for this org.",
    targetLabel: "Project target",
    helper: "Choose the Vercel project binding for this app, then route env types into the correct Vercel environment.",
    branchLabel: "Vercel environment",
    targetPlaceholder: "project-slug",
    branchPlaceholder: "preview",
    pathLabel: "Path prefix",
    pathPlaceholder: "Not used for Vercel",
    usesBranch: true,
    usesPath: false,
    connectionAuthFields: [
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "vercel-token" },
      { key: "team_id", label: "Team ID", kind: "text", placeholder: "team_123" },
      { key: "project_id", label: "Default project ID", kind: "text", placeholder: "prj_123" },
    ],
    connectionMetadataFields: [
      secretPrefixField,
      { key: "create_preview_alias", label: "Create preview alias", kind: "select", options: yesNoOptions },
      { key: "default_environment", label: "Default environment", kind: "text", placeholder: "preview" },
    ],
    bindingFields: [
      { key: "team_id", label: "Team ID", kind: "text", placeholder: "team_123" },
      { key: "project_id", label: "Default Vercel project ID", kind: "text", placeholder: "prj_123" },
      secretPrefixField,
    ],
    mappingFields: [
      secretPrefixField,
      { key: "create_preview_alias", label: "Create preview alias", kind: "select", options: yesNoOptions },
    ],
  },
  "aws-ssm": {
    id: "aws-ssm",
    name: "AWS SSM",
    description: "Define Parameter Store path strategies and prefixes per environment type.",
    title: "AWS SSM path mapping",
    providerHeadline: "Define the AWS account credentials, region, and Parameter Store path strategy for this connection.",
    targetLabel: "Parameter namespace",
    helper: "Use binding settings for region and key strategy, then map each env type to the correct Parameter Store path prefix.",
    branchLabel: "Branch hint",
    targetPlaceholder: "service/api",
    branchPlaceholder: "Optional release branch hint",
    pathLabel: "Parameter path prefix",
    pathPlaceholder: "/envsync/prod/api",
    usesBranch: true,
    usesPath: true,
    connectionAuthFields: [
      { key: "region", label: "AWS region", kind: "text", placeholder: "ap-south-1" },
      { key: "credential_secret_ref", label: "Credential secret ref", kind: "secret-ref", placeholder: "aws-ssm-credentials" },
      { key: "role_arn", label: "Role ARN", kind: "text", placeholder: "arn:aws:iam::123456789012:role/envsync-sync" },
    ],
    connectionMetadataFields: [
      { key: "kms_key_id", label: "KMS key ID", kind: "text", placeholder: "alias/envsync-ssm" },
      { key: "path_strategy", label: "Path strategy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "hierarchical", value: "hierarchical" },
        { label: "flat", value: "flat" },
        { label: "per-env", value: "per-env" },
      ]},
      { key: "overwrite_existing", label: "Overwrite existing params", kind: "select", options: yesNoOptions },
    ],
    bindingFields: [
      { key: "region", label: "AWS region", kind: "text", placeholder: "ap-south-1" },
      { key: "kms_key_id", label: "KMS key ID", kind: "text", placeholder: "alias/envsync-ssm" },
      { key: "path_strategy", label: "Path strategy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "hierarchical", value: "hierarchical" },
        { label: "flat", value: "flat" },
        { label: "per-env", value: "per-env" },
      ]},
    ],
    mappingFields: [
      { key: "parameter_tier", label: "Parameter tier", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "Standard", value: "Standard" },
        { label: "Advanced", value: "Advanced" },
        { label: "Intelligent-Tiering", value: "Intelligent-Tiering" },
      ]},
      { key: "env_key_prefix", label: "Key prefix", kind: "text", placeholder: "APP_" },
    ],
  },
  "google-secret-manager": {
    id: "google-secret-manager",
    name: "Google Secret Manager",
    description: "Target GCP projects and namespace strategies for secret sync.",
    title: "Google Secret Manager mapping",
    providerHeadline: "Capture the GCP project context and the secret reference that allows writes into Secret Manager.",
    targetLabel: "GCP project or namespace",
    helper: "Choose the Google Secret Manager connection and decide which project or namespace receives each environment type.",
    branchLabel: "Branch hint",
    targetPlaceholder: "my-gcp-project",
    branchPlaceholder: "Optional branch hint",
    pathLabel: "Secret prefix",
    pathPlaceholder: "prod/api",
    usesBranch: true,
    usesPath: true,
    connectionAuthFields: [
      { key: "project_id", label: "Project ID", kind: "text", placeholder: "my-gcp-project" },
      { key: "service_account_secret_ref", label: "Service account secret ref", kind: "secret-ref", placeholder: "gcp-service-account" },
      { key: "workload_identity_provider", label: "Workload identity provider", kind: "text", placeholder: "projects/.../providers/..." },
    ],
    connectionMetadataFields: [
      { key: "replication_policy", label: "Replication policy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "automatic", value: "automatic" },
        { label: "user-managed", value: "user-managed" },
      ]},
      { key: "secret_name_template", label: "Secret name template", kind: "text", placeholder: "{{app}}-{{env}}-{{key}}" },
      { key: "labels_csv", label: "Default labels", kind: "text", placeholder: "team=platform,source=envsync" },
    ],
    bindingFields: [
      { key: "project_id", label: "Default project ID", kind: "text", placeholder: "my-gcp-project" },
      { key: "replication_policy", label: "Replication policy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "automatic", value: "automatic" },
        { label: "user-managed", value: "user-managed" },
      ]},
      secretPrefixField,
    ],
    mappingFields: [
      secretPrefixField,
      { key: "labels_csv", label: "Labels", kind: "text", placeholder: "team=platform,source=envsync" },
    ],
  },
};

export function emptyFieldValues(fields: ProviderFieldConfig[]) {
  return Object.fromEntries(fields.map((field) => [field.key, ""])) as Record<string, string>;
}

export function extractKnownFieldValues(
  source: Record<string, unknown> | undefined,
  fields: ProviderFieldConfig[],
) {
  return Object.fromEntries(
    fields.map((field) => [field.key, typeof source?.[field.key] === "string" ? String(source[field.key]) : ""]),
  ) as Record<string, string>;
}

export function omitKnownFields(
  source: Record<string, unknown> | undefined,
  fields: ProviderFieldConfig[],
) {
  const clone = { ...(source ?? {}) };
  for (const field of fields) {
    delete clone[field.key];
  }
  return clone;
}

export function mergeFieldValuesIntoRecord(
  fields: ProviderFieldConfig[],
  values: Record<string, string>,
  base: Record<string, unknown> = {},
) {
  const next: Record<string, unknown> = { ...base };
  for (const field of fields) {
    const value = values[field.key]?.trim() ?? "";
    if (value) {
      next[field.key] = value;
    } else {
      delete next[field.key];
    }
  }
  return next;
}
