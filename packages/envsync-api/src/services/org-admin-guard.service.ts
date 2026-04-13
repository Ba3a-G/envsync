import { DB } from "@/libs/db";
import { BusinessRuleError } from "@/libs/errors";

export class OrgAdminGuardService {
	private static async computeRemainingAdminCount(
		org_id: string,
		options?: { exclude_user_id?: string; exclude_team_membership?: { team_id: string; user_id: string } },
	) {
		const db = await DB.getInstance();
		const [users, teamMemberships] = await Promise.all([
			db
				.selectFrom("users")
				.innerJoin("org_role as direct_role", "direct_role.id", "users.role_id")
				.select([
					"users.id as user_id",
					"direct_role.is_admin as direct_is_admin",
					"direct_role.is_master as direct_is_master",
				])
				.where("users.org_id", "=", org_id)
				.execute(),
			db
				.selectFrom("team_members")
				.innerJoin("teams", "teams.id", "team_members.team_id")
				.leftJoin("org_role as team_role", "team_role.id", "teams.role_id")
				.select([
					"team_members.user_id",
					"team_members.team_id",
					"team_role.is_admin as team_is_admin",
					"team_role.is_master as team_is_master",
				])
				.where("teams.org_id", "=", org_id)
				.execute(),
		]);

		const adminCapableUsers = new Map<string, boolean>();
		for (const user of users) {
			if (options?.exclude_user_id === user.user_id) {
				continue;
			}
			adminCapableUsers.set(user.user_id, Boolean(user.direct_is_admin || user.direct_is_master));
		}

		for (const membership of teamMemberships) {
			if (options?.exclude_user_id === membership.user_id) {
				continue;
			}
			if (
				options?.exclude_team_membership
				&& options.exclude_team_membership.team_id === membership.team_id
				&& options.exclude_team_membership.user_id === membership.user_id
			) {
				continue;
			}
			if (membership.team_is_admin || membership.team_is_master) {
				adminCapableUsers.set(membership.user_id, true);
			}
		}

		return Array.from(adminCapableUsers.values()).filter(Boolean).length;
	}

	public static async ensureOrgHasAdminAfterUserDeletion(org_id: string, user_id: string) {
		const remainingAdmins = await this.computeRemainingAdminCount(org_id, {
			exclude_user_id: user_id,
		});
		if (remainingAdmins === 0) {
			throw new BusinessRuleError(
				"At least one org admin must remain in the organization.",
				409,
				"LAST_ORG_ADMIN_REQUIRED",
			);
		}
	}

	public static async ensureOrgHasAdminAfterTeamMemberRemoval(
		org_id: string,
		team_id: string,
		user_id: string,
	) {
		const remainingAdmins = await this.computeRemainingAdminCount(org_id, {
			exclude_team_membership: { team_id, user_id },
		});
		if (remainingAdmins === 0) {
			throw new BusinessRuleError(
				"At least one org admin must remain in the organization.",
				409,
				"LAST_ORG_ADMIN_REQUIRED",
			);
		}
	}
}
