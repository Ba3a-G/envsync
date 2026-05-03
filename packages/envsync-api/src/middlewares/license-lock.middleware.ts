import type { MiddlewareHandler } from "hono";

import { LicenseStateService } from "@/services/license-state.service";

export function enterpriseLicenseLockMiddleware(allowlistedPaths: string[] = []): MiddlewareHandler {
	return async (ctx, next) => {
		if (allowlistedPaths.some(path => ctx.req.path === path || ctx.req.path.startsWith(`${path}/`))) {
			await next();
			return;
		}

		const decision = await LicenseStateService.getEnforcementDecision();
		if (!decision.locked) {
			await next();
			return;
		}

		return ctx.json(
			{
				error: "Enterprise license is invalid or expired.",
				code: "ENTERPRISE_LICENSE_INVALID",
				reason: decision.reason,
			},
			423,
		);
	};
}
