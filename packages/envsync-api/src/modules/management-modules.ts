import type { ApiModule } from "./types";

export const managementApiModules: ApiModule[] = [
	{
		name: "onboarding",
		mountPath: "/onboarding",
		createRouter: async () => (await import("@/routes/onboarding.route")).default,
	},
	{
		name: "license",
		mountPath: "/license",
		createRouter: async () => (await import("@/routes/license.route")).default,
		registerBackgroundHandlers: async () => {
			const { LicenseStateService } = await import("@/services/license-state.service");
			await LicenseStateService.startHeartbeat();
		},
	},
	{
		name: "enterprise",
		mountPath: "/enterprise",
		createRouter: async () => (await import("@/routes/enterprise.route")).default,
		registerBackgroundHandlers: async () => {
			const { EnterpriseSyncService } = await import("@/services/enterprise-sync.service");
			EnterpriseSyncService.startWorker();
		},
	},
	{
		name: "system",
		mountPath: "/system",
		createRouter: async () => (await import("@/routes/system.route")).default,
	},
];
