import { Hono } from "hono";
import { loadApiModules } from "@/modules/load-modules";

const app = new Hono();

for (const module of loadApiModules()) {
	app.route(module.mountPath, await module.createRouter());
}

export default app;
