import { spawnSync } from "node:child_process";

export interface RunCommandOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	allowFailure?: boolean;
	capture?: boolean;
}

export interface RunCommandResult {
	stdout: string;
	stderr: string;
	status: number;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): RunCommandResult {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: options.capture ? "pipe" : "inherit",
	});

	const status = result.status ?? 1;
	if (status !== 0 && !options.allowFailure) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	}

	return {
		stdout: result.stdout?.toString() ?? "",
		stderr: result.stderr?.toString() ?? "",
		status,
	};
}

export function hasCommand(command: string): boolean {
	const result = spawnSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" });
	return (result.status ?? 1) === 0;
}
