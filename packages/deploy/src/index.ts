#!/usr/bin/env node

import chalk from "chalk";

import {
	type DeployEdition,
	formatDeploymentPlan,
	loadDeploymentPlanFromFile,
} from "@envsync-cloud/deploy-core";

function printHelp() {
	console.log(`
${chalk.bold("EnvSync OSS Deploy")}

Commands:
  validate [deploy.yaml] [--json]   Validate an OSS topology config
  plan [deploy.yaml] [--json]       Render the OSS topology plan
`);
}

function getPositionals(argv: string[]) {
	return argv.filter(arg => !arg.startsWith("--"));
}

function getPlan(filePath: string | undefined, edition: DeployEdition) {
	return loadDeploymentPlanFromFile(filePath ?? "deploy.yaml", edition);
}

async function main() {
	const argv = process.argv.slice(2);
	const command = argv[0];
	const rest = argv.slice(1);
	const json = rest.includes("--json");
	const positionals = getPositionals(rest);
	const filePath = positionals[0];

	if (!command || command === "--help" || command === "help") {
		printHelp();
		return;
	}

	switch (command) {
		case "validate": {
			const plan = getPlan(filePath, "oss");
			if (json) {
				console.log(JSON.stringify({ valid: true, edition: plan.edition, warnings: plan.warnings }, null, 2));
			} else {
				console.log(chalk.green("OSS topology is valid."));
				if (plan.warnings.length > 0) {
					for (const warning of plan.warnings) {
						console.log(chalk.yellow(`warning: ${warning}`));
					}
				}
			}
			break;
		}
		case "plan": {
			const plan = getPlan(filePath, "oss");
			console.log(formatDeploymentPlan(plan, json ? "json" : "yaml"));
			break;
		}
		default:
			throw new Error(`Unknown command: ${command}`);
	}
}

main().catch(error => {
	console.error(chalk.red(error instanceof Error ? error.message : String(error)));
	process.exit(1);
});
