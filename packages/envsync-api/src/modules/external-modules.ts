import type { ApiModule } from "./types";

/**
 * Public FOSS builds intentionally ship with no external modules.
 *
 * A private superset repo can replace this file with imports from
 * enterprise-only packages, for example:
 *
 * import { enterpriseApiModules } from "envsync-enterprise-api/modules";
 * export const externalApiModules = enterpriseApiModules;
 */
export const externalApiModules: ApiModule[] = [];
