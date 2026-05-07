import type {
  EnvTypeMapping,
  IntegrationBinding,
  OrgSecret,
  ProviderConnection,
  SyncAuditEvent,
  SyncRun,
} from "@envsync-cloud/envsync-management-ts-sdk";

export type EnterpriseProvider =
  | "github"
  | "gitlab"
  | "aws-ssm"
  | "vercel"
  | "google-secret-manager";

export type {
  EnvTypeMapping,
  IntegrationBinding,
  OrgSecret,
  ProviderConnection,
  SyncAuditEvent,
  SyncRun,
};
