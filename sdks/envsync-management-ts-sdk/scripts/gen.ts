import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { managementApp } from "../../../packages/envsync-api/src/app/management";

const sdkRoot = resolve(import.meta.dir, "..");
const specOutput = resolve(sdkRoot, "openapi.json");
const srcOutput = resolve(sdkRoot, "src");

try {
  const response = await managementApp.request("http://management.local/openapi");
  if (!response.ok) {
    throw new Error(`Failed to export Management API OpenAPI spec: ${response.status} ${response.statusText}`);
  }

  const spec = await response.text();
  mkdirSync(sdkRoot, { recursive: true });
  writeFileSync(specOutput, spec);

  rmSync(srcOutput, { recursive: true, force: true });
  execSync(`openapi -i "${specOutput}" -o "${srcOutput}" -c fetch --name EnvSyncManagementAPISDK`, {
    cwd: sdkRoot,
    stdio: "inherit",
  });

  console.log(`Management SDK generated successfully from ${specOutput}.`);
} catch (error) {
  console.error("Error generating Management SDK:", error);
  process.exit(1);
}
