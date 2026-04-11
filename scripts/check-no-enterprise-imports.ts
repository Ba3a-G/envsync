import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const scanRoots = [
  "apps",
  "packages",
  "sdks",
  "scripts",
  ".github/workflows",
  "package.json",
  "turbo.json",
  "tsconfig.json",
];

const skipDirectories = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const fileExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".yml",
  ".yaml",
]);

const importPatterns = [
  /\bfrom\s+["'][^"']*enterprise[^"']*["']/,
  /\bimport\s*\(\s*["'][^"']*enterprise[^"']*["']\s*\)/,
  /\brequire\s*\(\s*["'][^"']*enterprise[^"']*["']\s*\)/,
];

type Violation = {
  file: string;
  line: number;
  text: string;
};

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(targetPath: string): Promise<string[]> {
  const absolutePath = path.join(rootDir, targetPath);

  if (!(await pathExists(absolutePath))) {
    return [];
  }

  const stats = await fs.stat(absolutePath);
  if (stats.isFile()) {
    return fileExtensions.has(path.extname(absolutePath)) ? [absolutePath] : [];
  }

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    if (skipDirectories.has(entry.name)) {
      return [];
    }

    return collectFiles(path.join(targetPath, entry.name));
  }));

  return nestedFiles.flat();
}

function findViolations(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) {
      return;
    }

    if (importPatterns.some((pattern) => pattern.test(trimmed))) {
      violations.push({
        file: path.relative(rootDir, filePath),
        line: index + 1,
        text: trimmed,
      });
    }
  });

  return violations;
}

async function main() {
  const files = (await Promise.all(scanRoots.map((scanRoot) => collectFiles(scanRoot)))).flat();
  const violations: Violation[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    violations.push(...findViolations(file, content));
  }

  if (violations.length > 0) {
    console.error("Enterprise-only imports are not allowed in the public repo.");
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} ${violation.text}`);
    }
    process.exit(1);
  }

  console.log("No enterprise-only imports found in public source.");
}

await main();
