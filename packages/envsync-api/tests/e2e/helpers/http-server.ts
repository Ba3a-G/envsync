/**
 * Start a real HTTP server from the Hono app for CLI E2E tests.
 *
 * Uses Bun.serve on a random port so the Go CLI binary can make
 * real HTTP requests against a live API server.
 */
import { ensureE2EEnv } from "./bootstrap-env";

ensureE2EEnv();

export async function startTestServer(): Promise<{
	url: string;
	port: number;
	stop: () => void;
}> {
	const { app } = await import("@/app");
	const server = Bun.serve({
		port: 0,
		fetch: app.fetch.bind(app),
	});

	return {
		url: `http://localhost:${server.port}`,
		port: server.port!,
		stop: () => server.stop(true),
	};
}
