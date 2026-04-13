import { useMemo, useState } from "react";
import { Users, Plus, UserPlus, ShieldAlert, Trash2, Pencil, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DEFAULT_COLORS = ["#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444"];

const Teams = () => {
  const { user } = useAuth();
  const canManage = Boolean(user?.role?.is_admin || user?.role?.is_master);

  const { data: teams = [] } = api.teams.getTeams();
  const { data: roles = [] } = api.roles.getAllRoles();
  const { data: users = [] } = api.users.getAllUsers();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const { data: selectedTeam } = api.teams.getTeam(selectedTeamId || undefined);

  const createTeam = api.teams.createTeam({
    onSuccess: () => toast.success("Team created"),
    onError: ({ error }) => toast.error(error.message || "Failed to create team"),
  });
  const updateTeam = api.teams.updateTeam({
    onSuccess: () => toast.success("Team updated"),
    onError: ({ error }) => toast.error(error.message || "Failed to update team"),
  });
  const deleteTeam = api.teams.deleteTeam({
    onSuccess: () => {
      toast.success("Team deleted");
      setSelectedTeamId(null);
    },
    onError: ({ error }) => toast.error(error.message || "Failed to delete team"),
  });
  const addMember = api.teams.addMember({
    onSuccess: () => toast.success("Member added"),
    onError: ({ error }) => toast.error(error.message || "Failed to add member"),
  });
  const removeMember = api.teams.removeMember({
    onSuccess: () => toast.success("Member removed"),
    onError: ({ error }) => toast.error(error.message || "Failed to remove member"),
  });
  const assignRole = api.teams.assignRole({
    onSuccess: () => toast.success("Team role assigned"),
    onError: ({ error }) => toast.error(error.message || "Failed to assign role"),
  });
  const unassignRole = api.teams.unassignRole({
    onSuccess: () => toast.success("Team role removed"),
    onError: ({ error }) => toast.error(error.message || "Failed to remove role"),
  });

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(DEFAULT_COLORS[0]);

  const [memberUserId, setMemberUserId] = useState("");
  const [teamRoleId, setTeamRoleId] = useState("");

  const selectedRoleName = useMemo(() => {
    if (!selectedTeam?.role_id) return "No team role";
    return roles.find((role) => role.id === selectedTeam.role_id)?.name || "Assigned role";
  }, [roles, selectedTeam]);

  const memberIds = useMemo(
    () => new Set(selectedTeam?.members.map((member) => member.user_id) || []),
    [selectedTeam],
  );

  const availableUsers = useMemo(
    () => users.filter((entry) => !memberIds.has(entry.id)),
    [users, memberIds],
  );

  const openCreate = () => {
    setEditingTeamId(null);
    setName("");
    setDescription("");
    setColor(DEFAULT_COLORS[0]);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selectedTeam) return;
    setEditingTeamId(selectedTeam.id);
    setName(selectedTeam.name);
    setDescription(selectedTeam.description || "");
    setColor(selectedTeam.color || DEFAULT_COLORS[0]);
    setEditorOpen(true);
  };

  const saveTeam = () => {
    if (!name.trim()) return;
    if (editingTeamId) {
      updateTeam.mutate({
        id: editingTeamId,
        payload: { name: name.trim(), description: description.trim() || undefined, color },
      });
    } else {
      createTeam.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      });
    }
    setEditorOpen(false);
  };

  return (
    <div className="animate-page-enter space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 ring-1 ring-violet-500/20">
            <Users className="size-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-100 tracking-tight">Teams</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              Create teams, assign a shared role, and grant app access through membership.
            </p>
          </div>
        </div>
        {canManage && (
          <Button className="bg-violet-500 hover:bg-violet-600" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            New Team
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader>
            <CardTitle className="text-white">Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Description</TableHead>
                  <TableHead className="text-gray-400">Team Role</TableHead>
                  <TableHead className="text-gray-400">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow
                    key={team.id}
                    className={`cursor-pointer border-gray-800 ${selectedTeamId === team.id ? "bg-gray-900" : "hover:bg-gray-900/60"}`}
                    onClick={() => setSelectedTeamId(team.id)}
                  >
                    <TableCell className="font-medium text-white">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ backgroundColor: team.color }} />
                        {team.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-300">{team.description || "No description"}</TableCell>
                    <TableCell>
                      {team.role_id ? (
                        <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                          {roles.find((role) => role.id === team.role_id)?.name || "Assigned"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-800 text-gray-300">
                          None
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {new Date(team.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-white">
                {selectedTeam ? selectedTeam.name : "Select a team"}
              </CardTitle>
              <p className="mt-1 text-sm text-gray-400">
                {selectedTeam
                  ? "Members inherit the team role and any app access granted to this team."
                  : "Pick a team to manage membership and the shared role."}
              </p>
            </div>
            {selectedTeam && canManage && (
              <div className="flex gap-2">
                <Button variant="outline" className="border-gray-700 text-gray-200" onClick={openEdit}>
                  <Pencil className="mr-2 size-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="border-red-700 text-red-300 hover:bg-red-950"
                  onClick={() => deleteTeam.mutate(selectedTeam.id)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {selectedTeam ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldAlert className="size-4 text-violet-400" />
                      <h3 className="font-medium text-white">Team Role</h3>
                    </div>
                    <p className="mb-3 text-sm text-gray-400">
                      Team members keep their direct org role and also inherit this team-scoped role bundle.
                    </p>
                    <div className="mb-3 flex items-center gap-2">
                      <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                        {selectedRoleName}
                      </Badge>
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <Select value={teamRoleId} onValueChange={setTeamRoleId}>
                          <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent className="border-gray-700 bg-gray-900">
                            {roles
                              .filter((role) => !role.isMaster)
                              .map((role) => (
                                <SelectItem key={role.id} value={role.id} className="text-white">
                                  {role.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          className="bg-violet-500 hover:bg-violet-600"
                          onClick={() => teamRoleId && assignRole.mutate({ teamId: selectedTeam.id, role_id: teamRoleId })}
                        >
                          Assign
                        </Button>
                        {selectedTeam.role_id && (
                          <Button
                            variant="outline"
                            className="border-gray-700 text-gray-200"
                            onClick={() => unassignRole.mutate({ teamId: selectedTeam.id })}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <UserPlus className="size-4 text-violet-400" />
                      <h3 className="font-medium text-white">Add Member</h3>
                    </div>
                    <p className="mb-3 text-sm text-gray-400">
                      App access can be granted to the team, and every member inherits that access automatically.
                    </p>
                    {canManage ? (
                      <div className="flex gap-2">
                        <Select value={memberUserId} onValueChange={setMemberUserId}>
                          <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent className="border-gray-700 bg-gray-900">
                            {availableUsers.map((entry) => (
                              <SelectItem key={entry.id} value={entry.id} className="text-white">
                                {entry.full_name || entry.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          className="bg-violet-500 hover:bg-violet-600"
                          onClick={() => memberUserId && addMember.mutate({ teamId: selectedTeam.id, user_id: memberUserId })}
                        >
                          Add
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Admin access required to manage membership.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
                  <h3 className="mb-3 font-medium text-white">Members</h3>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800 hover:bg-transparent">
                        <TableHead className="text-gray-400">User</TableHead>
                        <TableHead className="text-gray-400">Email</TableHead>
                        <TableHead className="text-gray-400">Joined</TableHead>
                        <TableHead className="text-right text-gray-400">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTeam.members.map((member) => (
                        <TableRow key={member.id} className="border-gray-800">
                          <TableCell className="text-white">{member.full_name || "Unnamed user"}</TableCell>
                          <TableCell className="text-gray-300">
                            <span className="hdx-mask">{member.email}</span>
                          </TableCell>
                          <TableCell className="text-gray-400">
                            {new Date(member.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <Button
                                variant="ghost"
                                className="text-red-300 hover:bg-red-950 hover:text-red-200"
                                onClick={() => removeMember.mutate({ teamId: selectedTeam.id, userId: member.user_id })}
                              >
                                <UserMinus className="mr-2 size-4" />
                                Remove
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-800 bg-gray-900/50 p-8 text-center text-gray-400">
                Pick a team from the table to manage membership, shared roles, and inherited access.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="border-gray-800 bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingTeamId ? "Edit Team" : "Create Team"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="border-gray-700 bg-gray-950 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Description</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="border-gray-700 bg-gray-950 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Color</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`size-8 rounded-full border-2 ${color === value ? "border-white" : "border-transparent"}`}
                    style={{ backgroundColor: value }}
                    onClick={() => setColor(value)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-700 text-gray-200" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-violet-500 hover:bg-violet-600" onClick={saveTeam}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Teams;
