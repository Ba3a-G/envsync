import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	EnvDiffRequest,
	EnvDiffResponse,
	EnvHistoryRequest,
	EnvHistoryResponse,
	EnvPitRequest,
	EnvPitStateResponse,
	EnvTimestampRangeDiffRequest,
	EnvTimestampRequest,
	VariableTimelineRequest,
	VariableTimelineResponse,
	SecretDiffRequest,
	SecretDiffResponse,
	SecretHistoryRequest,
	SecretHistoryResponse,
	SecretPitRequest,
	SecretPitStateResponse,
	SecretTimestampRangeDiffRequest,
	SecretTimestampRequest,
	SecretVariableTimelineRequest,
	SecretVariableTimelineResponse,
	RollbackResponse,
	RollbackSecretsResponse,
	RollbackToPitRequest,
	RollbackToTimestampRequest,
	RollbackSecretsToPitRequest,
	RollbackSecretsToTimestampRequest,
} from "@envsync-cloud/envsync-ts-sdk";
import { toast } from "sonner";

import type {
	PitDataKind,
	PitDiffResponse,
	PitHistoryResponse,
	PitStateItem,
} from "@/pages/PointInTimeVariables/pit.utils";
import { getPitItemLabel } from "@/pages/PointInTimeVariables/pit.utils";
import { sdk } from "./base";

type PitHistoryRequest = EnvHistoryRequest | SecretHistoryRequest;
type PitDiffRequest = EnvDiffRequest | SecretDiffRequest;
type PitTimestampRangeDiffRequest = EnvTimestampRangeDiffRequest | SecretTimestampRangeDiffRequest;
type PitRequest = EnvPitRequest | SecretPitRequest;
type PitTimestampRequest = EnvTimestampRequest | SecretTimestampRequest;
type PitRollbackToPitRequest = RollbackToPitRequest | RollbackSecretsToPitRequest;
type PitRollbackToTimestampRequest = RollbackToTimestampRequest | RollbackSecretsToTimestampRequest;
type PitRollbackResponse = RollbackResponse | RollbackSecretsResponse;

const pointInTimeServices = {
	variables: {
		getHistory: (params: EnvHistoryRequest) =>
			sdk.environmentVariablesPointInTime.getEnvHistory(params),
		getAtPit: (params: EnvPitRequest) =>
			sdk.environmentVariablesPointInTime.getEnvsAtPointInTime(params),
		getAtTimestamp: (params: EnvTimestampRequest) =>
			sdk.environmentVariablesPointInTime.getEnvsAtTimestamp(params),
		getDiff: (params: EnvDiffRequest) =>
			sdk.environmentVariablesPointInTime.getEnvDiff(params),
		getTimestampRangeDiff: (params: EnvTimestampRangeDiffRequest) =>
			sdk.environmentVariablesPointInTime.getEnvDiffByTimestampRange(params),
		getVariableTimeline: (params: VariableTimelineRequest) =>
			sdk.environmentVariablesPointInTime.getVariableTimeline(params.key, params),
		rollbackToPit: (params: RollbackToPitRequest) =>
			sdk.environmentVariablesRollback.rollbackEnvsToPitId(params),
		rollbackToTimestamp: (params: RollbackToTimestampRequest) =>
			sdk.environmentVariablesRollback.rollbackEnvsToTimestamp(params),
	},
	secrets: {
		getHistory: (params: SecretHistoryRequest) =>
			sdk.secretsPointInTime.getSecretHistory(params),
		getAtPit: (params: SecretPitRequest) =>
			sdk.secretsPointInTime.getSecretsAtPointInTime(params),
		getAtTimestamp: (params: SecretTimestampRequest) =>
			sdk.secretsPointInTime.getSecretsAtTimestamp(params),
		getDiff: (params: SecretDiffRequest) =>
			sdk.secretsPointInTime.getSecretDiff(params),
		getTimestampRangeDiff: (params: SecretTimestampRangeDiffRequest) =>
			sdk.secretsPointInTime.getSecretDiffByTimestampRange(params),
		getVariableTimeline: (params: SecretVariableTimelineRequest) =>
			sdk.secretsPointInTime.getSecretVariableTimeline(params.key, params),
		rollbackToPit: (params: RollbackSecretsToPitRequest) =>
			sdk.secretsRollback.rollbackSecretsToPitId(params),
		rollbackToTimestamp: (params: RollbackSecretsToTimestampRequest) =>
			sdk.secretsRollback.rollbackSecretsToTimestamp(params),
	},
} as const;

function normalizeHistoryResponse(
	response: EnvHistoryResponse | SecretHistoryResponse
): PitHistoryResponse {
	return {
		pits: response.pits.map((pit) => ({ ...pit })),
		totalPages: response.totalPages,
	};
}

