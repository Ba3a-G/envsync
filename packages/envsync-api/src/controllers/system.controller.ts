import type { Context } from "hono";

import { LicenseStateService } from "@/services/license-state.service";
import { SystemStateService } from "@/services/system-state.service";

export class SystemController {
	public static readonly status = async (c: Context) => {
		const [system, license] = await Promise.all([
			SystemStateService.getSystemStatus(),
			LicenseStateService.getEnforcementDecision(),
		]);

		return c.json({
			system,
			license: {
				required: license.required,
				locked: license.locked,
				reason: license.reason,
				state: license.state,
			},
		});
	};
}
