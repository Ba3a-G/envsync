function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string {
	if (typeof value === "string") {
		if (value.length === 0) return '""';
		if (/^[A-Za-z0-9._/@:-]+$/.test(value)) return value;
		return JSON.stringify(value);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (value === null || value === undefined) {
		return "null";
	}
	return JSON.stringify(value);
}

export function toYaml(value: unknown, indent = 0): string {
	const pad = " ".repeat(indent);

	if (Array.isArray(value)) {
		if (value.length === 0) return `${pad}[]`;
		return value
			.map(item => {
				if (isPlainObject(item) || Array.isArray(item)) {
					const nested = toYaml(item, indent + 2);
					return `${pad}-\n${nested}`;
				}
				return `${pad}- ${scalar(item)}`;
			})
			.join("\n");
	}

	if (isPlainObject(value)) {
		const entries = Object.entries(value);
		if (entries.length === 0) return `${pad}{}`;
		return entries
			.map(([key, nestedValue]) => {
				if (isPlainObject(nestedValue) || Array.isArray(nestedValue)) {
					return `${pad}${key}:\n${toYaml(nestedValue, indent + 2)}`;
				}
				return `${pad}${key}: ${scalar(nestedValue)}`;
			})
			.join("\n");
	}

	return `${pad}${scalar(value)}`;
}

export function parseSimpleYaml(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim() || line.trim().startsWith("#")) continue;
		const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
		if (!match) continue;
		out[match[1]] = match[2].replace(/^["']|["']$/g, "");
	}
	return out;
}
