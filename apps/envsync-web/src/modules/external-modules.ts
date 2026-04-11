import type { WebModule } from "./types";

/**
 * Public FOSS builds intentionally ship with no external modules.
 *
 * A private superset repo can replace this file with imports from
 * enterprise-only packages, for example:
 *
 * import { enterpriseWebModules } from "envsync-enterprise-web/modules";
 * export const externalWebModules = enterpriseWebModules;
 */
export const externalWebModules: WebModule[] = [];
