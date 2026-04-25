import { appPointInTimePath } from "@/lib/app-routes";

export type PitMode = "snapshots" | "time-range";
export type PitRangePreset = "24h" | "7d" | "30d" | "all" | "custom";
export type PitDataKind = "variables" | "secrets";

export interface PitHistoryItem {
	id: string;
	org_id: string;
	app_id: string;
	env_type_id: string;
	change_request_message: string;
	user_id: string;
	created_at: string;
	updated_at: string;
	changes_count: number;
}

export interface PitHistoryResponse {
	pits: PitHistoryItem[];
	totalPages: number;
}

export interface PitStateItem {
	key: string;
	value: string;
	last_updated: string;
	operation?: "CREATE" | "UPDATE" | "DELETE";
}

export interface PitDiffResponse {
	added: Array<{ key: string; value: string }>;
	modified: Array<{ key: string; old_value: string; new_value: string }>;
	deleted: Array<{ key: string; value: string }>;
}

export interface PitRangeState {
	preset: PitRangePreset;
	start: string;
	end: string;
}

export interface PitDiffRow {
	type: "Added" | "Modified" | "Deleted";
	key: string;
	before: string;
	after: string;
}

export interface PitRangeSummary {
	total: number;
	earliest: PitHistoryItem | null;
	latest: PitHistoryItem | null;
}

const ALL_RANGE_START = "1970-01-01T00:00:00.000Z";
export const MASKED_PIT_VALUE = "[REDACTED]";

function pad(value: number) {
	return String(value).padStart(2, "0");
}

export function getPitKindFromPathname(pathname: string): PitDataKind {
	return pathname.includes("/secrets") ? "secrets" : "variables";
}

export function isSecretsPit(kind: PitDataKind) {
	return kind === "secrets";
}

export function getPitKindLabel(kind: PitDataKind) {
	return isSecretsPit(kind) ? "Secrets" : "Variables";
}

export function getPitItemLabel(kind: PitDataKind) {
	return isSecretsPit(kind) ? "secret" : "variable";
}

export function buildPitRoute(appId: string, kind: PitDataKind) {
	const basePath = appPointInTimePath(appId);
	return isSecretsPit(kind) ? `${basePath}/secrets` : basePath;
}

export function buildPitHref(appId: string, kind: PitDataKind, envSlug?: string | null) {
	const path = buildPitRoute(appId, kind);
	return envSlug ? `${path}?env=${encodeURIComponent(envSlug)}` : path;
}

export function maskPitValue(value: string, kind: PitDataKind) {
	return isSecretsPit(kind) ? MASKED_PIT_VALUE : value;
}

export function canSubmitPitRollback({
	expectedPitId,
	typedPitId,
	rollbackMessage,
}: {
	expectedPitId: string;
	typedPitId: string;
	rollbackMessage: string;
}) {
	return typedPitId.trim() === expectedPitId && rollbackMessage.trim().length > 0;
}

export function toLocalDateTimeInputValue(iso: string) {
	const date = new Date(iso);
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoFromLocalDateTime(value: string) {
	if (!value) return "";
	return new Date(value).toISOString();
}

export function createPresetRange(preset: PitRangePreset, now = new Date()): PitRangeState {
	const end = now.toISOString();

	if (preset === "custom") {
		return createDefaultTimeRange(now);
	}

	if (preset === "all") {
		return {
			preset,
			start: ALL_RANGE_START,
			end,
		};
	}

	const start = new Date(now);
	switch (preset) {
		case "24h":
			start.setHours(start.getHours() - 24);
			break;
		case "7d":
			start.setDate(start.getDate() - 7);
			break;
		case "30d":
			start.setDate(start.getDate() - 30);
			break;
	}

	return {
		preset,
		start: start.toISOString(),
		end,
	};
}

export function createDefaultTimeRange(now = new Date()) {
	return createPresetRange("7d", now);
}

export function getDefaultSnapshotCompareIds(
	history: PitHistoryItem[],
	preferredToId?: string | null
) {
	if (history.length === 0) {
		return { fromPitId: null, toPitId: null };
	}

	const preferredIndex = preferredToId
		? history.findIndex((pit) => pit.id === preferredToId)
		: -1;
	const toIndex = preferredIndex >= 0 ? preferredIndex : 0;
	const toPit = history[toIndex];
	const fallbackFromIndex = toIndex + 1 < history.length ? toIndex + 1 : toIndex === 0 ? 1 : toIndex - 1;
	const fromPit = history[fallbackFromIndex] ?? null;

	return {
		fromPitId: fromPit?.id ?? null,
		toPitId: toPit.id,
	};
}

export function buildPitDiffRows(diff: PitDiffResponse | null | undefined, kind: PitDataKind): PitDiffRow[] {
	if (!diff) return [];

	return [
		...diff.added.map((change) => ({
			type: "Added" as const,
			key: change.key,
			before: "Not set",
			after: maskPitValue(change.value, kind),
		})),
		...diff.modified.map((change) => ({
			type: "Modified" as const,
			key: change.key,
			before: maskPitValue(change.old_value, kind),
			after: maskPitValue(change.new_value, kind),
		})),
		...diff.deleted.map((change) => ({
			type: "Deleted" as const,
			key: change.key,
			before: maskPitValue(change.value, kind),
			after: "Not set",
		})),
	];
}

export function getPitRangeSummary(history: PitHistoryItem[]): PitRangeSummary {
	return {
		total: history.length,
		latest: history[0] ?? null,
		earliest: history[history.length - 1] ?? null,
	};
}

export function truncatePitId(id: string, size = 8) {
	return id.slice(0, size);
}

export function truncateMessage(message: string, max = 56) {
	if (message.length <= max) return message;
	return `${message.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function getPresetLabel(preset: PitRangePreset) {
	switch (preset) {
		case "24h":
			return "Last 24 hours";
		case "7d":
			return "Last 7 days";
		case "30d":
			return "Last 30 days";
		case "all":
			return "All recorded history";
		case "custom":
			return "Custom range";
	}
}
