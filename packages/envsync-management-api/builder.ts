/*
  Management API wrapper build. Bundles the thin package entrypoints while
  reusing the shared implementation from envsync-api.
*/

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { BuildOptions, Plugin } from "esbuild";
import { build } from "esbuild";
import { glob } from "glob";

const entryPoints = glob.sync("./src/**/*.ts", {
	ignore: ["./src/**/*.test.ts"],
});

const commonOptions: BuildOptions = {
	entryPoints,
	logLevel: "info",
	platform: "node",
	external: ["bun"],
};

const envsyncApiSrc = path.resolve(import.meta.dir, "..", "envsync-api", "src");

const aliasPlugin: Plugin = {
	name: "envsync-api-alias",
	setup(build) {
		build.onResolve({ filter: /^@\// }, args => {
			const relativePath = args.path.slice(2);
			const candidates = [
				path.join(envsyncApiSrc, `${relativePath}.ts`),
				path.join(envsyncApiSrc, `${relativePath}.tsx`),
				path.join(envsyncApiSrc, `${relativePath}.js`),
				path.join(envsyncApiSrc, `${relativePath}.d.ts`),
				path.join(envsyncApiSrc, relativePath, "index.ts"),
				path.join(envsyncApiSrc, relativePath, "index.tsx"),
				path.join(envsyncApiSrc, relativePath, "index.js"),
				path.join(envsyncApiSrc, relativePath, "index.d.ts"),
			];

			const match = candidates.find(candidate => fs.existsSync(candidate));
			if (!match) {
				return null;
			}

			return { path: match };
		});
	},
};

const copyDirSync = (src: string, dest: string) => {
	if (!fs.existsSync(src)) {
		return;
	}
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirSync(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
};

await build({
	...commonOptions,
	bundle: true,
	outbase: "./src",
	outdir: "./dist",
	format: "esm",
	plugins: [aliasPlugin],
	treeShaking: true,
});

copyDirSync("../envsync-api/src/libs/mail/templates/html", "./dist/templates/html");
copyDirSync("../envsync-api/src/libs/mail/templates/base", "./dist/templates/base");

exec("tsc --emitDeclarationOnly --declaration --project tsconfig.build.json");
