import { ApiError, CreateProviderConnectionRequest, EnvSyncManagementAPISDK, type LicenseActionResponse, type OrgSecret, type ProviderConnection, type SyncAuditEvent, type SyncRun, type SystemStatusResponse } from "@envsync-cloud/envsync-management-ts-sdk";

import { runtimeConfig } from "@/runtime-config";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

function isUnsafeMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function managementErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return String((error.body as { error?: string } | null)?.error || error.message || error.statusText || "Management request failed");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Management request failed";
}

function getManagementSDK() {
  const resolveHeaders = async (options: { method: string }) => {
    if (!isUnsafeMethod(options.method)) return {};
    const csrfToken = readCookie("envsync_csrf");
    return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  };

  return new EnvSyncManagementAPISDK({
    BASE: runtimeConfig.managementApiUrl,
    WITH_CREDENTIALS: true,
    CREDENTIALS: "include",
    HEADERS: resolveHeaders,
  });
}

export async function getManagementSystemStatus(): Promise<SystemStatusResponse> {
  try {
    return await getManagementSDK().system.getManagementSystemStatus();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function listEnterpriseProviderConnections(): Promise<ProviderConnection[]> {
  try {
    return await getManagementSDK().enterprise.listEnterpriseProviderConnections();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function createEnterpriseProviderConnection(payload: {
  provider_type: "github" | "gitlab" | "aws-ssm" | "vercel" | "google-secret-manager";
  name: string;
  status: "active" | "inactive" | "error";
  auth_config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<ProviderConnection> {
  try {
    return await getManagementSDK().enterprise.createEnterpriseProviderConnection({
      provider_type: payload.provider_type as CreateProviderConnectionRequest.provider_type,
      name: payload.name,
      status: payload.status as CreateProviderConnectionRequest.status,
      auth_config: payload.auth_config,
      metadata: payload.metadata,
    });
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function listEnterpriseOrgSecrets(): Promise<OrgSecret[]> {
  try {
    return await getManagementSDK().enterprise.listEnterpriseOrgSecrets();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function createEnterpriseOrgSecret(payload: {
  key: string;
  value: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<OrgSecret> {
  try {
    return await getManagementSDK().enterprise.createEnterpriseOrgSecret(payload);
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function listEnterpriseSyncRuns(): Promise<SyncRun[]> {
  try {
    return await getManagementSDK().enterprise.listEnterpriseSyncRuns();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function listEnterpriseSyncAuditEvents(syncRunId: string): Promise<SyncAuditEvent[]> {
  try {
    return await getManagementSDK().enterprise.listEnterpriseSyncAuditEvents(syncRunId);
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function createEnterpriseManualSyncRun(payload: {
  app_id?: string | null;
  provider_type: SyncRun["provider_type"];
  metadata?: Record<string, unknown>;
}): Promise<SyncRun> {
  try {
    return await getManagementSDK().enterprise.createEnterpriseManualSyncRun(payload);
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function activateLicense(): Promise<LicenseActionResponse> {
  try {
    return await getManagementSDK().license.activateManagementLicense();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export async function verifyLicense(): Promise<LicenseActionResponse> {
  try {
    return await getManagementSDK().license.verifyManagementLicense();
  } catch (error) {
    throw new Error(managementErrorMessage(error));
  }
}

export type {
  OrgSecret,
  ProviderConnection,
  SyncAuditEvent,
  SyncRun,
  SystemStatusResponse,
};
