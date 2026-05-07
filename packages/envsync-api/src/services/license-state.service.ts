import { CacheClient } from "@/libs/cache";
import { DB } from "@/libs/db";
import { EditionPolicyService } from "@/services/edition-policy.service";
import { LicenseServerClient, type LicenseVerificationRequest, type LicenseVerificationResponse } from "@/services/license-server.client";
import { config } from "@/utils/env";

const LICENSE_STATE_ID = "default";
const LICENSE_CACHE_KEY = "envsync:license_state";
const HEARTBEAT_INTERVAL_MS = 60_000;

type LicenseStateTestOverrides = {
	server_url?: string;
	license_key?: string;
	install_fingerprint?: string;
	heartbeat_interval_ms?: number;
};

type PersistedLicenseStatus = "unknown" | "active" | "inactive" | "expired" | "error" | "locked";
type PersistedLicenseState = {
	id: string;
	status: PersistedLicenseStatus;
	signed_lease: string | null;
	lease_expires_at: Date | null;
	fingerprint: string | null;
	last_verified_at: Date | null;
	last_error_code: string | null;
	last_error_message: string | null;
	created_at: Date | null;
	updated_at: Date | null;
};

function toDate(value?: string | Date | null) {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value : new Date(value);
}

function normalizeState(value: Record<string, unknown>): PersistedLicenseState {
	return {
		id: String(value.id ?? LICENSE_STATE_ID),
		status: (value.status as PersistedLicenseStatus | undefined) ?? "unknown",
		signed_lease: (value.signed_lease as string | null | undefined) ?? null,
		lease_expires_at: toDate(value.lease_expires_at as string | Date | null | undefined),
		fingerprint: (value.fingerprint as string | null | undefined) ?? null,
		last_verified_at: toDate(value.last_verified_at as string | Date | null | undefined),
		last_error_code: (value.last_error_code as string | null | undefined) ?? null,
		last_error_message: (value.last_error_message as string | null | undefined) ?? null,
		created_at: toDate(value.created_at as string | Date | null | undefined),
		updated_at: toDate(value.updated_at as string | Date | null | undefined),
	};
}

function deriveRootDomain() {
	try {
		return new URL(config.DASHBOARD_URL).hostname;
	} catch {
		return undefined;
	}
}

export class LicenseStateService {
	static #heartbeatStarted = false;
	static #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	static #testOverrides: LicenseStateTestOverrides | null = null;

	private static async ensurePersistedStateRow() {
		const db = await DB.getInstance();
		let state = await db
			.selectFrom("license_state")
			.selectAll()
			.where("id", "=", LICENSE_STATE_ID)
			.executeTakeFirst();

		if (state) {
			return state;
		}

		const now = new Date();
		await db
			.insertInto("license_state")
			.values({
				id: LICENSE_STATE_ID,
				status: "unknown",
				signed_lease: null,
				lease_expires_at: null,
				fingerprint: this.getInstallFingerprint() || null,
				last_verified_at: null,
				last_error_code: null,
				last_error_message: null,
				created_at: now,
				updated_at: now,
			})
			.onConflict((oc) => oc.column("id").doNothing())
			.execute();

		state = await db
			.selectFrom("license_state")
			.selectAll()
			.where("id", "=", LICENSE_STATE_ID)
			.executeTakeFirstOrThrow();

		return state;
	}

	private static getHeartbeatIntervalMs() {
		return this.#testOverrides?.heartbeat_interval_ms ?? HEARTBEAT_INTERVAL_MS;
	}

	private static getServerUrl() {
		return this.#testOverrides?.server_url ?? config.ENVSYNC_LICENSE_SERVER_URL;
	}

	private static getLicenseKey() {
		return this.#testOverrides?.license_key ?? config.ENVSYNC_LICENSE_KEY ?? "";
	}

	private static getInstallFingerprint() {
		return this.#testOverrides?.install_fingerprint ?? config.ENVSYNC_INSTALL_FINGERPRINT ?? "";
	}

	public static setTestOverrides(overrides: LicenseStateTestOverrides) {
		this.#testOverrides = { ...overrides };
	}

	public static clearTestOverrides() {
		this.#testOverrides = null;
	}

