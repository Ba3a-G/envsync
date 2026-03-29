import readline from "node:readline";

export async function prompt(question: string, fallback?: string): Promise<string> {
	if (!process.stdin.isTTY) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Prompt required in non-interactive mode: ${question}`);
	}

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise(resolve => {
		rl.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, answer => {
			rl.close();
			resolve(answer.trim() || fallback || "");
		});
	});
}

export async function confirm(question: string, defaultValue = false): Promise<boolean> {
	const fallback = defaultValue ? "y" : "n";
	const answer = await prompt(`${question} (y/N)`, fallback);
	return /^y(es)?$/i.test(answer);
}
