import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { sdk } from "@/api";
import { useEnvTypeMappings, useIntegrationBindings, useProviderConnections, useSyncRuns, type EnterpriseProvider } from "@/api/enterprise/hooks";
import { EnterpriseOrgAssetsPanel } from "@/components/enterprise/EnterpriseOrgAssetsPanel";
import { appIntegrationProviderPath, orgIntegrationsPath } from "@/lib/app-routes";
import { enterpriseProviderUi } from "@/lib/enterprise-provider-ui";

const providers = Object.values(enterpriseProviderUi) as Array<{
  id: EnterpriseProvider;
  name: string;
  description: string;
}>;

export default function ProjectIntegrations() {
  const { appId = "" } = useParams();
  const { data: project } = useQuery({
    queryKey: ["app", appId],
    queryFn: () => sdk.applications.getApp(appId),
    enabled: Boolean(appId),
  });
  const { data: providerConnections = [] } = useProviderConnections();
  const { data: bindings = [] } = useIntegrationBindings(appId);
  const { data: mappings = [] } = useEnvTypeMappings(appId);
  const { data: syncRuns = [] } = useSyncRuns(appId);

  const providerSummary = useMemo(() => {
    return providers.map((provider) => {
      const connectionCount = providerConnections.filter((entry) => entry.provider_type === provider.id).length;
      const bindingCount = bindings.filter((entry) => entry.provider_type === provider.id).length;
      const mappingCount = bindings
        .filter((entry) => entry.provider_type === provider.id)
        .reduce((count, binding) => count + mappings.filter((mapping) => mapping.integration_binding_id === binding.id).length, 0);
      const latestSync = syncRuns.find((run) => run.provider_type === provider.id);

      return {
        ...provider,
        connectionCount,
        bindingCount,
        mappingCount,
        latestSync,
      };
    });
  }, [bindings, mappings, providerConnections, syncRuns]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/80">Enterprise Integrations</p>
        <h1 className="text-3xl font-semibold text-white">
          {project?.name ? `${project.name} integration control` : "App-level provider mappings"}
        </h1>
        <p className="max-w-3xl text-sm text-zinc-400">
          Keep provider setup, app bindings, and sync operations in one place. Create shared org assets here, or open{" "}
          <Link className="text-emerald-300 underline underline-offset-4" to={orgIntegrationsPath()}>
            organization integrations
          </Link>{" "}
          for a cross-project view.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Provider connections</p>
          <p className="mt-3 text-3xl font-semibold text-white">{providerConnections.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Available org-level connections that can be bound to this app.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Bindings</p>
          <p className="mt-3 text-3xl font-semibold text-white">{bindings.length}</p>
          <p className="mt-2 text-sm text-zinc-400">App to provider-connection associations currently registered.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Env mappings</p>
          <p className="mt-3 text-3xl font-semibold text-white">{mappings.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Environment type routing rules across all connected providers.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Sync runs</p>
          <p className="mt-3 text-3xl font-semibold text-white">{syncRuns.length}</p>
          <p className="mt-2 text-sm text-zinc-400">Recent provider sync activity for this application.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providerSummary.map((provider) => (
          <Link
            key={provider.id}
            to={appIntegrationProviderPath(appId, provider.id)}
            className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 transition-colors hover:border-emerald-500/30 hover:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium text-white">{provider.name}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{provider.description}</p>
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {provider.bindingCount} bindings
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-zinc-500">Connections</p>
                <p className="mt-2 text-white">{provider.connectionCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-zinc-500">Mappings</p>
                <p className="mt-2 text-white">{provider.mappingCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <p className="text-zinc-500">Latest sync</p>
                <p className="mt-2 text-white">{provider.latestSync?.status ?? "none"}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <EnterpriseOrgAssetsPanel compact />
    </div>
  );
}
