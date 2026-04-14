const root = new URL("..", import.meta.url).pathname;

const processHandle = Bun.spawn([
  "rg",
  "-n",
  "from [\"'].*useAuth[\"']",
  "src",
], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = (await new Response(processHandle.stdout).text()).trim();
const stderr = (await new Response(processHandle.stderr).text()).trim();
const exitCode = await processHandle.exited;

if (exitCode !== 0 && exitCode !== 1) {
  console.error(stderr || "Failed to scan for direct useAuth imports");
  process.exit(exitCode);
}

const allowedFiles = new Set([
  "src/contexts/auth/provider.tsx",
]);

const violations = stdout
  ? stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const file = line.split(":")[0];
        return !allowedFiles.has(file);
      })
  : [];

if (violations.length > 0) {
  console.error("Direct useAuth imports are only allowed inside the auth provider.");
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log("Auth import guard passed.");
