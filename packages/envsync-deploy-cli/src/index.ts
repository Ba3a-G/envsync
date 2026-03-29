#!/usr/bin/env bun

import { backup } from "@/commands/backup";
import { deploy } from "@/commands/deploy";
import { health } from "@/commands/health";
import { preinstall } from "@/commands/preinstall";
import { restore } from "@/commands/restore";
import { setup } from "@/commands/setup";
import { upgrade } from "@/commands/upgrade";
import { upgradeDeps } from "@/commands/upgrade-deps";

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command?: string; flags: Flags } {
	const flags: Flags = {};
	let command: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!command && !arg.startsWith("-")) {
			command = arg;
			continue;
		}

		if (arg.startsWith("--")) {
			const [key, inlineValue] = arg.slice(2).split("=", 2);
			if (inlineValue !== undefined) {
				flags[key] = inlineValue;
				continue;
			}

			const next = argv[index + 1];
			if (next && !next.startsWith("-")) {
				flags[key] = next;
				index += 1;
			} else {
				flags[key] = true;
			}
		}
	}

	return { command, flags };
}

function printHelp(): void {
	console.log(`EnvSync Deploy CLI

Usage:
  envsync-deploy <command> [options]

Commands:
  preinstall
  setup
  deploy
  health
  upgrade
  upgrade-deps
  backup
  restore

Common flags:
  --install-path <path>   Default: /opt/envsync
  --source <bundle|repo>
  --ref <git-ref>
  --json
  --yes`);
}

const { command, flags } = parseArgs(process.argv.slice(2));

if (!command || flags.help || flags.h) {
	printHelp();
	process.exit(0);
}

const commands: Record<string, (flags: Flags) => Promise<void>> = {
	preinstall,
	setup,
	deploy,
	health,
	upgrade,
	"upgrade-deps": upgradeDeps,
	backup,
	restore,
};

const handler = commands[command];
if (!handler) {
	printHelp();
	process.exit(1);
}

handler(flags).catch(error => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
