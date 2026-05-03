import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";

import { SystemController } from "@/controllers/system.controller";
import { errorResponseSchema } from "@/validators/common";
import { systemStatusResponseSchema } from "@/validators/system.validator";

const app = new Hono();

app.get(
	"/status",
	describeRoute({
		operationId: "getManagementSystemStatus",
		summary: "Get Management System Status",
		tags: ["System"],
		responses: {
			200: { description: "Management system status", content: { "application/json": { schema: resolver(systemStatusResponseSchema) } } },
			500: { description: "Internal server error", content: { "application/json": { schema: resolver(errorResponseSchema) } } },
		},
	}),
	SystemController.status,
);

export default app;
