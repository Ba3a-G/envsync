import { argv } from "bun";
import { sql } from "kysely";

import { DB } from "../src/libs/db";

type ExecutedMigration = {
	name: string;
	executedAt: string | null;
};

type JsonResponse = {
	ok: boolean;
	command: string;
	currentHead: string | null;
	targetHead?: string | null;
	executedMigrations: ExecutedMigration[];
	results?: unknown;
};

const rawArgs = argv.slice(2);
const jsonMode = rawArgs.includes("--json");
const args = rawArgs.filter(arg => arg !== "--json");

function formatErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function getMigrator() {
	return DB.migrator();
}

async function getExecutedMigrations() {
	const migrator = await getMigrator();
	const migrations = await migrator.getMigrations();
	return migrations
		.map(migration => ({
			name: migration.name,
			executedAt: migration.executedAt ? new Date(migration.executedAt).toISOString() : null,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
}

async function currentHead() {
	const executed = await getExecutedMigrations();
	return executed.filter(migration => migration.executedAt).at(-1)?.name ?? null;
}

function printJson(response: JsonResponse) {
	console.log(JSON.stringify(response));
}

function printHuman(value: unknown) {
	if (Array.isArray(value)) {
		console.table(value);
		return;
	}
	console.log(value);
}

async function emitResponse(command: string, results?: unknown, targetHead?: string | null) {
	const executedMigrations = await getExecutedMigrations();
	const response: JsonResponse = {
		ok: true,
		command,
		currentHead: executedMigrations.filter(migration => migration.executedAt).at(-1)?.name ?? null,
		targetHead,
		executedMigrations,
		results,
	};

	if (jsonMode) {
		printJson(response);
		return;
	}

	if (Array.isArray(results) || (results && typeof results === "object")) {
		printHuman(results);
		return;
	}

	if (results != null) {
		printHuman(results);
		return;
	}

	printHuman(executedMigrations);
}

async function rollbackToMigration(target: string | null) {
	const migrator = await getMigrator();
	const migrations = await migrator.getMigrations();
	const executed = migrations.filter(migration => migration.executedAt).map(migration => migration.name);
	const desiredTarget = target === "zero" ? null : target;

	if (desiredTarget && !migrations.some(migration => migration.name === desiredTarget)) {
		throw new Error(`Unknown migration '${desiredTarget}'`);
	}

	const results: Array<{ migrationName: string; direction: "Down"; status: string }> = [];
	while ((await currentHead()) !== desiredTarget) {
		const response = await migrator.migrateDown();
		const migrationResults = response.results ?? [];
		results.push(...migrationResults.map(result => ({
			migrationName: result.migrationName,
			direction: "Down" as const,
			status: result.status,
		})));
		if (migrationResults.length === 0) {
			break;
		}
	}

	if (desiredTarget !== null && !executed.includes(desiredTarget) && (await currentHead()) !== desiredTarget) {
		throw new Error(`Failed to roll back to '${desiredTarget}'`);
	}

	return results;
}

async function main() {
	const command = args[0];
	const subArg = args[1];

	switch (command) {
		case "restore": {
			await DB.restore();
			await emitResponse("restore");
			return;
		}
		case "backup": {
			await DB.backup();
			await emitResponse("backup");
			return;
		}
		case "list": {
			await emitResponse("list", await getExecutedMigrations());
			return;
		}
		case "head": {
			await emitResponse("head", { head: await currentHead() });
			return;
		}
		case "latest": {
			const migrator = await getMigrator();
			const response = await migrator.migrateToLatest();
			await emitResponse("latest", response, await currentHead());
			return;
		}
		case "migrate_to": {
			if (!subArg) {
				throw new Error("Invalid migration name");
			}
			const migrator = await getMigrator();
			const response = await migrator.migrateTo(subArg);
			await emitResponse("migrate_to", response, subArg);
			return;
		}
		case "rollback_to": {
			if (!subArg) {
				throw new Error("Invalid migration name");
			}
			const response = await rollbackToMigration(subArg);
			await emitResponse("rollback_to", response, subArg === "zero" ? null : subArg);
			return;
		}
		case "rollback": {
			const migrator = await getMigrator();
			const response = await migrator.migrateDown();
			await emitResponse("rollback", response, await currentHead());
			return;
		}
		case "step": {
			const migrator = await getMigrator();
			const response = await migrator.migrateUp();
			await emitResponse("step", response, await currentHead());
			return;
		}
		case "drop": {
			const db = await DB.getInstance();
			const response = await sql`DROP SCHEMA public CASCADE`.execute(db);
			await emitResponse("drop", response);
			return;
		}
		case "init": {
			const db = await DB.getInstance();
			const response = await sql`
                    CREATE SCHEMA public;
                    GRANT ALL ON SCHEMA public TO public;
                `.execute(db);
			await emitResponse("init", response);
			return;
		}
		default: {
			const commands = {
				backup: "Backup current data into local json file",
				restore: "Reseed the database with the latest backup",
				list: "List all migrations",
				head: "Show the current executed migration head",
				latest: "Migrate to latest migration",
				"migrate_to 'file_name'": "Migrate to a specific migration",
				"rollback_to 'file_name|zero'": "Rollback to a specific migration or zero",
				rollback: "Rollback one migration",
				step: "Migrate one migration",
				drop: "Drop the public schema",
				init: "Create the public schema",
			};

			if (jsonMode) {
				printJson({
					ok: false,
					command: command ?? "",
					currentHead: await currentHead(),
					executedMigrations: await getExecutedMigrations(),
					results: commands,
				});
				return;
			}

			console.table(commands);
		}
	}
}

await main().catch(async error => {
	const message = formatErrorMessage(error);

	if (jsonMode) {
		try {
			printJson({
				ok: false,
				command: args[0] ?? "",
				currentHead: await currentHead(),
				targetHead: args[1] === "zero" ? null : args[1] ?? undefined,
				executedMigrations: await getExecutedMigrations(),
				results: { error: message },
			});
		} catch {
			console.log(JSON.stringify({
				ok: false,
				command: args[0] ?? "",
				currentHead: null,
				targetHead: args[1] === "zero" ? null : args[1] ?? undefined,
				executedMigrations: [],
				results: { error: message },
			}));
		}
	} else {
		console.error(error instanceof Error ? error : message);
	}

	process.exit(1);
}).finally(async () => {
	await DB.destroy();
});
