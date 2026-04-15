import { type Context } from "hono";
import * as openid from "openid-client";

import { config } from "@/utils/env";
import { getKeycloakIssuer, getKeycloakPublicBaseUrl, getKeycloakRealm, keycloakPasswordLogin, keycloakTokenExchange } from "@/helpers/keycloak";
import { clearWebAuthCookies, readLoginState, setLoginStateCookie, setWebAuthCookies } from "@/helpers/web-auth";

const keycloakDiscoveryUrl = () => `${getKeycloakIssuer()}/.well-known/openid-configuration`;
const authorizeEndpoint = () => `${getKeycloakIssuer()}/protocol/openid-connect/auth`;

const clientMetadata: openid.ClientMetadata = {
	client_id: config.KEYCLOAK_CLI_CLIENT_ID,
	redirect_uris: [],
};
const clientAuth: openid.ClientAuth = openid.None();

export class AccessController {
	private static assertDevSessionAllowed() {
		if (config.NODE_ENV === "production") {
			throw new Error("Local dev session bootstrap is disabled in production");
		}
	}

	public static readonly createCliLogin = async (c: Context) => {
		const { KEYCLOAK_CLI_CLIENT_ID } = config;

		const authConfig: openid.Configuration = await openid.discovery(
			new URL(keycloakDiscoveryUrl()),
			KEYCLOAK_CLI_CLIENT_ID,
			clientMetadata,
			clientAuth,
			{
				execute: [openid.allowInsecureRequests],
			}
		);

		const deviceAuthInit = await openid.initiateDeviceAuthorization(authConfig, {
			scope: "openid email profile",
		});

		return c.json(
			{
				message: "CLI login created successfully.",
				verification_uri_complete: deviceAuthInit.verification_uri_complete,
				user_code: deviceAuthInit.user_code,
				device_code: deviceAuthInit.device_code,
				expires_in: deviceAuthInit.expires_in,
				interval: deviceAuthInit.interval,
				client_id: KEYCLOAK_CLI_CLIENT_ID,
				token_url: authConfig.serverMetadata().token_endpoint
			},
			201,
		);
	};

	public static readonly createWebLogin = async (c: Context) => {
		const { KEYCLOAK_WEB_CLIENT_ID, KEYCLOAK_WEB_REDIRECT_URI } = config;
		const state = crypto.randomUUID();
		setLoginStateCookie(c, state);

		const loginUrl = `${authorizeEndpoint()}?client_id=${KEYCLOAK_WEB_CLIENT_ID}&response_type=code&scope=openid%20email%20profile&redirect_uri=${encodeURIComponent(KEYCLOAK_WEB_REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

		return c.json({ message: "Web login created successfully.", loginUrl }, 201);
	};

	public static readonly createDevWebSession = async (c: Context) => {
		this.assertDevSessionAllowed();

		const email = c.req.query("email");
		const password = c.req.query("password");
		if (!email || !password) {
			return c.json({ error: "email and password are required" }, 400);
		}

		const tokenData = await keycloakPasswordLogin(
			email,
			password,
			config.KEYCLOAK_WEB_CLIENT_ID,
			config.KEYCLOAK_WEB_CLIENT_SECRET,
		);
		setWebAuthCookies(c, tokenData);
		return c.json({ message: "Local web session created." }, 200);
	};

	public static readonly callbackWebLogin = async (c: Context) => {
		const {
			KEYCLOAK_WEB_CLIENT_ID,
			KEYCLOAK_WEB_CLIENT_SECRET,
			KEYCLOAK_WEB_REDIRECT_URI,
			KEYCLOAK_WEB_CALLBACK_URL,
		} = config;

		const { code, state } = c.req.query();

		if (!code) {
			return c.json({ error: "Code is required." }, 400);
		}
		const expectedState = readLoginState(c);
		if (!state || !expectedState || state !== expectedState) {
			clearWebAuthCookies(c);
			return c.json({ error: "Invalid login state." }, 400);
		}

		const tokenData = await keycloakTokenExchange(
			code,
			KEYCLOAK_WEB_REDIRECT_URI,
			KEYCLOAK_WEB_CLIENT_ID,
			KEYCLOAK_WEB_CLIENT_SECRET,
		);

		setWebAuthCookies(c, tokenData);
		return c.redirect(KEYCLOAK_WEB_CALLBACK_URL, 302);
	};

	public static readonly logoutWebLogin = async (c: Context) => {
		clearWebAuthCookies(c);

		const logoutUrl = new URL(
			`${getKeycloakPublicBaseUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/logout`,
		);
		logoutUrl.searchParams.set("client_id", config.KEYCLOAK_WEB_CLIENT_ID);
		logoutUrl.searchParams.set("post_logout_redirect_uri", config.DASHBOARD_URL);

		return c.json(
			{
				message: "Web logout prepared successfully.",
				logoutUrl: logoutUrl.toString(),
			},
			200,
		);
	};

	public static readonly createApiLogin = async (c: Context) => {
		const { KEYCLOAK_API_CLIENT_ID, KEYCLOAK_API_REDIRECT_URI } = config;

		const loginUrl = `${authorizeEndpoint()}?client_id=${KEYCLOAK_API_CLIENT_ID}&response_type=code&scope=openid%20email%20profile&redirect_uri=${encodeURIComponent(KEYCLOAK_API_REDIRECT_URI)}`;

		return c.json({ message: "API login created successfully.", loginUrl }, 201);
	};

	public static readonly callbackApiLogin = async (c: Context) => {
		const {
			KEYCLOAK_API_CLIENT_ID,
			KEYCLOAK_API_CLIENT_SECRET,
			KEYCLOAK_API_REDIRECT_URI,
		} = config;

		const { code } = c.req.query();

		if (!code) {
			return c.json({ error: "Code is required." }, 400);
		}

		const tokenData = await keycloakTokenExchange(
			code,
			KEYCLOAK_API_REDIRECT_URI,
			KEYCLOAK_API_CLIENT_ID,
			KEYCLOAK_API_CLIENT_SECRET,
		);

		return c.json(
			{
				message: "API login callback successful.",
				tokenData,
			},
			200,
		);
	};
}
