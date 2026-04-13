import { v4 as uuidv4 } from "uuid";

import { cacheAside, invalidateCache } from "@/helpers/cache";
import { CacheKeys, CacheTTL } from "@/helpers/cache-keys";
import { createKeycloakUser } from "@/helpers/keycloak";
import { DB } from "@/libs/db";
import { orNotFound } from "@/libs/errors";
import { runSaga } from "@/helpers/saga";
import { invalidateSessionToken } from "@/libs/kms/session-manager";
import { AuthorizationService } from "@/services/authorization.service";

export class UserService {
	public static createUser = async (data: {
		email: string;
		full_name: string;
		password: string;
		org_id: string;
		role_id: string;
	}) => {
		const ctx = { userId: "", authServiceId: "" };
		await runSaga("createUser", ctx, [
			{
				name: "idp-create",
				execute: async (c) => {
					const parts = data.full_name.trim().split(/\s+/).filter(Boolean);
					const firstName = parts[0]?.slice(0, 200) ?? "User";
					const lastName = parts.slice(1).join(" ").slice(0, 200) || "-";

					const zUser = await createKeycloakUser({
						userName: data.email,
						email: data.email,
						firstName,
						lastName,
						password: data.password,
					});
					c.authServiceId = zUser.id;
				},
			},
			{
				name: "db-insert",
				execute: async (c) => {
					const db = await DB.getInstance();
					const { id } = await db
						.insertInto("users")
						.values({
							id: uuidv4(),
							is_active: true,
							email: data.email,
							org_id: data.org_id,
							role_id: data.role_id,
							auth_service_id: c.authServiceId,
							full_name: data.full_name,
							profile_picture_url: null,
							created_at: new Date(),
							updated_at: new Date(),
						})
						.returning("id")
						.executeTakeFirstOrThrow();
					c.userId = id;
				},
				compensate: async (c) => {
					const db = await DB.getInstance();
					await db.deleteFrom("users").where("id", "=", c.userId).execute();
				},
			},
			{
				name: "fga-assign-role",
				execute: async (c) => {
					await AuthorizationService.assignRoleToUser(c.userId, data.org_id, data.role_id);
				},
				compensate: async (c) => {
					await AuthorizationService.removeUserOrgPermissions(c.userId, data.org_id);
				},
			},
			{
				name: "cache-invalidate",
				execute: async () => {
					await invalidateCache(CacheKeys.usersByOrg(data.org_id));
				},
			},
		]);

		return { id: ctx.userId };
	};

	public static getUser = async (id: string) => {
		return cacheAside(CacheKeys.user(id), CacheTTL.SHORT, async () => {
			const db = await DB.getInstance();

			const user = await orNotFound(
				db
					.selectFrom("users")
					.selectAll()
					.where("id", "=", id)
					.executeTakeFirstOrThrow(),
				"User",
				id,
			);

			return user;
		});
	};

	public static getAllUser = async (org_id: string, page = 1, per_page = 50) => {
		const db = await DB.getInstance();

		const user = await db
			.selectFrom("users")
			.selectAll()
			.where("org_id", "=", org_id)
			.limit(per_page)
			.offset((page - 1) * per_page)
			.execute();

		return user;
	};

	public static updateUser = async (
		id: string,
		data: {
			full_name?: string;
			profile_picture_url?: string;
			role_id?: string;
			email?: string;
		},
	) => {
		const db = await DB.getInstance();

		// Fetch user before update for invalidation keys
		const user = await orNotFound(
			db
				.selectFrom("users")
				.select(["org_id", "auth_service_id"])
				.where("id", "=", id)
				.executeTakeFirstOrThrow(),
			"User",
			id,
		);

		// If role_id is changing, re-sync FGA tuples
		if (data.role_id) {
			await AuthorizationService.resyncUserRole(id, user.org_id, data.role_id);
		}

		await db
			.updateTable("users")
			.set({
				...data,
				updated_at: new Date(),
			})
			.where("id", "=", id)
			.execute();

		const keysToInvalidate = [CacheKeys.user(id), CacheKeys.usersByOrg(user.org_id)];
		if (user.auth_service_id) keysToInvalidate.push(CacheKeys.userByIdp(user.auth_service_id));
		await invalidateCache(...keysToInvalidate);
		invalidateSessionToken(id, user.org_id);
	};

