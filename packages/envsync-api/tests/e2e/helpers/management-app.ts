import { LicenseStateService } from "@/services/license-state.service";

export async function startManagementBackgroundHandlers() {
	await LicenseStateService.startHeartbeat();
}
