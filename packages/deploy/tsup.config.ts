import { defineConfig } from "tsup";

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
});
