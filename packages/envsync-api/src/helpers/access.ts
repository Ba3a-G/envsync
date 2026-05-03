import { ApiKeyService } from "@/services/api_key.service";
import { UserService } from "@/services/user.service";
import { verifyJWTToken } from "./jwt";

export const validateAccess = async ({
	token,
	type,
}: {
	token: string;
	type: "JWT" | "API_KEY";
}): Promise<{
	user_id: string;
	auth_service_id?: string;
	auth_type: "JWT" | "API_KEY";
}> => {
	try {
		let userId: string = "";
		let authServiceId: string | undefined;

		if (type === "JWT") {
			const decoded = await verifyJWTToken(token);
			const idpSub = decoded.sub as string;
			if (!idpSub) {
				throw new Error("JWT subject claim is missing");
			}
			authServiceId = idpSub;
			let user;
			try {
				user = await UserService.getUserByIdpId(idpSub);
			} catch (error) {
				throw new Error(
					`User not found for Keycloak subject ${idpSub}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			userId = user.id;
		} else if (type === "API_KEY") {
			const apiKey = await ApiKeyService.getKeyByCreds(token);

			if (!apiKey) {
				throw new Error("Invalid API key");
			}

			if (!apiKey.is_active) {
				throw new Error("API key is deactivated");
			}

			// registerKeyUsage
			await ApiKeyService.registerKeyUsage(apiKey.id);

			userId = apiKey.user_id;
		}

		return {
			user_id: userId,
			auth_service_id: authServiceId,
			auth_type: type,
		};
	} catch (error) {
		throw new Error(
			"Unauthorized access: " + (error instanceof Error ? error.message : "Unknown error"),
		);
	}
};
