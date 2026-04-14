import { useMutation, useQuery } from "@tanstack/react-query";

import { API_KEYS } from "@/constants";
import { useInvalidateQueries } from "@/hooks/useApi";

import { apiRequest, type MutationOptions } from "./base";

export interface GrantEntry {
  subject_id: string;
  subject_type: "user" | "team";
  relation: "admin" | "editor" | "viewer";
}

export interface EffectiveAccessEntry {
  user_id: string;
  email: string;
  relation: "admin" | "editor" | "viewer" | null;
  org_relation: "admin" | "editor" | "viewer" | null;
  direct_relation: "admin" | "editor" | "viewer" | null;
  team_relation: "admin" | "editor" | "viewer" | null;
  sources: Array<"org" | "direct" | "team">;
  teams: string[];
}

export interface EffectivePermissions {
  can_view: boolean;
  can_edit: boolean;
  have_api_access: boolean;
  have_billing_options: boolean;
  have_webhook_access: boolean;
  is_admin: boolean;
  is_master: boolean;
  can_manage_roles: boolean;
  can_manage_users: boolean;
  can_manage_apps: boolean;
  can_manage_api_keys: boolean;
  can_manage_webhooks: boolean;
  can_view_audit_logs: boolean;
  can_manage_org_settings: boolean;
  can_manage_invites: boolean;
}

const useAppGrants = (appId?: string, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: [API_KEYS.APP_GRANTS, appId],
    queryFn: () => apiRequest<GrantEntry[]>(`/api/permission/app/${appId}/grants`),
    enabled: enabled && Boolean(appId),
  });

const useAppEffectiveAccess = (appId?: string, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: [API_KEYS.APP_EFFECTIVE_ACCESS, appId],
    queryFn: () => apiRequest<EffectiveAccessEntry[]>(`/api/permission/app/${appId}/effective-access`),
    enabled: enabled && Boolean(appId),
  });

const useMyPermissions = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: [API_KEYS.APP_EFFECTIVE_ACCESS, "me"],
    queryFn: () => apiRequest<EffectivePermissions>("/api/permission/me"),
    enabled,
  });

const useGrantAppAccess = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { appId: string; payload: GrantEntry }> = {}) => {
  const { invalidateApplications, invalidatePermissions } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ appId, payload }: { appId: string; payload: GrantEntry }) =>
      apiRequest(`/api/permission/app/${appId}/grant`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateApplications(), invalidatePermissions(variables.appId)]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useRevokeAppAccess = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { appId: string; payload: GrantEntry }> = {}) => {
  const { invalidateApplications, invalidatePermissions } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ appId, payload }: { appId: string; payload: GrantEntry }) =>
      apiRequest(`/api/permission/app/${appId}/revoke`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateApplications(), invalidatePermissions(variables.appId)]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

export const permissions = {
  getMyPermissions: useMyPermissions,
  getAppGrants: useAppGrants,
  getAppEffectiveAccess: useAppEffectiveAccess,
  grantAppAccess: useGrantAppAccess,
  revokeAppAccess: useRevokeAppAccess,
};
