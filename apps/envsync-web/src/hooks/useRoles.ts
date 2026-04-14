import { useMemo } from "react";
import { api } from "@/api";
import { useAuthContext } from "@/contexts/auth";
import { Role } from "@/api/roles.api";
import { UserResponse } from "@envsync-cloud/envsync-ts-sdk";

export type RoleData = Role & {
  users: UserResponse[];
  teamCount: number;
};

export const useRolesTable = () => {
  const { isLoading: isAuthLoading, isAuthenticated } = useAuthContext();
  const authEnabled = !isAuthLoading && isAuthenticated;
  const { data: rolesData, isLoading: rolesLoading } = api.roles.getAllRoles({ enabled: authEnabled });
  const { data: usersData, isLoading: usersLoading } = api.users.getAllUsers({ enabled: authEnabled });
  const { data: teamsData, isLoading: teamsLoading } = api.teams.getTeams({ enabled: authEnabled });

  const isLoading = rolesLoading || usersLoading || teamsLoading;

  const data = useMemo(() => {
    if (!Array.isArray(rolesData) || !Array.isArray(usersData) || !Array.isArray(teamsData)) return [];
    return rolesData.map((role) => ({
      ...role,
      users: usersData.filter((user) => user.role_id === role.id),
      teamCount: teamsData.filter((team) => team.role_id === role.id).length,
    }));
  }, [rolesData, teamsData, usersData]);

  return { data, isLoading };
};
