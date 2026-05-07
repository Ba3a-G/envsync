import log, { LogTypes } from "@/libs/logger";
import { config } from "@/utils/env";

import { createApiApp } from "./factory";

const app = await createApiApp("core");

const apiRoutes = app.routes;
log("API Routes:", LogTypes.LOGS, "Entrypoint");
apiRoutes.forEach(route => {
	log(`Method: ${route.method}, Path: ${route.path}`, LogTypes.LOGS, "Entrypoint");
});

log(`Server started at http://localhost:${config.PORT}`, LogTypes.LOGS, "Entrypoint");

export { app };
