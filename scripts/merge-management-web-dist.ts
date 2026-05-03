import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const dashboardDist = path.join(repoRoot, "apps", "envsync-web", "dist");
const managementDist = path.join(repoRoot, "apps", "envsync-management-web", "dist");
const managementTarget = path.join(dashboardDist, "manage");

if (!fs.existsSync(dashboardDist)) {
  throw new Error("Dashboard dist does not exist. Build apps/envsync-web first.");
}

if (!fs.existsSync(managementDist)) {
  throw new Error("Management web dist does not exist. Build apps/envsync-management-web first.");
}

fs.rmSync(managementTarget, { recursive: true, force: true });
fs.mkdirSync(managementTarget, { recursive: true });

for (const entry of fs.readdirSync(managementDist)) {
  fs.cpSync(
    path.join(managementDist, entry),
    path.join(managementTarget, entry),
    { recursive: true }
  );
}

console.log(`Merged management web build into ${path.relative(repoRoot, managementTarget)}`);
