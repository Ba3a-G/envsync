import { useMutation, useQuery } from "@tanstack/react-query";

import { API_KEYS } from "@/constants";
import { useInvalidateQueries } from "@/hooks/useApi";

import { apiRequest, type MutationOptions } from "./base";

export interface TeamMember {
  id: string;
  user_id: string;
  created_at: string;
  full_name: string | null;
  email: string;
  profile_picture_url: string | null;
}

export interface Team {
  id: string;
  name: string;
  org_id: string;
  description: string | null;
  color: string;
  role_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
}

const useTeams = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: [API_KEYS.ALL_TEAMS],
    queryFn: () => apiRequest<Team[]>("/api/team"),
    enabled,
  });

const useTeam = (id?: string, { enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: [API_KEYS.ALL_TEAMS, id],
    queryFn: () => apiRequest<TeamDetail>(`/api/team/${id}`),
    enabled: enabled && Boolean(id),
  });

const useCreateTeam = ({
  onSuccess,
  onError,
}: MutationOptions<Team, { name: string; description?: string; color?: string }> = {}) => {
  const { invalidateTeams } = useInvalidateQueries();

  return useMutation({
    mutationFn: (payload: { name: string; description?: string; color?: string }) =>
      apiRequest<Team>("/api/team", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables) => {
      invalidateTeams();
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useUpdateTeam = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { id: string; payload: Partial<Pick<Team, "name" | "description" | "color">> }> = {}) => {
  const { invalidateTeams } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Pick<Team, "name" | "description" | "color">> }) =>
      apiRequest(`/api/team/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data, variables) => {
      invalidateTeams();
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useDeleteTeam = ({ onSuccess, onError }: MutationOptions<unknown, string> = {}) => {
  const { invalidateTeams } = useInvalidateQueries();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/team/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (data, variables) => {
      invalidateTeams();
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useAddTeamMember = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { teamId: string; user_id: string }> = {}) => {
  const { invalidateTeams, invalidateUsers } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ teamId, user_id }: { teamId: string; user_id: string }) =>
      apiRequest(`/api/team/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id }),
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateTeams(), invalidateUsers()]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useRemoveTeamMember = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { teamId: string; userId: string }> = {}) => {
  const { invalidateTeams, invalidateUsers } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      apiRequest(`/api/team/${teamId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateTeams(), invalidateUsers()]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useAssignTeamRole = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { teamId: string; role_id: string }> = {}) => {
  const { invalidateTeams, invalidateRoles } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ teamId, role_id }: { teamId: string; role_id: string }) =>
      apiRequest(`/api/team/${teamId}/assign-role`, {
        method: "POST",
        body: JSON.stringify({ role_id }),
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateTeams(), invalidateRoles()]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

const useUnassignTeamRole = ({
  onSuccess,
  onError,
}: MutationOptions<unknown, { teamId: string }> = {}) => {
  const { invalidateTeams, invalidateRoles } = useInvalidateQueries();

  return useMutation({
    mutationFn: ({ teamId }: { teamId: string }) =>
      apiRequest(`/api/team/${teamId}/unassign-role`, {
        method: "POST",
      }),
    onSuccess: async (data, variables) => {
      await Promise.all([invalidateTeams(), invalidateRoles()]);
      onSuccess?.({ data, variables });
    },
    onError: (error, variables) => onError?.({ error: error as Error, variables }),
  });
};

export const teams = {
  getTeams: useTeams,
  getTeam: useTeam,
  createTeam: useCreateTeam,
  updateTeam: useUpdateTeam,
  deleteTeam: useDeleteTeam,
  addMember: useAddTeamMember,
  removeMember: useRemoveTeamMember,
  assignRole: useAssignTeamRole,
  unassignRole: useUnassignTeamRole,
};
