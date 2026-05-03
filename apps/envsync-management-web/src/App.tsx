import { useEffect, useMemo, useState } from "react";

import {
  activateLicense,
  createEnterpriseManualSyncRun,
  createEnterpriseOrgSecret,
  createEnterpriseProviderConnection,
  getManagementSystemStatus,
  listEnterpriseOrgSecrets,
  listEnterpriseProviderConnections,
  listEnterpriseSyncAuditEvents,
  listEnterpriseSyncRuns,
  type OrgSecret,
  type ProviderConnection,
  type SyncAuditEvent,
  type SyncRun,
  type SystemStatusResponse,
  verifyLicense,
} from "@/api";
import { emptyFieldValues, managementProviderConfigs, mergeFieldValues, type ProviderFieldConfig, type ProviderType } from "@/provider-form-config";
import { runtimeConfig } from "@/runtime-config";

const providerOptions = [
  { id: "github", label: "GitHub" },
  { id: "gitlab", label: "GitLab" },
  { id: "aws-ssm", label: "AWS SSM" },
  { id: "vercel", label: "Vercel" },
  { id: "google-secret-manager", label: "Google Secret Manager" },
] as const;

function parseRecord(text: string) {
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function FieldHint({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="field-hint">{text}</p>;
}

function ProviderFieldInput({
  field,
  value,
  onChange,
  secretOptions,
}: {
  field: ProviderFieldConfig;
  value: string;
  onChange: (value: string) => void;
  secretOptions: string[];
}) {
  const listId = `${field.key}-secret-options`;

  return (
    <label className="field">
      <span>{field.label}</span>
      {field.kind === "select" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <input
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

export default function App() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [providerConnections, setProviderConnections] = useState<ProviderConnection[]>([]);
  const [orgSecrets, setOrgSecrets] = useState<OrgSecret[]>([]);
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [selectedSyncRunId, setSelectedSyncRunId] = useState<string | null>(null);
  const [syncAuditEvents, setSyncAuditEvents] = useState<SyncAuditEvent[]>([]);
  const [syncFilter, setSyncFilter] = useState<ProviderType | "all">("all");
  const [syncStatusFilter, setSyncStatusFilter] = useState<SyncRun["status"] | "all">("all");
  const [isSyncEventsLoading, setIsSyncEventsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [licenseActionMessage, setLicenseActionMessage] = useState<string | null>(null);

  const [providerForm, setProviderForm] = useState({
    provider_type: "github" as ProviderType,
    name: "",
    status: "active",
    authFields: emptyFieldValues(managementProviderConfigs.github.authFields),
    metadataFields: emptyFieldValues(managementProviderConfigs.github.metadataFields),
    auth_config_raw: "{}",
    metadata_raw: "{}",
  });
  const [orgSecretForm, setOrgSecretForm] = useState({
    key: "",
    value: "",
    description: "",
    provider_refs: "",
    rotation_policy: "manual",
    metadata_raw: "{}",
  });

  const providerConfig = managementProviderConfigs[providerForm.provider_type];
  const orgSecretKeys = useMemo(() => orgSecrets.map((secret) => secret.key), [orgSecrets]);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [systemStatus, providerRows, orgSecretRows, syncRunRows] = await Promise.all([
        getManagementSystemStatus(),
        listEnterpriseProviderConnections(),
        listEnterpriseOrgSecrets(),
        listEnterpriseSyncRuns(),
      ]);
      setStatus(systemStatus);
      setProviderConnections(providerRows);
      setOrgSecrets(orgSecretRows);
      setSyncRuns(syncRunRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load management data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (syncRuns.length === 0) {
      setSelectedSyncRunId(null);
      setSyncAuditEvents([]);
      return;
    }

    if (!selectedSyncRunId || !syncRuns.some((run) => run.id === selectedSyncRunId)) {
      setSelectedSyncRunId(syncRuns[0]?.id ?? null);
    }
  }, [selectedSyncRunId, syncRuns]);

  useEffect(() => {
    if (!selectedSyncRunId) {
      setSyncAuditEvents([]);
      return;
    }

    let cancelled = false;
    setIsSyncEventsLoading(true);
    void listEnterpriseSyncAuditEvents(selectedSyncRunId)
      .then((events) => {
        if (!cancelled) {
          setSyncAuditEvents(events);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load sync audit events.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncEventsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSyncRunId]);

  const runLicenseAction = async (action: "activate" | "verify") => {
    setIsSubmitting(true);
    setError(null);
    setLicenseActionMessage(null);
    try {
      const response = action === "activate" ? await activateLicense() : await verifyLicense();
      setLicenseActionMessage(response.message);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Failed to ${action} license.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const providerSummary = useMemo(() => {
    return providerOptions.map((provider) => ({
      ...provider,
      count: providerConnections.filter((entry) => entry.provider_type === provider.id).length,
    }));
  }, [providerConnections]);

  const syncSummary = useMemo(() => {
    return {
      total: syncRuns.length,
      succeeded: syncRuns.filter((run) => run.status === "succeeded").length,
      failed: syncRuns.filter((run) => run.status === "failed").length,
      running: syncRuns.filter((run) => run.status === "running" || run.status === "pending").length,
    };
  }, [syncRuns]);

  const filteredSyncRuns = useMemo(() => {
    return syncRuns.filter((run) => {
      if (syncFilter !== "all" && run.provider_type !== syncFilter) return false;
      if (syncStatusFilter !== "all" && run.status !== syncStatusFilter) return false;
      return true;
    });
  }, [syncFilter, syncRuns, syncStatusFilter]);

  const selectedSyncRun = useMemo(
    () => syncRuns.find((run) => run.id === selectedSyncRunId) ?? null,
    [selectedSyncRunId, syncRuns],
  );

  const selectedSyncEventSummary = useMemo(() => {
    return {
      info: syncAuditEvents.filter((event) => event.result === "info").length,
      success: syncAuditEvents.filter((event) => event.result === "success").length,
      error: syncAuditEvents.filter((event) => event.result === "error").length,
    };
  }, [syncAuditEvents]);

  const setProviderType = (providerType: ProviderType) => {
    const nextConfig = managementProviderConfigs[providerType];
    setProviderForm({
      provider_type: providerType,
      name: "",
      status: "active",
      authFields: emptyFieldValues(nextConfig.authFields),
      metadataFields: emptyFieldValues(nextConfig.metadataFields),
      auth_config_raw: "{}",
      metadata_raw: "{}",
    });
  };

  const onCreateProviderConnection = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const auth_config = mergeFieldValues(
        providerConfig.authFields,
        providerForm.authFields,
        parseRecord(providerForm.auth_config_raw),
      );
      const metadata = mergeFieldValues(
        providerConfig.metadataFields,
        providerForm.metadataFields,
        parseRecord(providerForm.metadata_raw),
      );
      await createEnterpriseProviderConnection({
        provider_type: providerForm.provider_type as ProviderConnection["provider_type"],
        name: providerForm.name,
        status: providerForm.status as ProviderConnection["status"],
        auth_config,
        metadata,
      });
      setProviderType(providerForm.provider_type);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create provider connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onCreateOrgSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const metadataBase = parseRecord(orgSecretForm.metadata_raw);
      const providerRefs = orgSecretForm.provider_refs
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await createEnterpriseOrgSecret({
        key: orgSecretForm.key,
        value: orgSecretForm.value,
        description: orgSecretForm.description || null,
        metadata: {
          ...metadataBase,
          ...(providerRefs.length > 0 ? { provider_refs: providerRefs } : {}),
          ...(orgSecretForm.rotation_policy ? { rotation_policy: orgSecretForm.rotation_policy } : {}),
        },
      });
      setOrgSecretForm({
        key: "",
        value: "",
        description: "",
        provider_refs: "",
        rotation_policy: "manual",
        metadata_raw: "{}",
      });
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create org secret.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRetrySyncRun = async (run: SyncRun) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createEnterpriseManualSyncRun({
        app_id: run.app_id ?? null,
        provider_type: run.provider_type,
        metadata: {
          ...(run.metadata ?? {}),
          source: "management-retry",
          retry_of: run.id,
        },
      });
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to retry sync run.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">EnvSync Management</p>
          <h1>Enterprise control plane under <code>/manage</code></h1>
          <p className="lead">
            This app owns enterprise platform setup: licensing, provider connections, org-level secrets, multi-org
            onboarding operations, and sync diagnostics. App and environment mappings stay in the main dashboard.
          </p>
        </div>
        <div className="status-card">
          <p className="status-label">Runtime</p>
          <p className="status-value">{runtimeConfig.managementApiUrl}</p>
          <p className="status-meta">edition: {status?.system.edition ?? runtimeConfig.edition}</p>
          <p className="status-meta">license: {status?.license.state.status ?? runtimeConfig.licenseStatus}</p>
          <p className="status-meta">
            orgs: {status?.system.org_count ?? "?"} · management: {status?.system.management_enabled ? "enabled" : "disabled"}
          </p>
        </div>
      </section>

      {error && (
        <section className="alert error">
          <strong>Management API error.</strong> {error}
        </section>
      )}

      {licenseActionMessage && (
        <section className="alert success">
          <strong>License action complete.</strong> {licenseActionMessage}
        </section>
      )}

      {isLoading ? (
        <section className="grid">
          <article className="card"><h2>Loading</h2><p>Fetching management surface data…</p></article>
        </section>
      ) : (
        <>
          <section className="grid">
            <article className="card">
              <h2>License and install state</h2>
              <p>
                License status: <strong>{status?.license.state.status ?? "unknown"}</strong>.
                {status?.license.state.lease_expires_at ? ` Lease expires ${new Date(status.license.state.lease_expires_at).toLocaleString()}.` : ""}
              </p>
              <p>
                Single-org mode: <strong>{status?.system.single_org_mode ? "yes" : "no"}</strong>. Observability:{" "}
                <strong>{status?.system.observability_enabled ? "enabled" : "disabled"}</strong>.
              </p>
              <div className="button-row">
                <button type="button" disabled={isSubmitting} onClick={() => void runLicenseAction("activate")}>
                  Activate license
                </button>
                <button type="button" disabled={isSubmitting} onClick={() => void runLicenseAction("verify")} className="secondary-button">
                  Verify lease
                </button>
              </div>
            </article>
            <article className="card">
              <h2>Provider coverage</h2>
              <div className="summary-list">
                {providerSummary.map((provider) => (
                  <div key={provider.id} className="summary-row">
                    <span>{provider.label}</span>
                    <strong>{provider.count}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="card">
              <h2>Org secrets and sync ops</h2>
              <p>{orgSecrets.length} reusable org-level secrets are available for enterprise integrations.</p>
              <p>{syncRuns.length} sync runs are currently recorded in the Management API.</p>
            </article>
          </section>

          <section className="management-grid">
            <article className="card">
              <h2>Create provider connection</h2>
              <p className="card-copy">{providerConfig.headline}</p>
              <form className="stack" onSubmit={onCreateProviderConnection}>
                <label className="field">
                  <span>Provider</span>
                  <select
                    value={providerForm.provider_type}
                    onChange={(event) => setProviderType(event.target.value as ProviderType)}
                  >
                    {providerOptions.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={providerForm.name}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="GitHub production org"
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={providerForm.status}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="error">error</option>
                  </select>
                </label>
                <div className="field-grid">
                  {providerConfig.authFields.map((field) => (
                    <ProviderFieldInput
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
                <div className="field-grid">
                  {providerConfig.metadataFields.map((field) => (
                    <ProviderFieldInput
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
                      secretOptions={[]}
                    />
                  ))}
                </div>
                <details className="advanced-card">
                  <summary>Advanced auth and metadata JSON</summary>
                  <div className="advanced-grid">
                    <label className="field">
                      <span>Additional auth config</span>
                      <textarea
                        value={providerForm.auth_config_raw}
                        onChange={(event) => setProviderForm((prev) => ({ ...prev, auth_config_raw: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Additional metadata</span>
                      <textarea
                        value={providerForm.metadata_raw}
                        onChange={(event) => setProviderForm((prev) => ({ ...prev, metadata_raw: event.target.value }))}
                      />
                    </label>
                  </div>
                </details>
                <button type="submit" disabled={isSubmitting}>Create provider connection</button>
              </form>
            </article>

            <article className="card">
              <h2>Create org secret</h2>
              <p className="card-copy">Create reusable secret material once, then reference it from provider connections and app-level mappings.</p>
              <form className="stack" onSubmit={onCreateOrgSecret}>
                <label className="field">
                  <span>Key</span>
                  <input
                    value={orgSecretForm.key}
                    onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, key: event.target.value }))}
                    placeholder="github-app-private-key"
                  />
                </label>
                <label className="field">
                  <span>Value</span>
                  <textarea
                    value={orgSecretForm.value}
                    onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, value: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <input
                    value={orgSecretForm.description}
                    onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Used by GitHub repository sync flows"
                  />
                </label>
                <label className="field">
                  <span>Provider refs</span>
                  <input
                    value={orgSecretForm.provider_refs}
                    onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, provider_refs: event.target.value }))}
                    placeholder="github,vercel"
                  />
                </label>
                <label className="field">
                  <span>Rotation policy</span>
                  <select
                    value={orgSecretForm.rotation_policy}
                    onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, rotation_policy: event.target.value }))}
                  >
                    <option value="manual">manual</option>
                    <option value="scheduled">scheduled</option>
                    <option value="external">external</option>
                  </select>
                </label>
                <details className="advanced-card">
                  <summary>Advanced metadata JSON</summary>
                  <div className="advanced-grid">
                    <label className="field">
                      <span>Additional metadata</span>
                      <textarea
                        value={orgSecretForm.metadata_raw}
                        onChange={(event) => setOrgSecretForm((prev) => ({ ...prev, metadata_raw: event.target.value }))}
                      />
                    </label>
                  </div>
                </details>
                <button type="submit" disabled={isSubmitting}>Create org secret</button>
              </form>
            </article>
          </section>

          <section className="management-grid">
            <article className="card">
              <h2>Provider connections</h2>
              <div className="list">
                {providerConnections.map((connection) => (
                  <div key={connection.id} className="list-item">
                    <div>
                      <strong>{connection.name}</strong>
                      <p>{connection.provider_type}</p>
                    </div>
                    <span className="pill">{connection.status}</span>
                  </div>
                ))}
                {providerConnections.length === 0 && <p className="muted">No provider connections created yet.</p>}
              </div>
            </article>

            <article className="card">
              <h2>Org secrets</h2>
              <div className="list">
                {orgSecrets.map((secret) => (
                  <div key={secret.id} className="list-item">
                    <div>
                      <strong>{secret.key}</strong>
                      <p>{secret.description || "No description"}</p>
                    </div>
                    <span className="pill">secret</span>
                  </div>
                ))}
                {orgSecrets.length === 0 && <p className="muted">No org secrets created yet.</p>}
              </div>
            </article>
          </section>

          <section className="card">
            <h2>Recent sync runs</h2>
            <div className="sync-summary-grid">
              <div className="sync-summary-card">
                <span className="sync-summary-label">Total</span>
                <strong>{syncSummary.total}</strong>
              </div>
              <div className="sync-summary-card">
                <span className="sync-summary-label">Succeeded</span>
                <strong>{syncSummary.succeeded}</strong>
              </div>
              <div className="sync-summary-card">
                <span className="sync-summary-label">Failed</span>
                <strong>{syncSummary.failed}</strong>
              </div>
              <div className="sync-summary-card">
                <span className="sync-summary-label">Running</span>
                <strong>{syncSummary.running}</strong>
              </div>
            </div>

            <div className="sync-filters">
              <label className="field">
                <span>Provider</span>
                <select value={syncFilter} onChange={(event) => setSyncFilter(event.target.value as ProviderType | "all")}>
                  <option value="all">all providers</option>
                  {providerOptions.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select value={syncStatusFilter} onChange={(event) => setSyncStatusFilter(event.target.value as SyncRun["status"] | "all")}>
                  <option value="all">all statuses</option>
                  <option value="pending">pending</option>
                  <option value="running">running</option>
                  <option value="succeeded">succeeded</option>
                  <option value="failed">failed</option>
                </select>
              </label>
            </div>

            <div className="sync-layout">
              <div className="list">
                {filteredSyncRuns.slice(0, 12).map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={`sync-run-button${selectedSyncRunId === run.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedSyncRunId(run.id)}
                  >
                    <div className="sync-run-main">
                      <div>
                        <strong>{run.provider_type}</strong>
                        <p>{new Date(run.started_at).toLocaleString()}</p>
                      </div>
                      <span className={`pill sync-pill sync-pill-${run.status}`}>{run.status}</span>
                    </div>
                    <p className="sync-run-subtle">{run.app_id ? `app ${run.app_id}` : "org-level sync"}</p>
                    {run.error_message && <p className="sync-run-error">{run.error_message}</p>}
                  </button>
                ))}
                {filteredSyncRuns.length === 0 && <p className="muted">No sync runs match the current filters.</p>}
              </div>

              <div className="sync-detail-card">
                {selectedSyncRun ? (
                  <>
                    <div className="sync-detail-header">
                      <div>
                        <h3>{selectedSyncRun.provider_type} sync detail</h3>
                        <p>{selectedSyncRun.id}</p>
                      </div>
                      <div className="sync-detail-actions">
                        <span className={`pill sync-pill sync-pill-${selectedSyncRun.status}`}>{selectedSyncRun.status}</span>
                        <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => void onRetrySyncRun(selectedSyncRun)}>
                          Retry run
                        </button>
                      </div>
                    </div>

                    <div className="sync-detail-meta">
                      <p>Started: <strong>{new Date(selectedSyncRun.started_at).toLocaleString()}</strong></p>
                      <p>Completed: <strong>{selectedSyncRun.completed_at ? new Date(selectedSyncRun.completed_at).toLocaleString() : "not completed"}</strong></p>
                      <p>Scope: <strong>{selectedSyncRun.app_id ? `app ${selectedSyncRun.app_id}` : "org-level"}</strong></p>
                    </div>

                    {selectedSyncRun.error_message && (
                      <div className="alert error">
                        <strong>Run failed.</strong> {selectedSyncRun.error_message}
                      </div>
                    )}

                    <div className="sync-summary-grid">
                      <div className="sync-summary-card">
                        <span className="sync-summary-label">Info events</span>
                        <strong>{selectedSyncEventSummary.info}</strong>
                      </div>
                      <div className="sync-summary-card">
                        <span className="sync-summary-label">Success events</span>
                        <strong>{selectedSyncEventSummary.success}</strong>
                      </div>
                      <div className="sync-summary-card">
                        <span className="sync-summary-label">Error events</span>
                        <strong>{selectedSyncEventSummary.error}</strong>
                      </div>
                    </div>

                    <div className="sync-events">
                      {isSyncEventsLoading ? (
                        <p className="muted">Loading sync audit events…</p>
                      ) : syncAuditEvents.length > 0 ? (
                        syncAuditEvents.map((event) => (
                          <div key={event.id} className="sync-event-card">
                            <div className="sync-event-header">
                              <strong>{event.action}</strong>
                              <span className={`pill sync-pill sync-pill-${event.result}`}>{event.result}</span>
                            </div>
                            <p className="sync-run-subtle">{new Date(event.created_at).toLocaleString()}</p>
                            <pre className="sync-event-details">{JSON.stringify(event.details, null, 2)}</pre>
                          </div>
                        ))
                      ) : (
                        <p className="muted">No audit events recorded for this run.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="muted">Select a sync run to inspect its audit trail.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
