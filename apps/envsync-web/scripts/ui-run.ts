import path from "node:path";

import { waitForUiServices } from "../e2e/helpers/auth";

const tier = process.argv[2] ?? "smoke";
const validTiers = new Set([
	"smoke",
	"journey:onboarding",
	"journey:collaboration",
	"landing:smoke",
	"features",
	"permissions",
	"regression",
	"full",
	"nightly",
]);
if (!validTiers.has(tier)) {
	throw new Error(`Unknown UI tier "${tier}". Valid values: ${[...validTiers].join(", ")}`);
}

type TierKey =
	| "smoke"
	| "journey:onboarding"
	| "journey:collaboration"
	| "landing:smoke"
	| "features"
	| "permissions"
	| "regression"
	| "full"
	| "nightly";

const tiers: Record<TierKey, string[]> = {
	smoke: ["e2e/specs/smoke"],
	"journey:onboarding": ["e2e/specs/journeys/landing-onboarding.spec.ts"],
	"journey:collaboration": ["e2e/specs/journeys/collaboration-protected-flow.spec.ts"],
	"landing:smoke": ["e2e/specs/journeys/landing-onboarding.spec.ts"],
	features: ["e2e/specs/features"],
	permissions: ["e2e/specs/permissions"],
	regression: [
		"e2e/specs/smoke",
		"e2e/specs/regression",
		"e2e/specs/features",
		"e2e/specs/permissions",
		"e2e/specs/journeys/collaboration-protected-flow.spec.ts",
	],
	full: [
		"e2e/specs/smoke",
		"e2e/specs/regression",
		"e2e/specs/features",
		"e2e/specs/permissions",
		"e2e/specs/journeys",
		"e2e/specs/full",
	],
	nightly: [
		"e2e/specs/smoke",
		"e2e/specs/regression",
		"e2e/specs/features",
		"e2e/specs/permissions",
		"e2e/specs/journeys",
		"e2e/specs/full",
		"e2e/specs/nightly",
	],
};

const tierRoles = {
	smoke: "master",
	"journey:onboarding": "master",
	"journey:collaboration": "all",
	"landing:smoke": "master",
	features: "all",
	permissions: "all",
	regression: "all",
	full: "all",
	nightly: "all",
} as const satisfies Record<TierKey, "master" | "all">;

const tierWorkers: Record<TierKey, number> = {
	smoke: 4,
	"journey:onboarding": 1,
	"journey:collaboration": 1,
	"landing:smoke": 1,
	features: 4,
	permissions: 4,
	regression: 3,
	full: 1,
	nightly: 1,
};

function resolveWorkerCount(tierKey: TierKey) {
	const rawOverride = process.env.ENVSYNC_UI_WORKERS;
	if (!rawOverride) {
		return tierWorkers[tierKey];
	}

	const parsed = Number.parseInt(rawOverride, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid ENVSYNC_UI_WORKERS value "${rawOverride}"`);
	}

	return parsed;
}

async function runScript(scriptPath: string, args: string[] = []) {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", scriptPath, ...args],
		cwd: import.meta.dir,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (proc.exitCode !== 0) {
		throw new Error(`Failed running ${path.basename(scriptPath)} ${args.join(" ")}`.trim());
	}
}

await waitForUiServices();
if (process.env.ENVSYNC_UI_SKIP_SEED !== "1") {
	await runScript(path.resolve(import.meta.dir, "ui-seed.ts"));
}
if (process.env.ENVSYNC_UI_SKIP_LOGIN !== "1") {
	await runScript(path.resolve(import.meta.dir, "ui-login.ts"), [tierRoles[tier as TierKey]]);
}

const tierSpecs = tiers[tier as TierKey];
const workerCount = resolveWorkerCount(tier as TierKey);
const proc = Bun.spawnSync({
	cmd: ["bunx", "playwright", "test", ...tierSpecs, "--workers", String(workerCount)],
	cwd: path.resolve(import.meta.dir, ".."),
	stdout: "inherit",
	stderr: "inherit",
	env: process.env,
});

if (proc.exitCode !== 0) {
	throw new Error(`Playwright ${tier} suite failed`);
}
