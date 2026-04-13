import { type Context } from "hono";

import { AuthorizationService } from "@/services/authorization.service";
import { AppService } from "@/services/app.service";
import { EnvTypeService } from "@/services/env_type.service";
import { AuditLogService } from "@/services/audit_log.service";
import { DB } from "@/libs/db";

export class PermissionController {
	private static resolveOrgRelation(permissions: Awaited<ReturnType<typeof AuthorizationService.getUserOrgPermissions>>) {
		if (permissions.is_master || permissions.is_admin || permissions.can_manage_apps) return "admin" as const;
		if (permissions.can_edit) return "editor" as const;
		if (permissions.can_view) return "viewer" as const;
		return null;
	}

	public static readonly grantAppAccess = async (c: Context) => {
		const org_id = c.get("org_id");
		const app_id = c.req.param("app_id");
		const { subject_id, subject_type, relation } = await c.req.json();

		if (!subject_id || !subject_type || !relation) {
			return c.json({ error: "subject_id, subject_type, and relation are required." }, 400);
		}

		const app = await AppService.getApp({ id: app_id });
		if (app.org_id !== org_id) {
			return c.json({ error: "App does not belong to your organization." }, 403);
		}

		await AuthorizationService.grantAppAccess(subject_id, subject_type, app_id, relation);

		await AuditLogService.notifyAuditSystem({
			action: "app_access_granted",
			org_id,
			user_id: c.get("user_id"),
			message: `Granted ${relation} access on app ${app.name} to ${subject_type}:${subject_id}.`,
			details: { app_id, subject_id, subject_type, relation },
		});

		return c.json({ message: "Access granted successfully." });
	};

	public static readonly revokeAppAccess = async (c: Context) => {
		const org_id = c.get("org_id");
		const app_id = c.req.param("app_id");
		const { subject_id, subject_type, relation } = await c.req.json();

		if (!subject_id || !subject_type || !relation) {
			return c.json({ error: "subject_id, subject_type, and relation are required." }, 400);
		}

		const app = await AppService.getApp({ id: app_id });
		if (app.org_id !== org_id) {
			return c.json({ error: "App does not belong to your organization." }, 403);
		}

		await AuthorizationService.revokeAppAccess(subject_id, subject_type, app_id, relation);

		await AuditLogService.notifyAuditSystem({
			action: "app_access_revoked",
			org_id,
			user_id: c.get("user_id"),
			message: `Revoked ${relation} access on app ${app.name} from ${subject_type}:${subject_id}.`,
			details: { app_id, subject_id, subject_type, relation },
		});

		return c.json({ message: "Access revoked successfully." });
	};

	public static readonly grantEnvTypeAccess = async (c: Context) => {
		const org_id = c.get("org_id");
		const env_type_id = c.req.param("id");
		const { subject_id, subject_type, relation } = await c.req.json();

		if (!subject_id || !subject_type || !relation) {
			return c.json({ error: "subject_id, subject_type, and relation are required." }, 400);
		}

		const envType = await EnvTypeService.getEnvType(env_type_id);
		if (envType.org_id !== org_id) {
			return c.json({ error: "Environment type does not belong to your organization." }, 403);
		}

		await AuthorizationService.grantEnvTypeAccess(subject_id, subject_type, env_type_id, relation);

		await AuditLogService.notifyAuditSystem({
			action: "permission_granted",
			org_id,
			user_id: c.get("user_id"),
			message: `Granted ${relation} access on env_type ${envType.name} to ${subject_type}:${subject_id}.`,
			details: { env_type_id, subject_id, subject_type, relation },
		});

		return c.json({ message: "Access granted successfully." });
	};

	public static readonly revokeEnvTypeAccess = async (c: Context) => {
		const org_id = c.get("org_id");
		const env_type_id = c.req.param("id");
		const { subject_id, subject_type, relation } = await c.req.json();

		if (!subject_id || !subject_type || !relation) {
			return c.json({ error: "subject_id, subject_type, and relation are required." }, 400);
		}

		const envType = await EnvTypeService.getEnvType(env_type_id);
		if (envType.org_id !== org_id) {
			return c.json({ error: "Environment type does not belong to your organization." }, 403);
		}

		await AuthorizationService.revokeEnvTypeAccess(subject_id, subject_type, env_type_id, relation);

		await AuditLogService.notifyAuditSystem({
			action: "permission_revoked",
			org_id,
			user_id: c.get("user_id"),
			message: `Revoked ${relation} access on env_type ${envType.name} from ${subject_type}:${subject_id}.`,
			details: { env_type_id, subject_id, subject_type, relation },
		});

		return c.json({ message: "Access revoked successfully." });
	};

