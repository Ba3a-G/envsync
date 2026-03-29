#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";

const [, , packageDirArg, version] = process.argv;

if (!packageDirArg || !version) {
	console.error("Usage: bun run scripts/set-package-version.ts <package-dir> <version>");
	process.exit(1);
}

const packageJsonPath = path.resolve(process.cwd(), packageDirArg, "package.json");
if (!fs.existsSync(packageJsonPath)) {
	console.error(`package.json not found: ${packageJsonPath}`);
	process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
pkg.version = version;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
