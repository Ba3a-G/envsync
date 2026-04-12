import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Database, LockKeyhole, Users, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const relationPriority = { viewer: 1, editor: 2, admin: 3 } as const;

const ProjectAccess = () => {
  const { projectNameId } = useParams();
  const { api: sdkApi, user } = useAuth();
  const canManage = Boolean(user?.role?.is_admin || user?.role?.is_master);

  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [subjectId, setSubjectId] = useState("");
  const [relation, setRelation] = useState<"viewer" | "editor" | "admin">("viewer");

  const appQuery = api.applications.allApplications();
  const project = useMemo(
    () => appQuery.data.find((entry) => entry.id === projectNameId),
    [appQuery.data, projectNameId],
  );

  const { data: grants = [] } = api.permissions.getAppGrants(projectNameId);
  const { data: effectiveAccess = [] } = api.permissions.getAppEffectiveAccess(projectNameId);
  const { data: teams = [] } = api.teams.getTeams();
  const { data: users = [] } = api.users.getAllUsers();

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
    if (!projectNameId || !subjectId) return;
    grantAccess.mutate({
      appId: projectNameId,
      payload: { subject_id: subjectId, subject_type: subjectType, relation },
    });
  };

  const grantSummary = useMemo(() => {
    const directUsers = grants.filter((grant) => grant.subject_type === "user").length;
    const directTeams = grants.filter((grant) => grant.subject_type === "team").length;
    const inherited = effectiveAccess.filter((entry) => entry.source === "team" || entry.source === "both").length;
    return { directUsers, directTeams, inherited };
  }, [effectiveAccess, grants]);

  if (!projectNameId || !project) {
    return (
      <div className="animate-page-enter rounded-lg border border-dashed border-gray-800 bg-gray-950/60 p-8 text-center text-gray-400">
        Project not found.
      </div>
    );
  }

  return (
    <div className="animate-page-enter space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 ring-1 ring-violet-500/20">
            <LockKeyhole className="size-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-100 tracking-tight">Project Access</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              Direct user grants and team-based access for <span className="text-gray-200">{project.name}</span>.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="border-gray-700 text-gray-200">
          <Link to={`/applications/${projectNameId}`}>Back to project</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader><CardTitle className="text-white text-base">Direct Users</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{grantSummary.directUsers}</CardContent>
        </Card>
        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader><CardTitle className="text-white text-base">Team Grants</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{grantSummary.directTeams}</CardContent>
        </Card>
        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader><CardTitle className="text-white text-base">Inherited Users</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-white">{grantSummary.inherited}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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

            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
              A user keeps their direct org role. Project access can be granted directly to the user or inherited through any team they belong to.
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
                      <TableCell className="text-white">{label}</TableCell>
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
                                appId: projectNameId,
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

      <Card className="border-gray-800 bg-gray-950/70">
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
                    <TableCell className="text-white">{entry.email}</TableCell>
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
                      {entry.source ? (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-300">
                          {entry.source}
                        </Badge>
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
    </div>
  );
};

export default ProjectAccess;