	public static readonly getMyPermissions = async (c: Context) => {
		const user_id = c.get("user_id");
		const org_id = c.get("org_id");

		const permissions = await AuthorizationService.getUserOrgPermissions(user_id, org_id);

		return c.json(permissions);
	};

	public static readonly listAppGrants = async (c: Context) => {
		const org_id = c.get("org_id");
		const app_id = c.req.param("app_id");
		const app = await AppService.getApp({ id: app_id });
		if (app.org_id !== org_id) {
			return c.json({ error: "App does not belong to your organization." }, 403);
		}
		const grants = await AuthorizationService.listResourceGrants("app", app_id);
		return c.json(grants, 200);
	};

	public static readonly listEnvTypeGrants = async (c: Context) => {
		const org_id = c.get("org_id");
		const env_type_id = c.req.param("id");
		const envType = await EnvTypeService.getEnvType(env_type_id);
		if (envType.org_id !== org_id) {
			return c.json({ error: "Environment type does not belong to your organization." }, 403);
		}
		const grants = await AuthorizationService.listResourceGrants("env_type", env_type_id);
		return c.json(grants, 200);
	};

	public static readonly effectiveAppAccess = async (c: Context) => {
		const org_id = c.get("org_id");
		const app_id = c.req.param("app_id");
		const app = await AppService.getApp({ id: app_id });
		if (app.org_id !== org_id) {
			return c.json({ error: "App does not belong to your organization." }, 403);
		}

		const db = await DB.getInstance();
		const [users, grants, teamMemberships] = await Promise.all([
			db.selectFrom("users").select(["id", "email"]).where("org_id", "=", org_id).execute(),
			AuthorizationService.listResourceGrants("app", app_id),
			db
				.selectFrom("team_members")
				.innerJoin("teams", "teams.id", "team_members.team_id")
				.select(["team_members.user_id", "team_members.team_id", "teams.name as team_name"])
				.where("teams.org_id", "=", org_id)
				.execute(),
		]);
		const orgPermissions = await Promise.all(
			users.map(async (user) => ({
				user_id: user.id,
				org_relation: this.resolveOrgRelation(
					await AuthorizationService.getUserOrgPermissions(user.id, org_id),
				),
			})),
		);
		const orgByUser = new Map(orgPermissions.map((entry) => [entry.user_id, entry.org_relation]));

		const directByUser = new Map<string, "admin" | "editor" | "viewer">();
		const teamByUser = new Map<string, "admin" | "editor" | "viewer">();
		const userTeams = new Map<string, string[]>();
		const teamMembers = new Map<string, string[]>();
		const priority = { viewer: 1, editor: 2, admin: 3 } as const;

		for (const membership of teamMemberships) {
			const current = userTeams.get(membership.user_id) ?? [];
			current.push(membership.team_name);
			userTeams.set(membership.user_id, current);

			const teamUsers = teamMembers.get(membership.team_id) ?? [];
			teamUsers.push(membership.user_id);
			teamMembers.set(membership.team_id, teamUsers);
		}

		for (const grant of grants) {
			if (grant.subject_type === "user") {
				const current = directByUser.get(grant.subject_id);
				if (!current || priority[grant.relation] > priority[current]) {
					directByUser.set(grant.subject_id, grant.relation);
				}
				continue;
			}

			for (const userId of teamMembers.get(grant.subject_id) ?? []) {
				const current = teamByUser.get(userId);
				if (!current || priority[grant.relation] > priority[current]) {
					teamByUser.set(userId, grant.relation);
				}
			}
		}

		const result = users.map((user) => {
			const orgRelation = orgByUser.get(user.id) ?? null;
			const directRelation = directByUser.get(user.id) ?? null;
			const teamRelation = teamByUser.get(user.id) ?? null;
			const relations = [orgRelation, directRelation, teamRelation].filter(
				(value): value is "admin" | "editor" | "viewer" => Boolean(value),
			);
			const relation = relations.reduce<"admin" | "editor" | "viewer" | null>((current, next) => {
				if (!current) return next;
				return priority[next] > priority[current] ? next : current;
			}, null);

			const sources: Array<"org" | "direct" | "team"> = [];
			if (orgRelation) sources.push("org");
			if (directRelation) sources.push("direct");
			if (teamRelation) sources.push("team");

			return {
				user_id: user.id,
				email: user.email,
				relation,
				org_relation: orgRelation,
				direct_relation: directRelation,
				team_relation: teamRelation,
				sources,
				teams: userTeams.get(user.id) ?? [],
			};
		});

		return c.json(result, 200);
	};
}
