import "../../envsync-api/src/instrumentation";

import { CacheClient } from "../../envsync-api/src/libs/cache";
import { DB } from "../../envsync-api/src/libs/db";
import { FGAClient } from "../../envsync-api/src/libs/openfga";
import { registerApiBackgroundHandlers } from "../../envsync-api/src/modules/load-modules";
import { managementApp as app } from "../../envsync-api/src/app/management";
import { config } from "../../envsync-api/src/utils/env";

CacheClient.init();
await DB.healthCheck();
await FGAClient.getInstance();
await registerApiBackgroundHandlers("management");

export default {
	fetch: app.fetch.bind(app),
	port: Number(config.MANAGEMENT_API_PORT),
	idleTimeout: 255,
};
