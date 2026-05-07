import type { ZodRawShape } from "zod";

import { coreApiModules } from "./core-modules";
import { externalApiModules } from "./external-modules";
import { managementApiModules } from "./management-modules";
import type { ApiModule, ApiSurface, EnvSchemaExtension } from "./types";

const allApiModules = [...coreApiModules, ...managementApiModules, ...externalApiModules];

function resolveEnvShape(extension: EnvSchemaExtension): ZodRawShape {
	return typeof extension === "function" ? extension() : extension;
}

export function loadApiModules(surface: ApiSurface = "core"): ApiModule[] {
	if (surface === "management") {
		return [...managementApiModules];
	}

	return [...coreApiModules, ...externalApiModules];
}

export function collectEnvSchemaExtensions(modules: ApiModule[] = allApiModules): ZodRawShape[] {
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

export async function registerApiBackgroundHandlers(surface: ApiSurface = "core", modules: ApiModule[] = loadApiModules(surface)) {
	for (const module of modules) {
		await module.registerBackgroundHandlers?.();
	}
}
