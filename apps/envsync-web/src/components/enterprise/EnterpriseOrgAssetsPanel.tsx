import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { sdk } from "@/api";
import {
  listIntegrationBindings,
  useCreateOrgSecret,
  useCreateProviderConnection,
  useOrgSecrets,
  useProviderConnections,
  useUpdateOrgSecret,
  useUpdateProviderConnection,
} from "@/api/enterprise/hooks";
import type { EnterpriseProvider, OrgSecret, ProviderConnection } from "@/api/enterprise/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyFieldValues,
  enterpriseProviderUi,
  extractKnownFieldValues,
  mergeFieldValuesIntoRecord,
  omitKnownFields,
  type ProviderFieldConfig,
} from "@/lib/enterprise-provider-ui";

type FieldState = Record<string, string>;

type ProviderConnectionDraft = {
  name: string;
  status: "active" | "inactive" | "error";
  authFields: FieldState;
  metadataFields: FieldState;
  authRaw: string;
  metadataRaw: string;
};

type OrgSecretDraft = {
  value: string;
  description: string;
  providerRefs: string;
  rotationPolicy: string;
  metadataRaw: string;
};

function parseRecord(text: string) {
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function stringifyRecord(value: Record<string, unknown>) {
  return JSON.stringify(value ?? {}, null, 2);
}

function omitSecretMetadata(metadata: Record<string, unknown> | undefined) {
  const next = { ...(metadata ?? {}) };
  delete next.provider_refs;
  delete next.rotation_policy;
  return next;
}

function secretProviderRefs(secret: OrgSecret) {
  return Array.isArray(secret.metadata?.provider_refs)
    ? secret.metadata.provider_refs.filter((value): value is string => typeof value === "string")
    : [];
}

function isSecretRelevant(secret: OrgSecret, providerFilter?: EnterpriseProvider) {
  if (!providerFilter) return true;
  const refs = secretProviderRefs(secret);
  return refs.length === 0 || refs.includes(providerFilter);
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

export function EnterpriseOrgAssetsPanel({
  providerFilter,
  compact = false,
  showUsage = false,
}: {
  providerFilter?: EnterpriseProvider;
  compact?: boolean;
  showUsage?: boolean;
}) {
  const [providerForm, setProviderForm] = useState({
    provider_type: providerFilter ?? ("github" as EnterpriseProvider),
    name: "",
    status: "active" as "active" | "inactive" | "error",
    authFields: emptyFieldValues(enterpriseProviderUi[providerFilter ?? "github"].connectionAuthFields),
    metadataFields: emptyFieldValues(enterpriseProviderUi[providerFilter ?? "github"].connectionMetadataFields),
    authRaw: "{}",
    metadataRaw: "{}",
  });
  const [orgSecretForm, setOrgSecretForm] = useState({
    key: "",
    value: "",
    description: "",
    providerRefs: providerFilter ?? "",
    rotationPolicy: "manual",
    metadataRaw: "{}",
  });
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, ProviderConnectionDraft>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, OrgSecretDraft>>({});

  const providerConfig = enterpriseProviderUi[providerForm.provider_type];
  const { data: providerConnections = [] } = useProviderConnections();
  const { data: orgSecrets = [] } = useOrgSecrets();
  const createProviderConnection = useCreateProviderConnection();
  const updateProviderConnection = useUpdateProviderConnection();
  const createOrgSecret = useCreateOrgSecret();
  const updateOrgSecret = useUpdateOrgSecret();
  const orgSecretKeys = useMemo(() => orgSecrets.map((secret) => secret.key), [orgSecrets]);

  const filteredConnections = useMemo(
    () => providerConnections.filter((connection) => !providerFilter || connection.provider_type === providerFilter),
    [providerConnections, providerFilter],
  );
  const filteredSecrets = useMemo(
    () => orgSecrets.filter((secret) => isSecretRelevant(secret, providerFilter)),
    [orgSecrets, providerFilter],
  );

  useEffect(() => {
    if (!providerFilter) return;
    setProviderForm((prev) => ({
      ...prev,
      provider_type: providerFilter,
      authFields: emptyFieldValues(enterpriseProviderUi[providerFilter].connectionAuthFields),
      metadataFields: emptyFieldValues(enterpriseProviderUi[providerFilter].connectionMetadataFields),
      authRaw: "{}",
      metadataRaw: "{}",
    }));
    setOrgSecretForm((prev) => ({
      ...prev,
      providerRefs: providerFilter,
    }));
  }, [providerFilter]);

  useEffect(() => {
    if (providerFilter) return;
    setProviderForm((prev) => ({
      ...prev,
      authFields: emptyFieldValues(providerConfig.connectionAuthFields),
      metadataFields: emptyFieldValues(providerConfig.connectionMetadataFields),
      authRaw: "{}",
      metadataRaw: "{}",
    }));
  }, [providerConfig, providerFilter]);

  useEffect(() => {
    setConnectionDrafts(
      Object.fromEntries(
        filteredConnections.map((connection) => {
          const config = enterpriseProviderUi[connection.provider_type];
          return [
            connection.id,
            {
              name: connection.name,
              status: connection.status,
              authFields: extractKnownFieldValues(connection.auth_config, config.connectionAuthFields),
              metadataFields: extractKnownFieldValues(connection.metadata, config.connectionMetadataFields),
              authRaw: stringifyRecord(omitKnownFields(connection.auth_config, config.connectionAuthFields)),
              metadataRaw: stringifyRecord(omitKnownFields(connection.metadata, config.connectionMetadataFields)),
            },
          ];
        }),
      ),
    );
  }, [filteredConnections]);

  useEffect(() => {
    setSecretDrafts(
      Object.fromEntries(
        filteredSecrets.map((secret) => [
          secret.id,
          {
            value: secret.value,
            description: secret.description ?? "",
            providerRefs: secretProviderRefs(secret).join(", "),
            rotationPolicy: typeof secret.metadata?.rotation_policy === "string" ? secret.metadata.rotation_policy : "manual",
            metadataRaw: stringifyRecord(omitSecretMetadata(secret.metadata)),
          },
        ]),
      ),
    );
  }, [filteredSecrets]);

  const { data: apps = [] } = useQuery({
    queryKey: ["applications", "all"],
    queryFn: () => sdk.applications.getApps(),
    enabled: showUsage,
  });
  const bindingQueries = useQueries({
    queries: showUsage
      ? apps.map((app) => ({
          queryKey: ["enterprise", "bindings", app.id],
          queryFn: () => listIntegrationBindings(app.id),
        }))
      : [],
  });
  const connectionUsage = useMemo(() => {
    const usage = new Map<string, Array<{ id: string; name: string }>>();
    if (!showUsage) return usage;

    for (const [index, app] of apps.entries()) {
      const bindings = bindingQueries[index]?.data ?? [];
      for (const binding of bindings) {
        const existing = usage.get(binding.provider_connection_id) ?? [];
        if (!existing.some((entry) => entry.id === app.id)) {
          existing.push({ id: app.id, name: app.name });
          usage.set(binding.provider_connection_id, existing);
        }
      }
    }

    return usage;
  }, [apps, bindingQueries, showUsage]);

  const handleCreateProviderConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await createProviderConnection.mutateAsync({
        provider_type: providerForm.provider_type,
        name: providerForm.name,
        status: providerForm.status,
        auth_config: mergeFieldValuesIntoRecord(
          providerConfig.connectionAuthFields,
          providerForm.authFields,
          parseRecord(providerForm.authRaw),
        ),
        metadata: mergeFieldValuesIntoRecord(
          providerConfig.connectionMetadataFields,
          providerForm.metadataFields,
          parseRecord(providerForm.metadataRaw),
        ),
      });
      setProviderForm({
        provider_type: providerFilter ?? providerForm.provider_type,
        name: "",
        status: "active",
        authFields: emptyFieldValues(providerConfig.connectionAuthFields),
        metadataFields: emptyFieldValues(providerConfig.connectionMetadataFields),
        authRaw: "{}",
        metadataRaw: "{}",
      });
      toast.success("Provider connection created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create provider connection.");
    }
  };

  const handleUpdateProviderConnection = async (connection: ProviderConnection) => {
    const draft = connectionDrafts[connection.id];
    if (!draft) return;
    const config = enterpriseProviderUi[connection.provider_type];

    try {
      await updateProviderConnection.mutateAsync({
        id: connection.id,
        name: draft.name,
        status: draft.status,
        auth_config: mergeFieldValuesIntoRecord(
          config.connectionAuthFields,
          draft.authFields,
          parseRecord(draft.authRaw),
        ),
        metadata: mergeFieldValuesIntoRecord(
          config.connectionMetadataFields,
          draft.metadataFields,
          parseRecord(draft.metadataRaw),
        ),
      });
      toast.success("Provider connection updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update provider connection.");
    }
  };

  const handleCreateOrgSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const providerRefs = orgSecretForm.providerRefs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await createOrgSecret.mutateAsync({
        key: orgSecretForm.key,
        value: orgSecretForm.value,
        description: orgSecretForm.description || null,
        metadata: {
          ...parseRecord(orgSecretForm.metadataRaw),
          ...(providerRefs.length > 0 ? { provider_refs: providerRefs } : {}),
          ...(orgSecretForm.rotationPolicy ? { rotation_policy: orgSecretForm.rotationPolicy } : {}),
        },
      });
      setOrgSecretForm({
        key: "",
        value: "",
        description: "",
        providerRefs: providerFilter ?? "",
        rotationPolicy: "manual",
        metadataRaw: "{}",
      });
      toast.success("Org secret created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create org secret.");
    }
  };

  const handleUpdateOrgSecret = async (secret: OrgSecret) => {
    const draft = secretDrafts[secret.id];
    if (!draft) return;
    try {
      const providerRefs = draft.providerRefs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await updateOrgSecret.mutateAsync({
        id: secret.id,
        value: draft.value,
        description: draft.description || null,
        metadata: {
          ...parseRecord(draft.metadataRaw),
          ...(providerRefs.length > 0 ? { provider_refs: providerRefs } : {}),
          ...(draft.rotationPolicy ? { rotation_policy: draft.rotationPolicy } : {}),
        },
      });
      toast.success("Org secret updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update org secret.");
    }
  };

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 ${compact ? "xl:grid-cols-2" : "2xl:grid-cols-2"}`}>
        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <h3 className="text-lg font-semibold text-white">Create provider connection</h3>
          <p className="mt-2 text-sm text-zinc-400">{providerConfig.providerHeadline}</p>

          <form onSubmit={handleCreateProviderConnection} className="mt-5 space-y-4">
            {!providerFilter && (
              <label className="space-y-2">
                <span className="text-sm text-zinc-400">Provider</span>
                <select
                  value={providerForm.provider_type}
                  onChange={(event) =>
                    setProviderForm({
                      provider_type: event.target.value as EnterpriseProvider,
                      name: "",
                      status: "active",
                      authFields: emptyFieldValues(enterpriseProviderUi[event.target.value as EnterpriseProvider].connectionAuthFields),
                      metadataFields: emptyFieldValues(enterpriseProviderUi[event.target.value as EnterpriseProvider].connectionMetadataFields),
                      authRaw: "{}",
                      metadataRaw: "{}",
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                >
                  {Object.values(enterpriseProviderUi).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="space-y-2">
              <span className="text-sm text-zinc-400">Connection name</span>
              <Input
                value={providerForm.name}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder={`${providerConfig.name} production`}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-zinc-400">Status</span>
              <select
                value={providerForm.status}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, status: event.target.value as ProviderConnectionDraft["status"] }))}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="error">error</option>
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              {providerConfig.connectionAuthFields.map((field) => (
                <ProviderFieldEditor
                  key={field.key}
                  field={field}
                  value={providerForm.authFields[field.key] ?? ""}
                  onChange={(value) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      authFields: {
                        ...prev.authFields,
                        [field.key]: value,
                      },
                    }))
                  }
                  secretOptions={field.kind === "secret-ref" ? orgSecretKeys : []}
                />
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {providerConfig.connectionMetadataFields.map((field) => (
                <ProviderFieldEditor
                  key={field.key}
                  field={field}
                  value={providerForm.metadataFields[field.key] ?? ""}
                  onChange={(value) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      metadataFields: {
                        ...prev.metadataFields,
                        [field.key]: value,
                      },
                    }))
                  }
                />
              ))}
            </div>

            <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced auth and metadata JSON</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-zinc-400">Additional auth config</span>
                  <Textarea
                    value={providerForm.authRaw}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, authRaw: event.target.value }))}
                    className="min-h-[110px]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm text-zinc-400">Additional metadata</span>
                  <Textarea
                    value={providerForm.metadataRaw}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, metadataRaw: event.target.value }))}
                    className="min-h-[110px]"
                  />
                </label>
              </div>
            </details>

            <Button type="submit" disabled={createProviderConnection.isPending}>
              Create provider connection
            </Button>
          </form>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <h3 className="text-lg font-semibold text-white">Create org secret</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Create reusable secret material once, then reference it from provider connections and project mappings.
          </p>

          <form onSubmit={handleCreateOrgSecret} className="mt-5 space-y-4">
            <label className="space-y-2">
              <span className="text-sm text-zinc-400">Key</span>
              <Input
                value={orgSecretForm.key}
                onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, key: event.target.value }))}
                placeholder="github-app-private-key"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-zinc-400">Value</span>
              <Textarea
                value={orgSecretForm.value}
                onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, value: event.target.value }))}
                className="min-h-[110px]"
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-zinc-400">Description</span>
                <Input
                  value={orgSecretForm.description}
                  onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Used by enterprise sync flows"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-zinc-400">Provider refs</span>
                <Input
                  value={orgSecretForm.providerRefs}
                  onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, providerRefs: event.target.value }))}
                  placeholder="github,vercel"
                />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-sm text-zinc-400">Rotation policy</span>
              <select
                value={orgSecretForm.rotationPolicy}
                onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, rotationPolicy: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              >
                <option value="manual">manual</option>
                <option value="scheduled">scheduled</option>
                <option value="external">external</option>
              </select>
            </label>
            <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced metadata JSON</summary>
              <div className="mt-4 space-y-2">
                <Label htmlFor="org-secret-metadata">Additional metadata</Label>
                <Textarea
                  id="org-secret-metadata"
                  value={orgSecretForm.metadataRaw}
                  onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, metadataRaw: event.target.value }))}
                  className="min-h-[110px]"
                />
              </div>
            </details>

            <Button type="submit" disabled={createOrgSecret.isPending}>
              Create org secret
            </Button>
          </form>
        </section>
      </div>

      <div className={`grid gap-6 ${compact ? "xl:grid-cols-2" : "2xl:grid-cols-2"}`}>
        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Provider connections</h3>
              <p className="mt-2 text-sm text-zinc-400">
                {providerFilter ? `Connections available for ${enterpriseProviderUi[providerFilter].name}.` : "Reusable enterprise provider credentials for this organization."}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {filteredConnections.slice(0, compact ? 3 : filteredConnections.length).map((connection) => {
              const config = enterpriseProviderUi[connection.provider_type];
              const draft = connectionDrafts[connection.id];
              if (!draft) return null;
              const usage = connectionUsage.get(connection.id) ?? [];

              return (
                <div key={connection.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{connection.name}</p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {connection.provider_type} · updated {new Date(connection.updated_at).toLocaleDateString()}
                      </p>
                      {showUsage && usage.length > 0 && (
                        <p className="mt-2 text-xs text-emerald-200/80">
                          Used by {usage.map((entry) => entry.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {draft.status}
                    </span>
                  </div>

                  {!compact && (
                    <>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="space-y-2 md:col-span-2">
                          <span className="text-sm text-zinc-400">Connection name</span>
                          <Input
                            value={draft.name}
                            onChange={(event) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
                                  ...draft,
                                  name: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm text-zinc-400">Status</span>
                          <select
                            value={draft.status}
                            onChange={(event) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
                                  ...draft,
                                  status: event.target.value as ProviderConnectionDraft["status"],
                                },
                              }))
                            }
                            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                            <option value="error">error</option>
                          </select>
                        </label>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {config.connectionAuthFields.map((field) => (
                          <ProviderFieldEditor
                            key={`${connection.id}-${field.key}`}
                            field={field}
                            value={draft.authFields[field.key] ?? ""}
                            onChange={(value) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
                                  ...draft,
                                  authFields: {
                                    ...draft.authFields,
                                    [field.key]: value,
                                  },
                                },
                              }))
                            }
                            secretOptions={field.kind === "secret-ref" ? orgSecretKeys : []}
                          />
                        ))}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {config.connectionMetadataFields.map((field) => (
                          <ProviderFieldEditor
                            key={`${connection.id}-meta-${field.key}`}
                            field={field}
                            value={draft.metadataFields[field.key] ?? ""}
                            onChange={(value) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
                                  ...draft,
                                  metadataFields: {
                                    ...draft.metadataFields,
                                    [field.key]: value,
                                  },
                                },
                              }))
                            }
                          />
                        ))}
                      </div>

                      <details className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced auth and metadata JSON</summary>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Textarea
                            value={draft.authRaw}
                            onChange={(event) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
                                  ...draft,
                                  authRaw: event.target.value,
                                },
                              }))
                            }
                            className="min-h-[110px]"
                          />
                          <Textarea
                            value={draft.metadataRaw}
                            onChange={(event) =>
                              setConnectionDrafts((prev) => ({
                                ...prev,
                                [connection.id]: {
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
                          disabled={updateProviderConnection.isPending}
                          onClick={() => void handleUpdateProviderConnection(connection)}
                        >
                          Save connection
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {filteredConnections.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                No provider connections yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <h3 className="text-lg font-semibold text-white">Org secrets</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Reusable secret references available to enterprise sync flows.
          </p>

          <div className="mt-5 space-y-4">
            {filteredSecrets.slice(0, compact ? 4 : filteredSecrets.length).map((secret) => {
              const draft = secretDrafts[secret.id];
              if (!draft) return null;
              return (
                <div key={secret.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">{secret.key}</p>
                      <p className="mt-1 text-sm text-zinc-400">{draft.description || "No description"}</p>
                      {draft.providerRefs && (
                        <p className="mt-2 text-xs text-emerald-200/80">Providers: {draft.providerRefs}</p>
                      )}
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300">
                      {draft.rotationPolicy}
                    </span>
                  </div>

                  {!compact && (
                    <>
                      <div className="mt-4 grid gap-4">
                        <label className="space-y-2">
                          <span className="text-sm text-zinc-400">Value</span>
                          <Textarea
                            value={draft.value}
                            onChange={(event) =>
                              setSecretDrafts((prev) => ({
                                ...prev,
                                [secret.id]: {
                                  ...draft,
                                  value: event.target.value,
                                },
                              }))
                            }
                            className="min-h-[110px]"
                          />
                        </label>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm text-zinc-400">Description</span>
                            <Input
                              value={draft.description}
                              onChange={(event) =>
                                setSecretDrafts((prev) => ({
                                  ...prev,
                                  [secret.id]: {
                                    ...draft,
                                    description: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm text-zinc-400">Provider refs</span>
                            <Input
                              value={draft.providerRefs}
                              onChange={(event) =>
                                setSecretDrafts((prev) => ({
                                  ...prev,
                                  [secret.id]: {
                                    ...draft,
                                    providerRefs: event.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label className="space-y-2">
                          <span className="text-sm text-zinc-400">Rotation policy</span>
                          <select
                            value={draft.rotationPolicy}
                            onChange={(event) =>
                              setSecretDrafts((prev) => ({
                                ...prev,
                                [secret.id]: {
                                  ...draft,
                                  rotationPolicy: event.target.value,
                                },
                              }))
                            }
                            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                          >
                            <option value="manual">manual</option>
                            <option value="scheduled">scheduled</option>
                            <option value="external">external</option>
                          </select>
                        </label>
                      </div>

                      <details className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-zinc-200">Advanced metadata JSON</summary>
                        <div className="mt-4">
                          <Textarea
                            value={draft.metadataRaw}
                            onChange={(event) =>
                              setSecretDrafts((prev) => ({
                                ...prev,
                                [secret.id]: {
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
                          disabled={updateOrgSecret.isPending}
                          onClick={() => void handleUpdateOrgSecret(secret)}
                        >
                          Save secret
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {filteredSecrets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">
                No org secrets yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
