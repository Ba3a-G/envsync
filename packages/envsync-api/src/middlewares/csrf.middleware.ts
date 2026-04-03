import type { Context, MiddlewareHandler, Next } from "hono";
import { getCookie } from "hono/cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "envsync_csrf";

function usesHeaderAuth(ctx: Context) {
	return Boolean(ctx.req.header("Authorization") || ctx.req.header("X-API-Key"));
}

export const csrfMiddleware = (): MiddlewareHandler => {
	return async (ctx: Context, next: Next) => {
		if (SAFE_METHODS.has(ctx.req.method) || usesHeaderAuth(ctx)) {
			await next();
			return;
		}

		const accessToken = getCookie(ctx, "access_token");
		if (!accessToken) {
			await next();
			return;
		}

		const csrfCookie = getCookie(ctx, CSRF_COOKIE);
		const csrfHeader = ctx.req.header("X-CSRF-Token");

		if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
			return ctx.json(
				{
					error: "CSRF token is missing or invalid",
					code: "AUTH_CSRF_INVALID",
				},
				403,
			);
		}

		await next();
	};
};
