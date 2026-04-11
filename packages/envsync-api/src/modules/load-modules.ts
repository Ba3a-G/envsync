import type { ZodRawShape } from "zod";

import { coreApiModules } from "./core-modules";
import { externalApiModules } from "./external-modules";
import type { ApiModule, EnvSchemaExtension } from "./types";

const apiModules = [...coreApiModules, ...externalApiModules];

function resolveEnvShape(extension: EnvSchemaExtension): ZodRawShape {
	return typeof extension === "function" ? extension() : extension;
}

export function loadApiModules(): ApiModule[] {
	return [...apiModules];
}

export function collectEnvSchemaExtensions(modules: ApiModule[] = loadApiModules()): ZodRawShape[] {
	return modules
		.flatMap(module => {
			if (!module.extendEnvSchema) {
				return [];
			}

			return [resolveEnvShape(module.extendEnvSchema())];
		});
}

export function collectMigrationDirectories(baseDirectories: string[] = [], modules: ApiModule[] = loadApiModules()): string[] {
	const directories = [
		...baseDirectories,
		...modules.flatMap(module => module.migrationDirectories?.() ?? []),
	];

	return [...new Set(directories.filter(Boolean))];
}

export async function registerApiBackgroundHandlers(modules: ApiModule[] = loadApiModules()) {
	for (const module of modules) {
		await module.registerBackgroundHandlers?.();
	}
}
