import { defineConfig } from "tsup";
import { fileURLToPath } from "node:url";

const deployCoreSource = fileURLToPath(new URL("../deploy-core/src/index.ts", import.meta.url));

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	platform: "node",
	target: "node18",
	outDir: "dist",
	bundle: true,
	splitting: false,
	clean: true,
	sourcemap: false,
	dts: false,
	esbuildPlugins: [
		{
			name: "workspace-deploy-core-source",
			setup(build) {
				build.onResolve({ filter: /^@envsync-cloud\/deploy-core$/ }, () => ({
					path: deployCoreSource,
				}));
			},
		},
	],
	banner: {
		js: "#!/usr/bin/env node",
	},
});
