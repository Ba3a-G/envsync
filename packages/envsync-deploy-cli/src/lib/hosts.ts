import { runCommand } from "./shell";

function privilegePrefix(): string {
	return process.getuid?.() === 0 ? "" : "sudo ";
}

export function ensureHostsEntries(hosts: string[], address = "127.0.0.1"): void {
	if (hosts.length === 0) {
		return;
	}

	const begin = "# envsync-e2e begin";
	const end = "# envsync-e2e end";
	const lines = [
		begin,
		...hosts.map(host => `${address} ${host}`),
		end,
	];
	const payload = `${lines.join("\\n")}\\n`;
	const escaped = payload.replace(/'/g, `'\"'\"'`);

	runCommand("bash", [
		"-lc",
		`${privilegePrefix()}python3 - <<'PY'
from pathlib import Path
path = Path('/etc/hosts')
text = path.read_text()
begin = '${begin}'
end = '${end}'
payload = '${escaped}'.encode('utf-8').decode('unicode_escape')
start = text.find(begin)
stop = text.find(end)
if start != -1 and stop != -1 and stop > start:
    stop = text.find('\\n', stop)
    if stop == -1:
        stop = len(text)
    else:
        stop += 1
    text = text[:start] + text[stop:]
if text and not text.endswith('\\n'):
    text += '\\n'
text += payload
path.write_text(text)
PY`,
	]);
}
