import type { Hono } from "hono";
import type { ZodRawShape } from "zod";

export type EnvSchemaExtension = ZodRawShape | (() => ZodRawShape);

export interface ApiModule {
	name: string;
	mountPath: string;
	createRouter: () => Promise<Hono> | Hono;
	extendEnvSchema?: () => ZodRawShape;
	migrationDirectories?: () => string[];
	registerBackgroundHandlers?: () => Promise<void> | void;
}
