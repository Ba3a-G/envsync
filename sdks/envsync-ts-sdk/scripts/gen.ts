import { execSync } from "node:child_process";

const baseUrl = process.env.ENVSYNC_API_URL ?? "http://localhost:4000";
const specInput = process.env.OPENAPI_SPEC ?? `${baseUrl}/openapi`;

try {
  execSync("rm -rf src", { stdio: "inherit" });
  execSync(`openapi -i ${specInput} -o src -c fetch --name EnvSyncAPISDK`, { stdio: "inherit" });
  console.log(`SDK generated successfully from ${specInput}.`);
} catch (error) {
  console.error("Error generating SDK:", error);
  process.exit(1);
}