function normalizePitStateResponse(
	response: EnvPitStateResponse | SecretPitStateResponse
): PitStateItem[] {
	return response.map((item) => ({
		key: item.key,
		value: item.value,
		last_updated: item.last_updated,
		operation: (item as PitStateItem).operation,
	}));
}

function normalizeDiffResponse(
	response: EnvDiffResponse | SecretDiffResponse
): PitDiffResponse {
	return {
		added: response.added.map((change) => ({ ...change })),
		modified: response.modified.map((change) => ({ ...change })),
		deleted: response.deleted.map((change) => ({ ...change })),
	};
}

export const buildPitHistoryQueryKey = (
	kind: PitDataKind,
	params: PitHistoryRequest
) => [
	"pit-history",
	kind,
	params.app_id,
	params.env_type_id,
	params.page ?? 1,
	params.per_page ?? 20,
	params.from_created_at ?? "none",
	params.to_created_at ?? "none",
];

export const buildPitTimestampRangeDiffQueryKey = (
	kind: PitDataKind,
	params: PitTimestampRangeDiffRequest
) => [
	"pit-diff-timestamp-range",
	kind,
	params.app_id,
	params.env_type_id,
	params.from_timestamp,
	params.to_timestamp,
];

export const usePointInTimeHistory = (
	kind: PitDataKind = "variables",
	params: PitHistoryRequest,
	options?: {
		enabled?: boolean;
		staleTime?: number;
	}
) => {
	return useQuery({
		queryKey: buildPitHistoryQueryKey(kind, params),
		queryFn: async (): Promise<PitHistoryResponse> => {
			const response =
				kind === "secrets"
					? await pointInTimeServices.secrets.getHistory(params as SecretHistoryRequest)
					: await pointInTimeServices.variables.getHistory(params as EnvHistoryRequest);
			return normalizeHistoryResponse(response);
		},
		enabled: options?.enabled ?? true,
		staleTime: options?.staleTime ?? 30000,
		retry: 3,
	});
};

export const useEnvsAtPit = (
	kind: PitDataKind = "variables",
	params: PitRequest,
	options?: {
		enabled?: boolean;
		staleTime?: number;
	}
) => {
	return useQuery({
		queryKey: ["pit-state", kind, params.app_id, params.env_type_id, params.pit_id],
		queryFn: async (): Promise<PitStateItem[]> => {
			const response =
				kind === "secrets"
					? await pointInTimeServices.secrets.getAtPit(params as SecretPitRequest)
					: await pointInTimeServices.variables.getAtPit(params as EnvPitRequest);
			return normalizePitStateResponse(response);
		},
		enabled: options?.enabled ?? true,
		staleTime: options?.staleTime ?? 60000,
		retry: 2,
	});
};

export const useEnvsAtTimestamp = (
	kind: PitDataKind = "variables",
	params: PitTimestampRequest,
	options?: {
		enabled?: boolean;
		staleTime?: number;
	}
) => {
	return useQuery({
		queryKey: ["pit-timestamp", kind, params.app_id, params.env_type_id, params.timestamp],
		queryFn: async (): Promise<PitStateItem[]> => {
			const response =
				kind === "secrets"
					? await pointInTimeServices.secrets.getAtTimestamp(params as SecretTimestampRequest)
					: await pointInTimeServices.variables.getAtTimestamp(params as EnvTimestampRequest);
			return normalizePitStateResponse(response);
		},
		enabled: options?.enabled ?? true,
		staleTime: options?.staleTime ?? 60000,
		retry: 2,
	});
};

export const usePointInTimeDiff = (kind: PitDataKind = "variables") => {
	return useMutation({
		mutationFn: async (params: PitDiffRequest): Promise<PitDiffResponse> => {
			const response =
				kind === "secrets"
					? await pointInTimeServices.secrets.getDiff(params as SecretDiffRequest)
					: await pointInTimeServices.variables.getDiff(params as EnvDiffRequest);
			return normalizeDiffResponse(response);
		},
		onError: (error) => {
			console.error("Failed to get PIT diff:", error);
			toast.error("Failed to compare point-in-time snapshots");
		},
	});
};

export const usePointInTimeTimestampRangeDiff = (kind: PitDataKind = "variables") => {
	return useMutation({
		mutationFn: async (
			params: PitTimestampRangeDiffRequest
		): Promise<PitDiffResponse> => {
			const response =
				kind === "secrets"
					? await pointInTimeServices.secrets.getTimestampRangeDiff(
							params as SecretTimestampRangeDiffRequest
					  )
					: await pointInTimeServices.variables.getTimestampRangeDiff(
							params as EnvTimestampRangeDiffRequest
					  );
			return normalizeDiffResponse(response);
		},
		onError: (error) => {
			console.error("Failed to get timestamp-range diff:", error);
			toast.error("Failed to compare the selected time range");
		},
	});
};