	public static deleteUser = async (id: string) => {
		const db = await DB.getInstance();

		const user = await orNotFound(
			db
				.selectFrom("users")
				.select(["org_id", "auth_service_id"])
				.where("id", "=", id)
				.executeTakeFirstOrThrow(),
			"User",
			id,
		);

		await runSaga("deleteUser", {}, [
			{
				name: "db-delete",
				execute: async () => {
					await db.deleteFrom("users").where("id", "=", id).executeTakeFirstOrThrow();
				},
			},
			{
				name: "fga-cleanup",
				execute: async () => {
					await AuthorizationService.removeUserOrgPermissions(id, user.org_id);
				},
			},
			{
				name: "cache-invalidate",
				execute: async () => {
					const keysToInvalidate = [CacheKeys.user(id), CacheKeys.usersByOrg(user.org_id), CacheKeys.allForUser(id)];
					if (user.auth_service_id) keysToInvalidate.push(CacheKeys.userByIdp(user.auth_service_id));
					await invalidateCache(...keysToInvalidate);
					invalidateSessionToken(id, user.org_id);
				},
			},
		]);
	};

	public static hasOtherMembershipsForAuthService = async (auth_service_id: string, excluding_user_id: string) => {
		const db = await DB.getInstance();
		const membership = await db
			.selectFrom("users")
			.select("id")
			.where("auth_service_id", "=", auth_service_id)
			.where("id", "!=", excluding_user_id)
			.executeTakeFirst();

		return Boolean(membership);
	};

	public static getOrphanedAuthServiceIdsForOrg = async (org_id: string) => {
		const db = await DB.getInstance();
		const orgUsers = await db
			.selectFrom("users")
			.select(["id", "auth_service_id"])
			.where("org_id", "=", org_id)
			.where("auth_service_id", "is not", null)
			.execute();

		const orphanedIds = new Set<string>();
		for (const user of orgUsers) {
			if (!user.auth_service_id) continue;
			const hasOtherMemberships = await this.hasOtherMembershipsForAuthService(user.auth_service_id, user.id);
			if (!hasOtherMemberships) {
				orphanedIds.add(user.auth_service_id);
			}
		}

		return Array.from(orphanedIds);
	};

	public static getUserByKeycloakId = async (auth_service_id: string) => {
		return cacheAside(CacheKeys.userByIdp(auth_service_id), CacheTTL.SHORT, async () => {
			const db = await DB.getInstance();
			if (process.env.E2E_DEBUG_AUTH === "1") {
				const direct = await db
					.selectFrom("users")
					.select(["id", "auth_service_id", "org_id", "role_id"])
					.where("auth_service_id", "=", auth_service_id)
					.executeTakeFirst();
				console.log(
					`[AUTH DEBUG] lookup db=${process.env.DATABASE_NAME} auth_service_id=${auth_service_id} found=${direct ? "yes" : "no"} user_id=${direct?.id ?? ""}`,
				);
			}
			const user = await orNotFound(
				db
					.selectFrom("users")
					.selectAll()
					.where("auth_service_id", "=", auth_service_id)
					.executeTakeFirstOrThrow(),
				"User",
			);
			return user;
		});
	};

	public static getUserByIdpId = (idpId: string) => UserService.getUserByKeycloakId(idpId);

	public static getOrgUserByEmail = async (org_id: string, email: string) => {
		const db = await DB.getInstance();
		return db
			.selectFrom("users")
			.selectAll()
			.where("org_id", "=", org_id)
			.where("email", "=", email)
			.executeTakeFirst();
	};

	public static getUserByEmail = async (email: string) => {
		const db = await DB.getInstance();
		return db
			.selectFrom("users")
			.selectAll()
			.where("email", "=", email)
			.executeTakeFirst();
	};
}
