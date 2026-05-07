import { Link } from "react-router-dom";

import { EnterpriseOrgAssetsPanel } from "@/components/enterprise/EnterpriseOrgAssetsPanel";

export default function OrgIntegrations() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div className="space-y-3">
        <Link to="/organisation" className="text-sm text-emerald-300 underline underline-offset-4">
          Back to organization settings
        </Link>
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/80">Enterprise Integrations</p>
        <h1 className="text-3xl font-semibold text-white">Shared provider connections and org secrets</h1>
        <p className="max-w-4xl text-sm text-zinc-400">
          Manage the organization-level credentials and secret references that power enterprise sync flows across projects.
        </p>
      </div>

      <EnterpriseOrgAssetsPanel showUsage />
    </div>
  );
}
