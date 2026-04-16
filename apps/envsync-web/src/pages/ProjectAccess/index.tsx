import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LockKeyhole, Users, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import { useAuthContext } from "@/contexts/auth";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appDetailPath } from "@/lib/app-routes";

const relationPriority = { viewer: 1, editor: 2, admin: 3 } as const;
const sourceOrder = ["org", "direct", "team"] as const;

const ProjectAccess = () => {
  const { appId } = useParams();
  const { isLoading: isAuthLoading, isAuthenticated } = useAuthContext();
  const authEnabled = !isAuthLoading && isAuthenticated;

  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [subjectId, setSubjectId] = useState("");
  const [relation, setRelation] = useState<"viewer" | "editor" | "admin">("viewer");
  const [activeSection, setActiveSection] = useState<"access" | "effective">("access");

  const appQuery = api.applications.allApplications({ enabled: authEnabled });
  const project = useMemo(
    () => appQuery.data.find((entry) => entry.id === appId),
    [appQuery.data, appId],
  );

  const { data: permissions } = api.permissions.getMyPermissions({ enabled: authEnabled });
  const canManage = Boolean(permissions?.can_manage_apps);
  const { data: grants = [] } = api.permissions.getAppGrants(appId, { enabled: authEnabled });
  const { data: effectiveAccess = [] } = api.permissions.getAppEffectiveAccess(appId, { enabled: authEnabled });
  const { data: teams = [] } = api.teams.getTeams({ enabled: authEnabled });
  const { data: users = [] } = api.users.getAllUsers({ enabled: authEnabled });

  const grantAccess = api.permissions.grantAppAccess({
    onSuccess: () => toast.success("Access granted"),
    onError: ({ error }) => toast.error(error.message || "Failed to grant access"),
  });
  const revokeAccess = api.permissions.revokeAppAccess({
    onSuccess: () => toast.success("Access revoked"),
    onError: ({ error }) => toast.error(error.message || "Failed to revoke access"),
  });

  const subjectOptions = subjectType === "user"
    ? users.map((entry) => ({
        id: entry.id,
        label: entry.full_name || entry.email,
        sublabel: entry.email,
      }))
    : teams.map((entry) => ({
        id: entry.id,
        label: entry.name,
        sublabel: entry.description || "Team",
      }));

  const handleGrant = () => {
    if (!appId || !subjectId) return;
    grantAccess.mutate({
      appId,
      payload: { subject_id: subjectId, subject_type: subjectType, relation },
    });
  };

  const grantSummary = useMemo(() => {
    const directUsers = grants.filter((grant) => grant.subject_type === "user").length;
    const directTeams = grants.filter((grant) => grant.subject_type === "team").length;
    const inherited = effectiveAccess.filter((entry) => entry.sources.includes("team")).length;
    const orgUsers = effectiveAccess.filter((entry) => entry.sources.includes("org")).length;
    return { directUsers, directTeams, inherited, orgUsers };
  }, [effectiveAccess, grants]);

  const effectiveTeamAccess = useMemo(
    () =>
      grants
        .filter((grant) => grant.subject_type === "team")
        .map((grant) => ({
          ...grant,
          teamName: teams.find((entry) => entry.id === grant.subject_id)?.name || grant.subject_id,
          source: "direct team grant" as const,
        }))
        .sort((left, right) => left.teamName.localeCompare(right.teamName)),
    [grants, teams],
  );

  const handleSectionChange = (value: string) => {
    setActiveSection(value === "effective" ? "effective" : "access");
  };

  if (!appId || !project) {
    return (
      <div className="animate-page-enter rounded-lg border border-dashed border-gray-800 bg-gray-950/60 p-8 text-center text-gray-400">
        Project not found.
      </div>
    );
  }

  return (
    <div className="animate-page-enter space-y-6">
      <PageShell
        title="Project Access"
        description={`Direct project grants, team-based access, and org-derived visibility for ${project.name}.`}
        icon={LockKeyhole}
        actions={
          <Button asChild variant="outline" className="border-gray-700 text-gray-200">
            <Link to={appDetailPath(appId)}>Back to project</Link>
          </Button>
        }
        stats={[
          { label: "Project User Grants", value: <span data-testid="project-access-summary-direct-users">{grantSummary.directUsers}</span>, hint: "Users granted on this project directly" },
          { label: "Team Grants", value: <span data-testid="project-access-summary-team-grants">{grantSummary.directTeams}</span>, hint: "Team level access bundles" },
          { label: "Org Baseline Users", value: <span>{grantSummary.orgUsers}</span>, hint: "Users visible here because of org level access", tone: grantSummary.orgUsers > 0 ? "success" : "default" },
          { label: "Team Inherited Users", value: <span data-testid="project-access-summary-inherited-users">{grantSummary.inherited}</span>, hint: "Users inheriting access through teams", tone: grantSummary.inherited > 0 ? "success" : "default" },
        ]}
        secondaryNav={
          <Tabs data-testid="project-access-tabs" value={activeSection} onValueChange={handleSectionChange}>
            <TabsList className="h-auto bg-transparent p-0">
              <TabsTrigger data-testid="project-access-tab-control" value="access" className="rounded-xl bg-violet-500/12 text-white data-[state=active]:bg-violet-500/18 data-[state=active]:text-white">
                Access Control
              </TabsTrigger>
              <TabsTrigger data-testid="project-access-tab-effective" value="effective" className="rounded-xl text-gray-300 data-[state=active]:bg-violet-500/18 data-[state=active]:text-white">
                Effective Permissions
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
      {activeSection === "access" ? (
        <div data-testid="project-access-panel-control" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-gray-800 bg-gray-950/70">
            <CardHeader>
              <CardTitle className="text-white">Grant Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Subject type</p>
                  <Select value={subjectType} onValueChange={(value) => setSubjectType(value as "user" | "team")}>
                    <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-gray-700 bg-gray-900">
                      <SelectItem value="user" className="text-white">User</SelectItem>
                      <SelectItem value="team" className="text-white">Team</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <p className="text-sm text-gray-400">Subject</p>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                      <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                        <SelectValue placeholder={`Select ${subjectType}`} />
                      </SelectTrigger>
                    <SelectContent className="border-gray-700 bg-gray-900">
                      {subjectOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id} className="text-white">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">Access level</p>
                  <Select value={relation} onValueChange={(value) => setRelation(value as "viewer" | "editor" | "admin")}>
                    <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-gray-700 bg-gray-900">
                      <SelectItem value="viewer" className="text-white">Viewer</SelectItem>
                      <SelectItem value="editor" className="text-white">Editor</SelectItem>
                      <SelectItem value="admin" className="text-white">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="mt-6 bg-violet-500 hover:bg-violet-600"
                  onClick={handleGrant}
                  disabled={!canManage || !subjectId}
                >
                  Grant access
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-800 bg-gray-950/70">
            <CardHeader>
              <CardTitle className="text-white">Direct Grants</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">Subject</TableHead>
                    <TableHead className="text-gray-400">Type</TableHead>
                    <TableHead className="text-gray-400">Relation</TableHead>
                    <TableHead className="text-right text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((grant) => {
                    const label = grant.subject_type === "user"
                      ? users.find((entry) => entry.id === grant.subject_id)?.email || grant.subject_id
                      : teams.find((entry) => entry.id === grant.subject_id)?.name || grant.subject_id;

                    return (
                      <TableRow key={`${grant.subject_type}-${grant.subject_id}-${grant.relation}`} className="border-gray-800">
                        <TableCell className="text-white">
                          <span className={grant.subject_type === "user" ? "hdx-mask" : undefined}>{label}</span>
                        </TableCell>
                        <TableCell className="text-gray-300 capitalize">{grant.subject_type}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                            {grant.relation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <Button
                              variant="ghost"
                              className="text-red-300 hover:bg-red-950 hover:text-red-200"
                              onClick={() =>
                                revokeAccess.mutate({
                                  appId,
                                  payload: grant,
                                })
                              }
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div data-testid="project-access-panel-effective" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card data-testid="project-access-effective-users" className="border-gray-800 bg-gray-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Users className="size-5 text-violet-400" />
                Effective User Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">User</TableHead>
                    <TableHead className="text-gray-400">Effective Role</TableHead>
                    <TableHead className="text-gray-400">Source</TableHead>
                    <TableHead className="text-gray-400">Inherited Teams</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveAccess
                    .slice()
                    .sort((a, b) => (relationPriority[b.relation || "viewer"] || 0) - (relationPriority[a.relation || "viewer"] || 0))
                    .map((entry) => (
                      <TableRow key={entry.user_id} className="border-gray-800">
                        <TableCell className="text-white">
                          <span className="hdx-mask">{entry.email}</span>
                        </TableCell>
                        <TableCell>
                          {entry.relation ? (
                            <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                              {entry.relation}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-800 text-gray-400">No access</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.sources.length ? (
                            <div className="flex flex-wrap gap-2">
                              {sourceOrder
                                .filter((source) => entry.sources.includes(source))
                                .map((source) => (
                                  <Badge key={source} variant="secondary" className="bg-blue-500/10 text-blue-300">
                                    {source}
                                  </Badge>
                                ))}
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {entry.teams.length ? entry.teams.join(", ") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card data-testid="project-access-effective-teams" className="border-gray-800 bg-gray-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="size-5 text-blue-400" />
                Effective Team Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">Team</TableHead>
                    <TableHead className="text-gray-400">Granted Role</TableHead>
                    <TableHead className="text-gray-400">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveTeamAccess.length ? (
                    effectiveTeamAccess.map((grant) => (
                      <TableRow key={`${grant.subject_id}-${grant.relation}`} className="border-gray-800">
                        <TableCell className="text-white">{grant.teamName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                            {grant.relation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-300">{grant.source}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="border-gray-800">
                      <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                        No team grants in effect.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
      </PageShell>
    </div>
  );
};

export default ProjectAccess;
