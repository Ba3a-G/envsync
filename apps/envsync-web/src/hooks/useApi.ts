import { API_KEYS } from "@/constants";
import { useQueryClient } from "@tanstack/react-query";

/**
 *
 * Custom hook to invalidate API keys.
 */
export const useInvalidateQueries = () => {
  const queryClient = useQueryClient();

  return {
    invalidateApiKeys: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_API_KEYS] }),
    invalidateRoles: () =>
      queryClient.invalidateQueries({
        queryKey: [API_KEYS.ALL_ROLES],
      }),
    invalidateUsers: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_USERS] }),
        queryClient.invalidateQueries({ queryKey: [API_KEYS.USERS_PAGE] }),
      ]),
    invalidateApplications: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_APPLICATIONS] }),
    invalidateEnvironments: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_ENVIRONMENTS] }),
    invalidateEnvironmentVariables: () =>
      queryClient.invalidateQueries({
        queryKey: [API_KEYS.ALL_ENVIRONMENT_VARIABLES],
      }),
    invalidateWebhooks: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_WEBHOOKS] }),
    invalidateGpgKeys: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_GPG_KEYS] }),
    invalidateCertificates: () =>
      queryClient.invalidateQueries({ queryKey: [API_KEYS.ALL_CERTIFICATES] }),
  };
};