export const useVariableTimeline = (
	kind: PitDataKind = "variables",
	params: VariableTimelineRequest | SecretVariableTimelineRequest,
	options?: {
		enabled?: boolean;
		staleTime?: number;
	}
) => {
	return useQuery({
		queryKey: ["variable-timeline", kind, params.app_id, params.env_type_id, params.key],
		queryFn: async (): Promise<VariableTimelineResponse | SecretVariableTimelineResponse> => {
			return kind === "secrets"
				? pointInTimeServices.secrets.getVariableTimeline(params as SecretVariableTimelineRequest)
				: pointInTimeServices.variables.getVariableTimeline(params as VariableTimelineRequest);
		},
		enabled: options?.enabled ?? true,
		staleTime: options?.staleTime ?? 60000,
		retry: 2,
	});
};

export const usePointInTimeRollback = (kind: PitDataKind = "variables") => {
	const queryClient = useQueryClient();
	const itemLabel = getPitItemLabel(kind);

	const rollbackToPit = useMutation({
		mutationFn: async (params: PitRollbackToPitRequest): Promise<PitRollbackResponse> => {
			return kind === "secrets"
				? pointInTimeServices.secrets.rollbackToPit(params as RollbackSecretsToPitRequest)
				: pointInTimeServices.variables.rollbackToPit(params as RollbackToPitRequest);
		},
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["pit-history", kind, variables.app_id, variables.env_type_id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["project-environments", variables.app_id],
			});

			toast.success(`Successfully rolled back ${itemLabel}s to the selected snapshot`);
		},
		onError: (error) => {
			console.error("Failed to rollback to PIT:", error);
			toast.error(`Failed to rollback ${itemLabel}s to the selected snapshot`);
		},
	});

	const rollbackToTimestamp = useMutation({
		mutationFn: async (
			params: PitRollbackToTimestampRequest
		): Promise<PitRollbackResponse> => {
			return kind === "secrets"
				? pointInTimeServices.secrets.rollbackToTimestamp(
						params as RollbackSecretsToTimestampRequest
				  )
				: pointInTimeServices.variables.rollbackToTimestamp(
						params as RollbackToTimestampRequest
				  );
		},
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["pit-history", kind, variables.app_id, variables.env_type_id],
			});
			await queryClient.invalidateQueries({
				queryKey: ["project-environments", variables.app_id],
			});

			toast.success(`Successfully rolled back ${itemLabel}s to the selected timestamp`);
		},
		onError: (error) => {
			console.error("Failed to rollback to timestamp:", error);
			toast.error(`Failed to rollback ${itemLabel}s to the selected timestamp`);
		},
	});

	return {
		rollbackToPit,
		rollbackToTimestamp,
	};
};

export const useVariableRollback = () => {
	const queryClient = useQueryClient();

	const rollbackVariableToPit = useMutation({
		mutationFn: async (params: { key: string } & RollbackToPitRequest) => {
			const { key, ...rollbackParams } = params;
			return sdk.environmentVariablesRollback.rollbackVariableToPitId(key, rollbackParams);
		},
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["variable-timeline", "variables", variables.app_id, variables.env_type_id, variables.key],
			});
			await queryClient.invalidateQueries({
				queryKey: ["project-environments", variables.app_id],
			});

			toast.success(`Successfully rolled back variable "${variables.key}"`);
		},
		onError: (error) => {
			console.error("Failed to rollback variable:", error);
			toast.error("Failed to rollback variable");
		},
	});

	const rollbackVariableToTimestamp = useMutation({
		mutationFn: async (params: { key: string } & RollbackToTimestampRequest) => {
			const { key, ...rollbackParams } = params;
			return sdk.environmentVariablesRollback.rollbackVariableToTimestamp(key, rollbackParams);
		},
		onSuccess: async (_data, variables) => {
			await queryClient.invalidateQueries({
				queryKey: ["variable-timeline", "variables", variables.app_id, variables.env_type_id, variables.key],
			});
			await queryClient.invalidateQueries({
				queryKey: ["project-environments", variables.app_id],
			});

			toast.success(`Successfully rolled back variable "${variables.key}"`);
		},
		onError: (error) => {
			console.error("Failed to rollback variable:", error);
			toast.error("Failed to rollback variable");
		},
	});

	return {
		rollbackVariableToPit,
		rollbackVariableToTimestamp,
	};
};

export const pointInTimeApi = {
	buildPitHistoryQueryKey,
	buildPitTimestampRangeDiffQueryKey,
	usePointInTimeHistory,
	useEnvsAtPit,
	useEnvsAtTimestamp,
	usePointInTimeDiff,
	usePointInTimeTimestampRangeDiff,
	useVariableTimeline,
	usePointInTimeRollback,
	useVariableRollback,
};
