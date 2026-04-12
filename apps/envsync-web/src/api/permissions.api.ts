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
  source: "direct" | "team" | "both" | null;
  teams: string[];
}

const useAppGrants = (appId?: string) =>
  useQuery({
    queryKey: [API_KEYS.APP_GRANTS, appId],
    queryFn: () => apiRequest<GrantEntry[]>(`/api/permission/app/${appId}/grants`),
    enabled: Boolean(appId),
  });

const useAppEffectiveAccess = (appId?: string) =>
  useQuery({
    queryKey: [API_KEYS.APP_EFFECTIVE_ACCESS, appId],
    queryFn: () => apiRequest<EffectiveAccessEntry[]>(`/api/permission/app/${appId}/effective-access`),
    enabled: Boolean(appId),
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
  getAppGrants: useAppGrants,
  getAppEffectiveAccess: useAppEffectiveAccess,
  grantAppAccess: useGrantAppAccess,
  revokeAppAccess: useRevokeAppAccess,
};
