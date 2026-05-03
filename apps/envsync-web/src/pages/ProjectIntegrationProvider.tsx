import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { sdk } from "@/api";
import {
  type EnterpriseProvider,
  useCreateEnvTypeMapping,
  useCreateIntegrationBinding,
  useCreateManualSyncRun,
  useEnvTypeMappings,
  useIntegrationBindings,
  useOrgSecrets,
  useProviderConnections,
  useSyncRuns,
  useUpdateEnvTypeMapping,
  useUpdateIntegrationBinding,
} from "@/api/enterprise/hooks";
import { Button } from "@/components/ui/button";
import { EnterpriseOrgAssetsPanel } from "@/components/enterprise/EnterpriseOrgAssetsPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { appIntegrationsPath, orgIntegrationsPath } from "@/lib/app-routes";
import {
  emptyFieldValues,
  enterpriseProviderUi,
  extractKnownFieldValues,
  mergeFieldValuesIntoRecord,
  omitKnownFields,
  type ProviderFieldConfig,
} from "@/lib/enterprise-provider-ui";

type FieldState = Record<string, string>;

type BindingDraft = {
  is_enabled: boolean;
  metadataFields: FieldState;
  metadataRaw: string;
};

type MappingDraft = {
  target_identifier: string;
  branch_ref: string;
  path_prefix: string;
  metadataFields: FieldState;
  metadataRaw: string;
};

