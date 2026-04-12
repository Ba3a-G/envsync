import { useMemo } from "react";
import { api } from "@/api";
import { Role } from "@/api/roles.api";
import { UserResponse } from "@envsync-cloud/envsync-ts-sdk";

export type RoleData = Role & {
  users: UserResponse[];
  teamCount: number;
};

export const useRolesTable = () => {
  const { data: rolesData, isLoading: rolesLoading } = api.roles.getAllRoles();
  const { data: usersData, isLoading: usersLoading } = api.users.getAllUsers();
  const { data: teamsData, isLoading: teamsLoading } = api.teams.getTeams();

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
