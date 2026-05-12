import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	platform: "node",
	target: "node18",
	outDir: "dist",
	bundle: true,
	external: ["chalk", "yaml", "zod"],
	splitting: false,
	clean: true,
	sourcemap: false,
	dts: false,
	esbuildOptions(options) {
		options.alias = {
			...options.alias,
			"@envsync-cloud/deploy-core": path.resolve(dirname, "../deploy-core/src/index.ts"),
		};
	},
});
