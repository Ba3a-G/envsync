import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi/zod";

import { authMiddleware } from "@/middlewares/auth.middleware";
import { requirePermission } from "@/middlewares/permission.middleware";
import { TeamController } from "@/controllers/team.controller";
import {
	createTeamRequestBodySchema,
	createTeamResponseSchema,
	getTeamResponseSchema,
	getTeamsResponseSchema,
	updateTeamRequestBodySchema,
	addTeamMemberRequestBodySchema,
	assignTeamRoleRequestBodySchema,
	messageResponseSchema,
} from "@/validators/team.validator";
import { errorResponseSchema } from "@/validators/common";
import { effectivePermissionsResponseSchema } from "@/validators/permission.validator";

const app = new Hono();

app.use(authMiddleware());

app.get(
	"/",
	describeRoute({
		operationId: "getTeams",
		summary: "Get All Teams",
		description: "Retrieve all teams for the organization",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Teams retrieved successfully",
				content: {
					"application/json": {
						schema: resolver(getTeamsResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	TeamController.getTeams,
);

app.post(
	"/",
	describeRoute({
		operationId: "createTeam",
		summary: "Create Team",
		description: "Create a new team in the organization",
		tags: ["Teams"],
		responses: {
			201: {
				description: "Team created successfully",
				content: {
					"application/json": {
						schema: resolver(createTeamResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	zValidator("json", createTeamRequestBodySchema),
	requirePermission("can_manage_users", "org"),
	TeamController.createTeam,
);

app.get(
	"/:id",
	describeRoute({
		operationId: "getTeam",
		summary: "Get Team",
		description: "Retrieve a specific team with its members",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team retrieved successfully",
				content: {
					"application/json": {
						schema: resolver(getTeamResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	TeamController.getTeam,
);

app.patch(
	"/:id",
	describeRoute({
		operationId: "updateTeam",
		summary: "Update Team",
		description: "Update an existing team",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team updated successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	zValidator("json", updateTeamRequestBodySchema),
	requirePermission("can_manage_users", "org"),
	TeamController.updateTeam,
);

app.delete(
	"/:id",
	describeRoute({
		operationId: "deleteTeam",
		summary: "Delete Team",
		description: "Delete an existing team",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team deleted successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	requirePermission("can_manage_users", "org"),
	TeamController.deleteTeam,
);

app.post(
	"/:id/members",
	describeRoute({
		operationId: "addTeamMember",
		summary: "Add Team Member",
		description: "Add a user to a team",
		tags: ["Teams"],
		responses: {
			201: {
				description: "Team member added successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	zValidator("json", addTeamMemberRequestBodySchema),
	requirePermission("can_manage_users", "org"),
	TeamController.addTeamMember,
);

app.delete(
	"/:id/members/:user_id",
	describeRoute({
		operationId: "removeTeamMember",
		summary: "Remove Team Member",
		description: "Remove a user from a team",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team member removed successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	requirePermission("can_manage_users", "org"),
	TeamController.removeTeamMember,
);

app.post(
	"/:id/assign-role",
	describeRoute({
		operationId: "assignTeamRole",
		summary: "Assign Team Role",
		description: "Assign an organization role to a team so members inherit its permissions.",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team role assigned successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	zValidator("json", assignTeamRoleRequestBodySchema),
	requirePermission("can_manage_users", "org"),
	TeamController.assignRole,
);

app.post(
	"/:id/unassign-role",
	describeRoute({
		operationId: "unassignTeamRole",
		summary: "Unassign Team Role",
		description: "Remove the inherited organization role from a team.",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team role removed successfully",
				content: {
					"application/json": {
						schema: resolver(messageResponseSchema),
					},
				},
			},
			500: {
				description: "Internal server error",
				content: {
					"application/json": {
						schema: resolver(errorResponseSchema),
					},
				},
			},
		},
	}),
	requirePermission("can_manage_users", "org"),
	TeamController.unassignRole,
);

app.get(
	"/:id/effective-permissions",
	describeRoute({
		operationId: "getTeamEffectivePermissions",
		summary: "Get Team Effective Permissions",
		description: "Get the org-level permissions inherited by team members through the team role",
		tags: ["Teams"],
		responses: {
			200: {
				description: "Team effective permissions returned successfully",
				content: { "application/json": { schema: resolver(effectivePermissionsResponseSchema) } },
			},
		},
	}),
	requirePermission("can_manage_users", "org"),
	TeamController.getEffectivePermissions,
);

export default app;
