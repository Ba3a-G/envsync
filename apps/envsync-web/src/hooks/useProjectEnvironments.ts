import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { ApiError } from "@envsync-cloud/envsync-ts-sdk";
import {
  EnvVarFormData,
  BulkEnvVarData,
  EnvironmentVariable,
  EnvironmentType,
  Project,
} from "@/constants";

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError &&
    String(error.body?.code || "").toUpperCase() === "PROTECTED_ENV_REQUIRES_CHANGE_REQUEST"
  ) {
    return "This environment is protected. Create a change request from the project or Change Requests page.";
  }
  if (error instanceof ApiError && error.body?.error) {
    return error.body.error;
  }
  return fallback;
}

export const useProjectEnvironments = (appId?: string) => {
  const { api } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: projectData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["project-environments", appId],
    queryFn: async () => {
      const projectResponse = await api.applications.getApp(appId);
      const usersList = await api.users.getUsers();

      const envVarsResponse = await Promise.all(
        projectResponse.env_types.map(async (envType) => {
          const envVars = await api.environmentVariables.getEnvs({
            app_id: appId,
            env_type_id: envType.id,
          });


          return envVars;
        })
      ).then((vars) => vars.flat());

      const secretsResponse = await Promise.all(
        projectResponse.env_types.map(async (envType) => {
          const envVars = await api.secrets.getSecrets({
            app_id: appId,
            env_type_id: envType.id,
          });


          return envVars;
        })
      ).then((vars) => vars.flat());

      const environmentTypes: EnvironmentType[] = projectResponse.env_types.map(
        (envType) => ({
          id: envType.id,
          name: envType.name,
          color: envType.color || "#6366f1",
          is_default: envType.is_default,
          is_protected: envType.is_protected,
        })
      );

      // Transform environment variables
      const environmentVariables: EnvironmentVariable[] = envVarsResponse.map(
        (envVar) => ({
          id: envVar.id,
          key: envVar.key,
          value: envVar.value,
          sensitive: false,
          app_id: envVar.app_id,
          env_type_id: envVar.env_type_id,
          created_at: new Date(envVar.created_at),
          updated_at: new Date(envVar.updated_at),
        })
      );

      // Transform secrets
      const secrets: EnvironmentVariable[] = secretsResponse.map((secret) => ({
        id: secret.id,
        key: secret.key,
        value: secret.value,
        sensitive: true,
        app_id: secret.app_id,
        env_type_id: secret.env_type_id,
        created_at: new Date(secret.created_at),
        updated_at: new Date(secret.updated_at),
      }));

      const project: Project = {
        id: projectResponse.id,
        name: projectResponse.name,
        description: projectResponse.description,
        created_at: new Date(projectResponse.created_at),
        updated_at: new Date(projectResponse.updated_at),
      };

      return {
        project,
        environmentTypes,
        environmentVariables,
        secrets,
        enableSecrets: projectResponse.enable_secrets ?? false,
      };
    },
    staleTime: 30 * 1000, // 30 seconds
    retry: 3,
  });

  // Create environment variable
  const createVariable = useMutation({
    mutationFn: async (data: EnvVarFormData) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.environmentVariables.createEnv({
        key: data.key,
        value: data.value,
        env_type_id: data.env_type_id,
        app_id: appId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Variable created successfully");
    },
    onError: (error) => {
      console.error("Failed to create variable:", error);
      toast.error(getApiErrorMessage(error, "Failed to create variable"));
    },
  });

  // Update environment variable
  const updateVariable = useMutation({
    mutationFn: async ({
      data,
      originalKey,
    }: {
      data: Partial<EnvVarFormData>;
      originalKey: string;
    }) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.environmentVariables.updateEnv(originalKey, {
        value: data.value!,
        env_type_id: data.env_type_id!,
        app_id: appId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Variable updated successfully");
    },
    onError: (error) => {
      console.error("Failed to update variable:", error);
      toast.error(getApiErrorMessage(error, "Failed to update variable"));
    },
  });

  // Delete environment variable
  const deleteVariable = useMutation({
    mutationFn: async ({
      env_type_id,
      appId,
      key,
    }: {
      env_type_id: string;
      appId: string;
      key: string;
    }) => {
      return await api.environmentVariables.deleteEnv({
        app_id: appId,
        env_type_id: env_type_id,
        key,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Variable deleted successfully");
    },
    onError: (error) => {
      console.error("Failed to delete variable:", error);
      toast.error(getApiErrorMessage(error, "Failed to delete variable"));
    },
  });

  // Bulk import environment variables
  const bulkImportVariables = useMutation({
    mutationFn: async (data: BulkEnvVarData) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.environmentVariables.batchCreateEnvs({
        app_id: appId,
        env_type_id: data.env_type_id,
        envs: data.variables.map((variable) => ({
          key: variable.key,
          value: variable.value,
        })),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success(
        `Successfully imported ${variables.variables.length} variables`
      );
    },
    onError: (error) => {
      console.error("Failed to import variables:", error);
      toast.error(getApiErrorMessage(error, "Failed to import variables"));
    },
  });

  // Create secret
  const createSecret = useMutation({
    mutationFn: async (data: EnvVarFormData) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.secrets.createSecret({
        key: data.key,
        value: data.value,
        env_type_id: data.env_type_id,
        app_id: appId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Secret created successfully");
    },
    onError: (error) => {
      console.error("Failed to create secret:", error);
      toast.error(getApiErrorMessage(error, "Failed to create secret"));
    },
  });

  // Update secret
  const updateSecret = useMutation({
    mutationFn: async ({
      data,
      originalKey,
    }: {
      data: Partial<EnvVarFormData>;
      originalKey: string;
    }) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.secrets.updateSecret(originalKey, {
        value: data.value!,
        env_type_id: data.env_type_id!,
        app_id: appId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Secret updated successfully");
    },
    onError: (error) => {
      console.error("Failed to update secret:", error);
      toast.error(getApiErrorMessage(error, "Failed to update secret"));
    },
  });

  // Delete secret
  const deleteSecret = useMutation({
    mutationFn: async ({
      env_type_id,
      appId,
      key,
    }: {
      env_type_id: string;
      appId: string;
      key: string;
    }) => {
      return await api.secrets.deleteSecret({
        app_id: appId,
        env_type_id: env_type_id,
        key,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success("Secret deleted successfully");
    },
    onError: (error) => {
      console.error("Failed to delete secret:", error);
      toast.error(getApiErrorMessage(error, "Failed to delete secret"));
    },
  });

  // Bulk import secrets
  const bulkImportSecrets = useMutation({
    mutationFn: async (data: BulkEnvVarData) => {
      if (!appId) throw new Error("Project ID not found");
      return await api.secrets.batchCreateSecrets({
        app_id: appId,
        env_type_id: data.env_type_id,
        envs: data.variables.map((variable) => ({
          key: variable.key,
          value: variable.value,
        })),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project-environments", appId],
      });
      toast.success(
        `Successfully imported ${variables.variables.length} secrets`
      );
    },
    onError: (error) => {
      console.error("Failed to import secrets:", error);
      toast.error(getApiErrorMessage(error, "Failed to import secrets"));
    },
  });

  return {
    // Data
    project: projectData?.project,
    environmentTypes: projectData?.environmentTypes || [],
    environmentVariables: projectData?.environmentVariables || [],
    secrets: projectData?.secrets || [],
    enableSecrets: projectData?.enableSecrets ?? false,
    isLoading,
    error,

    // Mutations
    createVariable,
    updateVariable,
    deleteVariable,
    bulkImportVariables,
    createSecret,
    updateSecret,
    deleteSecret,
    bulkImportSecrets,

    // Utility functions
    refetch,
  };
};
