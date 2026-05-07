export type ProviderType = "github" | "gitlab" | "aws-ssm" | "vercel" | "google-secret-manager";

export interface ProviderFieldOption {
  label: string;
  value: string;
}

export interface ProviderFieldConfig {
  key: string;
  label: string;
  kind: "text" | "select" | "secret-ref";
  placeholder?: string;
  helper?: string;
  options?: ProviderFieldOption[];
}

export interface ManagementProviderConfig {
  headline: string;
  authFields: ProviderFieldConfig[];
  metadataFields: ProviderFieldConfig[];
}

const yesNoOptions: ProviderFieldOption[] = [
  { label: "Not set", value: "" },
  { label: "yes", value: "yes" },
  { label: "no", value: "no" },
];

export const managementProviderConfigs: Record<ProviderType, ManagementProviderConfig> = {
  github: {
    headline: "Register the GitHub account context and how EnvSync should name repository secrets by default.",
    authFields: [
      { key: "owner", label: "Owner or org", kind: "text", placeholder: "envsync-cloud" },
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "github-token" },
      { key: "installation_id", label: "Installation ID", kind: "text", placeholder: "123456" },
      { key: "app_id", label: "GitHub App ID", kind: "text", placeholder: "98765" },
    ],
    metadataFields: [
      { key: "repository_visibility", label: "Repository visibility", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "private", value: "private" },
        { label: "internal", value: "internal" },
        { label: "public", value: "public" },
      ]},
      { key: "default_secret_prefix", label: "Default secret prefix", kind: "text", placeholder: "ENVSYNC" },
      { key: "secret_name_template", label: "Secret name template", kind: "text", placeholder: "{{app}}_{{env}}_{{key}}" },
    ],
  },
  gitlab: {
    headline: "Capture GitLab group or project access and the variable conventions this org wants to use.",
    authFields: [
      { key: "group_path", label: "Group path", kind: "text", placeholder: "platform/team" },
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "gitlab-token" },
      { key: "account", label: "Account label", kind: "text", placeholder: "prod-gitlab" },
    ],
    metadataFields: [
      { key: "variable_scope", label: "Default variable scope", kind: "text", placeholder: "*" },
      { key: "secret_name_template", label: "Variable name template", kind: "text", placeholder: "{{app}}_{{env}}_{{key}}" },
      { key: "masked_by_default", label: "Mask variables by default", kind: "select", options: yesNoOptions },
    ],
  },
  "aws-ssm": {
    headline: "Define the AWS account credentials, region, and Parameter Store path strategy for this connection.",
    authFields: [
      { key: "region", label: "AWS region", kind: "text", placeholder: "ap-south-1" },
      { key: "credential_secret_ref", label: "Credential secret ref", kind: "secret-ref", placeholder: "aws-ssm-credentials" },
      { key: "role_arn", label: "Role ARN", kind: "text", placeholder: "arn:aws:iam::123456789012:role/envsync-sync" },
    ],
    metadataFields: [
      { key: "kms_key_id", label: "KMS key ID", kind: "text", placeholder: "alias/envsync-ssm" },
      { key: "path_strategy", label: "Path strategy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "hierarchical", value: "hierarchical" },
        { label: "flat", value: "flat" },
        { label: "per-env", value: "per-env" },
      ]},
      { key: "overwrite_existing", label: "Overwrite existing params", kind: "select", options: yesNoOptions },
    ],
  },
  vercel: {
    headline: "Store the Vercel token reference and the default team or project identifiers for this org.",
    authFields: [
      { key: "token_secret_ref", label: "Token secret ref", kind: "secret-ref", placeholder: "vercel-token" },
      { key: "team_id", label: "Team ID", kind: "text", placeholder: "team_123" },
      { key: "project_id", label: "Default project ID", kind: "text", placeholder: "prj_123" },
    ],
    metadataFields: [
      { key: "secret_name_template", label: "Variable name template", kind: "text", placeholder: "{{app}}_{{env}}_{{key}}" },
      { key: "create_preview_alias", label: "Create preview alias", kind: "select", options: yesNoOptions },
      { key: "default_environment", label: "Default environment", kind: "text", placeholder: "preview" },
    ],
  },
  "google-secret-manager": {
    headline: "Capture the GCP project context and the secret reference that allows writes into Secret Manager.",
    authFields: [
      { key: "project_id", label: "Project ID", kind: "text", placeholder: "my-gcp-project" },
      { key: "service_account_secret_ref", label: "Service account secret ref", kind: "secret-ref", placeholder: "gcp-service-account" },
      { key: "workload_identity_provider", label: "Workload identity provider", kind: "text", placeholder: "projects/.../providers/..." },
    ],
    metadataFields: [
      { key: "replication_policy", label: "Replication policy", kind: "select", options: [
        { label: "Not set", value: "" },
        { label: "automatic", value: "automatic" },
        { label: "user-managed", value: "user-managed" },
      ]},
      { key: "secret_name_template", label: "Secret name template", kind: "text", placeholder: "{{app}}-{{env}}-{{key}}" },
      { key: "labels_csv", label: "Default labels", kind: "text", placeholder: "team=platform,source=envsync" },
    ],
  },
};

export function emptyFieldValues(fields: ProviderFieldConfig[]) {
  return Object.fromEntries(fields.map((field) => [field.key, ""])) as Record<string, string>;
}

export function mergeFieldValues(
  fields: ProviderFieldConfig[],
  values: Record<string, string>,
  base: Record<string, unknown>,
) {
  const next = { ...base };
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
