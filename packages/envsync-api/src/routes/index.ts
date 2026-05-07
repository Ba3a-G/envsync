import { Hono } from "hono";
import { loadApiModules } from "@/modules/load-modules";
import type { ApiSurface } from "@/modules/types";

export async function createApiRoutes(surface: ApiSurface = "core") {
	const app = new Hono();

	for (const module of loadApiModules(surface)) {
		app.route(module.mountPath, await module.createRouter());
	}

	return app;
}

const app = await createApiRoutes("core");

export default app;