	public static stopHeartbeatForTests() {
		if (this.#heartbeatTimer) {
			clearInterval(this.#heartbeatTimer);
			this.#heartbeatTimer = null;
		}
		this.#heartbeatStarted = false;
	}

	private static async persistCache(state: PersistedLicenseState) {
		await CacheClient.set(
			LICENSE_CACHE_KEY,
			JSON.stringify(state),
			Math.max(1, Math.ceil(this.getHeartbeatIntervalMs() / 1000)),
		);
	}

	public static async getLicenseState(): Promise<PersistedLicenseState> {
		const cached = await CacheClient.get(LICENSE_CACHE_KEY);
		if (cached) {
			return normalizeState(JSON.parse(cached) as Record<string, unknown>);
		}

		const state = await this.ensurePersistedStateRow();
		const normalized = normalizeState(state as unknown as Record<string, unknown>);
		await this.persistCache(normalized);
		return normalized;
	}

	public static async updateLicenseState(data: {
		status?: PersistedLicenseStatus;
		signed_lease?: string | null;
		lease_expires_at?: Date | null;
		fingerprint?: string | null;
		last_verified_at?: Date | null;
		last_error_code?: string | null;
		last_error_message?: string | null;
	}) {
		const db = await DB.getInstance();
		await this.getLicenseState();
		await this.ensurePersistedStateRow();
		await db
			.updateTable("license_state")
			.set({
				...data,
				updated_at: new Date(),
			})
			.where("id", "=", LICENSE_STATE_ID)
			.executeTakeFirstOrThrow();

		const state = await db
			.selectFrom("license_state")
			.selectAll()
			.where("id", "=", LICENSE_STATE_ID)
			.executeTakeFirstOrThrow();
		const normalized = normalizeState(state as unknown as Record<string, unknown>);
		await this.persistCache(normalized);
		return normalized;
	}

	public static async applyLicenseServerResponse(response: LicenseVerificationResponse) {
		return this.updateLicenseState({
			status: response.status,
			signed_lease: response.signed_lease ?? null,
			lease_expires_at: toDate(response.lease_expires_at),
			fingerprint: this.getInstallFingerprint() || null,
			last_verified_at: new Date(),
			last_error_code: response.reason_code ?? null,
			last_error_message: response.message ?? null,
		});
	}

	public static buildLicenseRequest(): LicenseVerificationRequest {
		return {
			license_key: this.getLicenseKey(),
			install_fingerprint: this.getInstallFingerprint(),
			edition: EditionPolicyService.getEdition(),
			root_domain: deriveRootDomain(),
			stack_name: config.ENVSYNC_STACK_NAME,
			release_version: config.ENVSYNC_RELEASE_VERSION,
		};
	}

	public static async activateLicense() {
		const response = await LicenseServerClient.activate(this.buildLicenseRequest(), this.getServerUrl());
		return this.applyLicenseServerResponse(response);
	}

	public static async verifyLicenseNow() {
		const response = await LicenseServerClient.verify(this.buildLicenseRequest(), this.getServerUrl());
		return this.applyLicenseServerResponse(response);
	}

	public static async getEnforcementDecision() {
		if (!EditionPolicyService.requiresEnterpriseLicense()) {
			return {
				required: false,
				locked: false,
				reason: null,
				state: await this.getLicenseState(),
			};
		}

		const state = await this.getLicenseState();
		const now = Date.now();
		const leaseExpiry = state.lease_expires_at ? new Date(state.lease_expires_at).getTime() : 0;
		const locked = state.status !== "active" || !leaseExpiry || leaseExpiry <= now;
		const reason = state.status !== "active"
			? state.last_error_code ?? "ENTERPRISE_LICENSE_INVALID"
			: !leaseExpiry || leaseExpiry <= now
				? "ENTERPRISE_LICENSE_EXPIRED"
				: null;

		return {
			required: true,
			locked,
			reason,
			state,
		};
	}

	public static async startHeartbeat() {
		if (this.#heartbeatStarted || !EditionPolicyService.requiresEnterpriseLicense()) {
			return;
		}

		if (!this.getServerUrl() || !this.getLicenseKey() || !this.getInstallFingerprint()) {
			await this.updateLicenseState({
				status: "error",
				last_error_code: "LICENSE_CONFIG_MISSING",
				last_error_message: "License enforcement is enabled but the license server configuration is incomplete.",
			});
			return;
		}

		this.#heartbeatStarted = true;
		const refresh = async () => {
			try {
				await this.verifyLicenseNow();
			} catch (error) {
				await this.updateLicenseState({
					status: "error",
					last_verified_at: new Date(),
					last_error_code: "LICENSE_SERVER_UNREACHABLE",
					last_error_message: error instanceof Error ? error.message : String(error),
				});
			}
		};

		await refresh();
		this.#heartbeatTimer = setInterval(() => {
			void refresh();
		}, this.getHeartbeatIntervalMs());
	}
}