function parseRecord(text: string) {
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function stringifyRecord(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function buildMetadata(
  fields: ProviderFieldConfig[],
  values: FieldState,
  raw: string,
) {
  return mergeFieldValuesIntoRecord(fields, values, parseRecord(raw));
}

function FieldHint({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-xs text-zinc-500">{text}</p>;
}

function ProviderFieldEditor({
  field,
  value,
  onChange,
  secretOptions = [],
}: {
  field: ProviderFieldConfig;
  value: string;
  onChange: (value: string) => void;
  secretOptions?: string[];
}) {
  const commonClassName = "flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";
  const listId = `${field.key}-secret-options`;

  return (
    <label className="space-y-2">
      <span className="text-sm text-zinc-400">{field.label}</span>
      {field.kind === "select" ? (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={commonClassName}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            list={field.kind === "secret-ref" ? listId : undefined}
          />
          {field.kind === "secret-ref" && secretOptions.length > 0 && (
            <datalist id={listId}>
              {secretOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
        </>
      )}
      <FieldHint text={field.helper} />
    </label>
  );
}

export default function ProjectIntegrationProvider() {
  const { appId = "" } = useParams();
  const location = useLocation();
  const providerId = (location.pathname.split("/").filter(Boolean).at(-1) ?? "github") as EnterpriseProvider;
  const copy = enterpriseProviderUi[providerId];

  const { data: project } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => sdk.applications.getApp(appId),
    enabled: Boolean(appId),
  });

  const envTypes = project?.env_types ?? [];
  const { data: providerConnections = [] } = useProviderConnections();
  const { data: orgSecrets = [] } = useOrgSecrets();
  const { data: bindings = [] } = useIntegrationBindings(appId);
  const { data: mappings = [] } = useEnvTypeMappings(appId);
  const { data: syncRuns = [] } = useSyncRuns(appId);

  const createBinding = useCreateIntegrationBinding(appId);
  const updateBinding = useUpdateIntegrationBinding(appId);
  const createMapping = useCreateEnvTypeMapping(appId);
  const updateMapping = useUpdateEnvTypeMapping(appId);
  const createManualSyncRun = useCreateManualSyncRun();

  const eligibleConnections = providerConnections.filter((entry) => entry.provider_type === providerId);
  const providerBindings = bindings.filter((entry) => entry.provider_type === providerId);
  const providerConnectionById = useMemo(
    () => Object.fromEntries(providerConnections.map((entry) => [entry.id, entry])),
    [providerConnections],
  );
  const providerMappings = useMemo(
    () => mappings.filter((mapping) => providerBindings.some((binding) => binding.id === mapping.integration_binding_id)),
    [mappings, providerBindings],
  );
  const providerSyncRuns = syncRuns.filter((run) => run.provider_type === providerId);
  const recentProviderSyncRuns = providerSyncRuns.slice(0, 8);
  const [selectedSyncRunId, setSelectedSyncRunId] = useState<string | null>(null);
  const orgSecretKeys = useMemo(() => orgSecrets.map((secret) => secret.key), [orgSecrets]);

  const [bindingForm, setBindingForm] = useState({
    provider_connection_id: "",
    metadataFields: emptyFieldValues(copy.bindingFields),
    metadataRaw: "{}",
  });
  const [mappingForm, setMappingForm] = useState({
    env_type_id: "",
    integration_binding_id: "",
    target_identifier: "",
    branch_ref: "",
    path_prefix: "",
    metadataFields: emptyFieldValues(copy.mappingFields),
    metadataRaw: "{}",
  });
  const [bindingDrafts, setBindingDrafts] = useState<Record<string, BindingDraft>>({});
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, MappingDraft>>({});

  useEffect(() => {
    if (providerSyncRuns.length === 0) {
      setSelectedSyncRunId(null);
      return;
    }

    if (!selectedSyncRunId || !providerSyncRuns.some((run) => run.id === selectedSyncRunId)) {
      setSelectedSyncRunId(providerSyncRuns[0]?.id ?? null);
    }
  }, [providerSyncRuns, selectedSyncRunId]);

  const selectedSyncRun = useMemo(
    () => providerSyncRuns.find((run) => run.id === selectedSyncRunId) ?? null,
    [providerSyncRuns, selectedSyncRunId],
  );
  const { data: selectedSyncAuditEvents = [] } = useSyncAuditEvents(selectedSyncRunId ?? undefined);
  const syncSummary = useMemo(() => ({
    total: providerSyncRuns.length,
    succeeded: providerSyncRuns.filter((run) => run.status === "succeeded").length,
    failed: providerSyncRuns.filter((run) => run.status === "failed").length,
    running: providerSyncRuns.filter((run) => run.status === "running" || run.status === "pending").length,
  }), [providerSyncRuns]);
  const auditSummary = useMemo(() => ({
    info: selectedSyncAuditEvents.filter((event) => event.result === "info").length,
    success: selectedSyncAuditEvents.filter((event) => event.result === "success").length,
    error: selectedSyncAuditEvents.filter((event) => event.result === "error").length,
  }), [selectedSyncAuditEvents]);

  useEffect(() => {
    setBindingForm((prev) => ({
      ...prev,
      metadataFields: emptyFieldValues(copy.bindingFields),
      metadataRaw: "{}",
    }));
    setMappingForm((prev) => ({
      ...prev,
      metadataFields: emptyFieldValues(copy.mappingFields),
      metadataRaw: "{}",
    }));
  }, [copy.bindingFields, copy.mappingFields]);

  useEffect(() => {
    if (!bindingForm.provider_connection_id && eligibleConnections.length > 0) {
      setBindingForm((prev) => ({ ...prev, provider_connection_id: eligibleConnections[0]?.id ?? "" }));
    }
  }, [bindingForm.provider_connection_id, eligibleConnections]);

  useEffect(() => {
    if (!mappingForm.integration_binding_id && providerBindings.length > 0) {
      setMappingForm((prev) => ({ ...prev, integration_binding_id: providerBindings[0]?.id ?? "" }));
    }
  }, [mappingForm.integration_binding_id, providerBindings]);

  useEffect(() => {
    if (!mappingForm.env_type_id && envTypes.length > 0) {
      setMappingForm((prev) => ({ ...prev, env_type_id: envTypes[0]?.id ?? "" }));
    }
  }, [envTypes, mappingForm.env_type_id]);

  useEffect(() => {
    setBindingDrafts(
      Object.fromEntries(
        providerBindings.map((binding) => [
          binding.id,
          {
            is_enabled: binding.is_enabled,
            metadataFields: extractKnownFieldValues(binding.metadata, copy.bindingFields),
            metadataRaw: stringifyRecord(omitKnownFields(binding.metadata, copy.bindingFields)),
          },
        ]),
      ),
    );
  }, [copy.bindingFields, providerBindings]);

  useEffect(() => {
    setMappingDrafts(
      Object.fromEntries(
        providerMappings.map((mapping) => [
          mapping.id,
          {
            target_identifier: mapping.target_identifier,
            branch_ref: mapping.branch_ref ?? "",
            path_prefix: mapping.path_prefix ?? "",
            metadataFields: extractKnownFieldValues(mapping.metadata, copy.mappingFields),
            metadataRaw: stringifyRecord(omitKnownFields(mapping.metadata, copy.mappingFields)),
          },
        ]),
      ),
    );
  }, [copy.mappingFields, providerMappings]);

  const onCreateBinding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!bindingForm.provider_connection_id) {
      toast.error("Select a provider connection first.");
      return;
    }

    try {
      await createBinding.mutateAsync({
        provider_connection_id: bindingForm.provider_connection_id,
        provider_type: providerId,
        metadata: buildMetadata(copy.bindingFields, bindingForm.metadataFields, bindingForm.metadataRaw),
      });
      setBindingForm((prev) => ({
        ...prev,
        metadataFields: emptyFieldValues(copy.bindingFields),
        metadataRaw: "{}",
      }));
      toast.success("Integration binding created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create integration binding.");
    }
  };

  const onCreateMapping = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mappingForm.env_type_id || !mappingForm.integration_binding_id || !mappingForm.target_identifier) {
      toast.error("Choose an environment type, binding, and target identifier.");
      return;
    }

    try {
      await createMapping.mutateAsync({
        env_type_id: mappingForm.env_type_id,
        integration_binding_id: mappingForm.integration_binding_id,
        target_identifier: mappingForm.target_identifier,
        branch_ref: copy.usesBranch ? mappingForm.branch_ref || null : null,
        path_prefix: copy.usesPath ? mappingForm.path_prefix || null : null,
        metadata: buildMetadata(copy.mappingFields, mappingForm.metadataFields, mappingForm.metadataRaw),
      });
      setMappingForm((prev) => ({
        ...prev,
        target_identifier: "",
        branch_ref: "",
        path_prefix: "",
        metadataFields: emptyFieldValues(copy.mappingFields),
        metadataRaw: "{}",
      }));
      toast.success("Environment mapping created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create environment mapping.");
    }
  };

  const onRequestSync = async () => {
    try {
      await createManualSyncRun.mutateAsync({
        app_id: appId,
        provider_type: providerId,
        metadata: {
          source: "dashboard",
        },
      });
      toast.success("Manual sync requested.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request manual sync.");
    }
  };

  const onRetrySync = async (run: { id: string; app_id?: string | null; provider_type: EnterpriseProvider; metadata?: Record<string, unknown> }) => {
    try {
      await createManualSyncRun.mutateAsync({
        app_id: run.app_id ?? appId,
        provider_type: run.provider_type,
        metadata: {
          ...(run.metadata ?? {}),
          source: "dashboard-retry",
          retry_of: run.id,
        },
      });
      toast.success("Retry sync requested.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry sync.");
    }
  };

  const onSaveBinding = async (bindingId: string) => {
    const draft = bindingDrafts[bindingId];
    if (!draft) return;

    try {
      await updateBinding.mutateAsync({
        id: bindingId,
        is_enabled: draft.is_enabled,
        metadata: buildMetadata(copy.bindingFields, draft.metadataFields, draft.metadataRaw),
      });
      toast.success("Binding updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update binding.");
    }
  };

  const onSaveMapping = async (mappingId: string) => {
    const draft = mappingDrafts[mappingId];
    if (!draft) return;

    try {
      await updateMapping.mutateAsync({
        id: mappingId,
        target_identifier: draft.target_identifier,
        branch_ref: copy.usesBranch ? draft.branch_ref || null : null,
        path_prefix: copy.usesPath ? draft.path_prefix || null : null,
        metadata: buildMetadata(copy.mappingFields, draft.metadataFields, draft.metadataRaw),
      });
      toast.success("Mapping updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update mapping.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div className="space-y-3">
        <Link to={appIntegrationsPath(appId)} className="text-sm text-emerald-300 underline underline-offset-4">
          Back to integrations
        </Link>
        <h1 className="text-3xl font-semibold text-white">
          {copy.title}{project?.name ? ` for ${project.name}` : ""}
        </h1>
        <p className="max-w-4xl text-sm text-zinc-400">
          Configure provider connections, org secrets, app bindings, and environment routing rules in-context for this project.
          Shared asset cleanup still lives in{" "}
          <Link className="text-emerald-300 underline underline-offset-4" to={orgIntegrationsPath()}>
            organization integrations
          </Link>.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Connections</p>
          <p className="mt-3 text-3xl font-semibold text-white">{eligibleConnections.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Org-level {providerId} connections available for binding.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Bindings</p>
          <p className="mt-3 text-3xl font-semibold text-white">{providerBindings.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Provider links already attached to this application.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Env mappings</p>
          <p className="mt-3 text-3xl font-semibold text-white">{providerMappings.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Environment-type rules currently registered for this provider.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Org secrets</p>
          <p className="mt-3 text-3xl font-semibold text-white">{orgSecrets.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Reusable secret references available to this organization.</p>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">App binding</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Choose the org-level provider credential this app should use, then capture the provider-specific binding details.
              </p>
            </div>
            <Button onClick={onRequestSync} className="bg-emerald-500 text-white hover:bg-emerald-600">
              Trigger manual sync
            </Button>
          </div>

          <form onSubmit={onCreateBinding} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-connection">Provider connection</Label>
              <select
                id="provider-connection"
                value={bindingForm.provider_connection_id}
                onChange={(event) => setBindingForm((prev) => ({ ...prev, provider_connection_id: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Select connection</option>
                {eligibleConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name} ({connection.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {copy.bindingFields.map((field) => (
                <ProviderFieldEditor
                  key={field.key}
                  field={field}
                  value={bindingForm.metadataFields[field.key] ?? ""}
                  onChange={(value) =>
                    setBindingForm((prev) => ({
                      ...prev,
                      metadataFields: {
                        ...prev.metadataFields,
                        [field.key]: value,
                      },
                    }))
                  }
                  secretOptions={field.kind === "secret-ref" ? orgSecretKeys : undefined}
                />
              ))}
            </div>

            <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced binding metadata JSON</summary>
              <div className="mt-4 space-y-2">
                <Label htmlFor="binding-metadata-raw">Additional metadata</Label>
                <Textarea
                  id="binding-metadata-raw"
                  value={bindingForm.metadataRaw}
                  onChange={(event) => setBindingForm((prev) => ({ ...prev, metadataRaw: event.target.value }))}
                  className="min-h-[120px]"
                />
              </div>
            </details>

            <Button type="submit" disabled={createBinding.isPending || eligibleConnections.length === 0}>
              Create binding
            </Button>
          </form>

          <div className="mt-6 space-y-4">
            {providerBindings.map((binding) => {
              const draft = bindingDrafts[binding.id] ?? {
                is_enabled: binding.is_enabled,
                metadataFields: extractKnownFieldValues(binding.metadata, copy.bindingFields),
                metadataRaw: stringifyRecord(omitKnownFields(binding.metadata, copy.bindingFields)),
              };
              const connection = providerConnectionById[binding.provider_connection_id];

              return (
                <div key={binding.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{connection?.name ?? binding.provider_connection_id}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {binding.provider_type} · created {new Date(binding.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {draft.is_enabled ? "enabled" : "disabled"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
                    <label className="space-y-2">
                      <span className="text-sm text-zinc-400">Enabled</span>
                      <select
                        value={draft.is_enabled ? "enabled" : "disabled"}
                        onChange={(event) =>
                          setBindingDrafts((prev) => ({
                            ...prev,
                            [binding.id]: {
                              ...draft,
                              is_enabled: event.target.value === "enabled",
                            },
                          }))
                        }
                        className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                      >
                        <option value="enabled">enabled</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </label>
                    <div className="grid gap-4 md:grid-cols-2">
                      {copy.bindingFields.map((field) => (
                        <ProviderFieldEditor
                          key={`${binding.id}-${field.key}`}
                          field={field}
                          value={draft.metadataFields[field.key] ?? ""}
                          onChange={(value) =>
                            setBindingDrafts((prev) => ({
                              ...prev,
                              [binding.id]: {
                                ...draft,
                                metadataFields: {
                                  ...draft.metadataFields,
                                  [field.key]: value,
                                },
                              },
                            }))
                          }
                          secretOptions={field.kind === "secret-ref" ? orgSecretKeys : undefined}
                        />
                      ))}
                    </div>
                  </div>

                  <details className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced binding metadata JSON</summary>
                    <div className="mt-4 space-y-2">
                      <Textarea
                        value={draft.metadataRaw}
                        onChange={(event) =>
                          setBindingDrafts((prev) => ({
                            ...prev,
                            [binding.id]: {
                              ...draft,
                              metadataRaw: event.target.value,
                            },
                          }))
                        }
                        className="min-h-[110px]"
                      />
                    </div>
                  </details>

                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateBinding.isPending}
                      onClick={() => void onSaveBinding(binding.id)}
                    >
                      Save binding
                    </Button>
                  </div>
                </div>
              );
            })}
            {providerBindings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                No bindings for this provider yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <h2 className="text-xl font-semibold text-white">Environment mappings</h2>
          <p className="mt-2 text-sm text-zinc-400">{copy.helper}</p>

          <form onSubmit={onCreateMapping} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mapping-binding">Binding</Label>
              <select
                id="mapping-binding"
                value={mappingForm.integration_binding_id}
                onChange={(event) => setMappingForm((prev) => ({ ...prev, integration_binding_id: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Select binding</option>
                {providerBindings.map((binding) => {
                  const connection = providerConnectionById[binding.provider_connection_id];
                  return (
                    <option key={binding.id} value={binding.id}>
                      {connection?.name ?? `${binding.id.slice(0, 8)}...`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mapping-env-type">Environment type</Label>
              <select
                id="mapping-env-type"
                value={mappingForm.env_type_id}
                onChange={(event) => setMappingForm((prev) => ({ ...prev, env_type_id: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Select environment type</option>
                {envTypes.map((envType) => (
                  <option key={envType.id} value={envType.id}>
                    {envType.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-identifier">{copy.targetLabel}</Label>
              <Input
                id="target-identifier"
                value={mappingForm.target_identifier}
                onChange={(event) => setMappingForm((prev) => ({ ...prev, target_identifier: event.target.value }))}
                placeholder={copy.targetPlaceholder}
              />
            </div>
            {(copy.usesBranch || copy.usesPath) && (
              <div className={`grid gap-4 ${copy.usesBranch && copy.usesPath ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                {copy.usesBranch && (
                  <div className="space-y-2">
                    <Label htmlFor="branch-ref">{copy.branchLabel}</Label>
                    <Input
                      id="branch-ref"
                      value={mappingForm.branch_ref}
                      onChange={(event) => setMappingForm((prev) => ({ ...prev, branch_ref: event.target.value }))}
                      placeholder={copy.branchPlaceholder}
                    />
                  </div>
                )}
                {copy.usesPath && (
                  <div className="space-y-2">
                    <Label htmlFor="path-prefix">{copy.pathLabel}</Label>
                    <Input
                      id="path-prefix"
                      value={mappingForm.path_prefix}
                      onChange={(event) => setMappingForm((prev) => ({ ...prev, path_prefix: event.target.value }))}
                      placeholder={copy.pathPlaceholder}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {copy.mappingFields.map((field) => (
                <ProviderFieldEditor
                  key={field.key}
                  field={field}
                  value={mappingForm.metadataFields[field.key] ?? ""}
                  onChange={(value) =>
                    setMappingForm((prev) => ({
                      ...prev,
                      metadataFields: {
                        ...prev.metadataFields,
                        [field.key]: value,
                      },
                    }))
                  }
                  secretOptions={field.kind === "secret-ref" ? orgSecretKeys : undefined}
                />
              ))}
            </div>

            <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced mapping metadata JSON</summary>
              <div className="mt-4 space-y-2">
                <Label htmlFor="mapping-metadata-raw">Additional metadata</Label>
                <Textarea
                  id="mapping-metadata-raw"
                  value={mappingForm.metadataRaw}
                  onChange={(event) => setMappingForm((prev) => ({ ...prev, metadataRaw: event.target.value }))}
                  className="min-h-[120px]"
                />
              </div>
            </details>

            <Button type="submit" disabled={createMapping.isPending || providerBindings.length === 0 || envTypes.length === 0}>
              Create mapping
            </Button>
          </form>
        </section>

      </div>

      <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
        <h2 className="text-xl font-semibold text-white">Shared provider assets</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Create and edit the organization-level provider credentials and secret references used by this project without leaving the current flow.
        </p>

        <div className="mt-6">
          <EnterpriseOrgAssetsPanel providerFilter={providerId} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
        <h2 className="text-xl font-semibold text-white">Current mappings and recent sync runs</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {providerMappings.map((mapping) => {
              const envType = envTypes.find((entry) => entry.id === mapping.env_type_id);
              const binding = providerBindings.find((entry) => entry.id === mapping.integration_binding_id);
              const connection = binding ? providerConnectionById[binding.provider_connection_id] : null;
              const draft = mappingDrafts[mapping.id] ?? {
                target_identifier: mapping.target_identifier,
                branch_ref: mapping.branch_ref ?? "",
                path_prefix: mapping.path_prefix ?? "",
                metadataFields: extractKnownFieldValues(mapping.metadata, copy.mappingFields),
                metadataRaw: stringifyRecord(omitKnownFields(mapping.metadata, copy.mappingFields)),
              };

              return (
                <div key={mapping.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{envType?.name ?? mapping.env_type_id}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        binding: {connection?.name ?? binding?.provider_connection_id ?? mapping.integration_binding_id}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      updated {new Date(mapping.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4">
                    <label className="space-y-2">
                      <span className="text-sm text-zinc-400">{copy.targetLabel}</span>
                      <Input
                        value={draft.target_identifier}
                        onChange={(event) =>
                          setMappingDrafts((prev) => ({
                            ...prev,
                            [mapping.id]: {
                              ...draft,
                              target_identifier: event.target.value,
                            },
                          }))
                        }
                        placeholder={copy.targetPlaceholder}
                      />
                    </label>

                    {(copy.usesBranch || copy.usesPath) && (
                      <div className={`grid gap-4 ${copy.usesBranch && copy.usesPath ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                        {copy.usesBranch && (
                          <label className="space-y-2">
                            <span className="text-sm text-zinc-400">{copy.branchLabel}</span>
                            <Input
                              value={draft.branch_ref}
                              onChange={(event) =>
                                setMappingDrafts((prev) => ({
                                  ...prev,
                                  [mapping.id]: {
                                    ...draft,
                                    branch_ref: event.target.value,
                                  },
                                }))
                              }
                              placeholder={copy.branchPlaceholder}
                            />
                          </label>
                        )}
                        {copy.usesPath && (
                          <label className="space-y-2">
                            <span className="text-sm text-zinc-400">{copy.pathLabel}</span>
                            <Input
                              value={draft.path_prefix}
                              onChange={(event) =>
                                setMappingDrafts((prev) => ({
                                  ...prev,
                                  [mapping.id]: {
                                    ...draft,
                                    path_prefix: event.target.value,
                                  },
                                }))
                              }
                              placeholder={copy.pathPlaceholder}
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      {copy.mappingFields.map((field) => (
                        <ProviderFieldEditor
                          key={`${mapping.id}-${field.key}`}
                          field={field}
                          value={draft.metadataFields[field.key] ?? ""}
                          onChange={(value) =>
                            setMappingDrafts((prev) => ({
                              ...prev,
                              [mapping.id]: {
                                ...draft,
                                metadataFields: {
                                  ...draft.metadataFields,
                                  [field.key]: value,
                                },
                              },
                            }))
                          }
                          secretOptions={field.kind === "secret-ref" ? orgSecretKeys : undefined}
                        />
                      ))}
                    </div>

                    <details className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
                      <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced mapping metadata JSON</summary>
                      <div className="mt-4 space-y-2">
                        <Textarea
                          value={draft.metadataRaw}
                          onChange={(event) =>
                            setMappingDrafts((prev) => ({
                              ...prev,
                              [mapping.id]: {
                                ...draft,
                                metadataRaw: event.target.value,
                              },
                            }))
                          }
                          className="min-h-[120px]"
                        />
                      </div>
                    </details>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateMapping.isPending}
                      onClick={() => void onSaveMapping(mapping.id)}
                    >
                      Save mapping
                    </Button>
                  </div>
                </div>
              );
            })}
            {providerMappings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                No env mappings for this provider yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Total runs</p>
                <p className="mt-2 text-2xl font-semibold text-white">{syncSummary.total}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Succeeded</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-200">{syncSummary.succeeded}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Failed</p>
                <p className="mt-2 text-2xl font-semibold text-rose-200">{syncSummary.failed}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Running</p>
                <p className="mt-2 text-2xl font-semibold text-sky-200">{syncSummary.running}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">Selected sync run</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {selectedSyncRun ? `${selectedSyncRun.id} · ${selectedSyncRun.status}` : "Select a sync run below."}
                  </p>
                </div>
                {selectedSyncRun && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={createManualSyncRun.isPending}
                    onClick={() => void onRetrySync(selectedSyncRun)}
                  >
                    Retry run
                  </Button>
                )}
              </div>

              {selectedSyncRun && (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Info</p>
                      <p className="mt-2 text-xl font-semibold text-zinc-100">{auditSummary.info}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Success</p>
                      <p className="mt-2 text-xl font-semibold text-emerald-200">{auditSummary.success}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Error</p>
                      <p className="mt-2 text-xl font-semibold text-rose-200">{auditSummary.error}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-zinc-400">
                      Started {new Date(selectedSyncRun.started_at).toLocaleString()}
                      {selectedSyncRun.completed_at ? ` · completed ${new Date(selectedSyncRun.completed_at).toLocaleString()}` : ""}
                    </p>
                    {selectedSyncRun.error_message && (
                      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
                        {selectedSyncRun.error_message}
                      </div>
                    )}
                    <div className="max-h-72 space-y-3 overflow-auto pr-1">
                      {selectedSyncAuditEvents.length > 0 ? selectedSyncAuditEvents.map((event) => (
                        <div key={event.id} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-white">{event.action}</p>
                            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">{event.result}</span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{new Date(event.created_at).toLocaleString()}</p>
                          <pre className="mt-3 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-zinc-300">{JSON.stringify(event.details, null, 2)}</pre>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                          No audit events recorded for this run yet.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {recentProviderSyncRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedSyncRunId(run.id)}
                className={`w-full rounded-2xl border bg-black/20 p-4 text-left transition-colors ${
                  selectedSyncRunId === run.id ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium text-white">{run.id.slice(0, 8)}...</p>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">{run.status}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{new Date(run.started_at).toLocaleString()}</p>
                {run.error_message && <p className="mt-2 text-sm text-rose-300">{run.error_message}</p>}
              </button>
            ))}
            {recentProviderSyncRuns.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                No sync runs recorded for this provider yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
