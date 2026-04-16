import { useCallback, useState } from "react";
import { Clock, Edit3, Mail, Trash2 } from "lucide-react";

import { useInvitations } from "@/hooks/useInvitations";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const InvitationsPanel = () => {
  const {
    invitations,
    roles,
    isLoading,
    selectedInviteId,
    selectedInviteEmail,
    selectedRoleId,
    formErrors,
    actionLoadingStates,
    setSelectedInviteId,
    setSelectedInviteEmail,
    setSelectedRoleId,
    deleteInvitationMutation,
    updateInvitationRoleMutation,
    validateEditForm,
    resetEditForm,
    resetDeleteForm,
  } = useInvitations();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const handleDeleteInvitation = useCallback(() => {
    if (!selectedInviteId || deleteInvitationMutation.isPending) return;

    deleteInvitationMutation.mutate(selectedInviteId, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        resetDeleteForm();
      },
    });
  }, [deleteInvitationMutation, resetDeleteForm, selectedInviteId]);

  const handleUpdateRole = useCallback(() => {
    if (!selectedInviteId || !validateEditForm() || updateInvitationRoleMutation.isPending) {
      return;
    }

    const invitation = invitations.find((entry) => entry.id === selectedInviteId);
    if (!invitation) return;

    updateInvitationRoleMutation.mutate(
      {
        inviteToken: invitation.inviteToken,
        roleId: selectedRoleId,
      },
      {
        onSuccess: () => {
          setShowEditDialog(false);
          resetEditForm();
        },
      }
    );
  }, [
    invitations,
    resetEditForm,
    selectedInviteId,
    selectedRoleId,
    updateInvitationRoleMutation,
    validateEditForm,
  ]);

  const handleOpenDeleteDialog = useCallback(
    (invitation: (typeof invitations)[number]) => {
      setSelectedInviteId(invitation.id);
      setSelectedInviteEmail(invitation.email);
      setShowDeleteDialog(true);
    },
    [setSelectedInviteEmail, setSelectedInviteId]
  );

  const handleOpenEditDialog = useCallback(
    (invitation: (typeof invitations)[number]) => {
      setSelectedInviteId(invitation.id);
      setSelectedInviteEmail(invitation.email);
      setSelectedRoleId(invitation.roleId);
      setShowEditDialog(true);
    },
    [setSelectedInviteEmail, setSelectedInviteId, setSelectedRoleId]
  );

  const closeEditDialog = useCallback(() => {
    setShowEditDialog(false);
    resetEditForm();
  }, [resetEditForm]);

  const closeDeleteDialog = useCallback(() => {
    setShowDeleteDialog(false);
    resetDeleteForm();
  }, [resetDeleteForm]);

  return (
    <>
      <Card data-testid="users-invitations-panel" className="border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white">Invitations</CardTitle>
            <p className="mt-1 text-sm text-gray-400">
              Pending invites stay visible here so role changes and cleanup do not disappear into modals.
            </p>
          </div>
          <Badge className="bg-amber-500/10 text-amber-200">
            {invitations.filter((invitation) => !invitation.isAccepted).length} pending
          </Badge>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Loading invitations…</div>
          ) : invitations.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
                <Mail className="h-7 w-7 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium text-white">No invitations</h3>
              <p className="mt-2 text-gray-400">
                When you invite a teammate, the request and assigned role will appear here until it is accepted.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400">Email</TableHead>
                    <TableHead className="text-gray-400">Role</TableHead>
                    <TableHead className="text-gray-400">Status</TableHead>
                    <TableHead className="text-gray-400">Created</TableHead>
                    <TableHead className="text-right text-gray-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id} className="border-gray-800">
                      <TableCell className="text-white">
                        <span className="hdx-mask">{invitation.email}</span>
                      </TableCell>
                      <TableCell className="text-gray-300">
                        {invitation.roleName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            invitation.isAccepted
                              ? "bg-emerald-500/10 text-emerald-200"
                              : "bg-amber-500/10 text-amber-200"
                          }
                        >
                          <Clock className="mr-1 h-3 w-3" />
                          {invitation.isAccepted ? "Accepted" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {invitation.createdAt}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {!invitation.isAccepted && (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid="invitation-edit-role-button"
                              onClick={() => handleOpenEditDialog(invitation)}
                              disabled={actionLoadingStates[invitation.id]}
                              className="border-gray-700 text-gray-300 hover:bg-gray-800"
                            >
                              <Edit3 className="mr-1 h-3 w-3" />
                              Edit Role
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="invitation-delete-button"
                            onClick={() => handleOpenDeleteDialog(invitation)}
                            disabled={actionLoadingStates[invitation.id]}
                            className="border-red-700 text-red-300 hover:bg-red-950"
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="border-gray-800 bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-white">Update Invitation Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
              <span className="hdx-mask font-medium text-white">{selectedInviteEmail}</span>
            </div>
            <div className="space-y-2">
              <Label className="text-white">Role</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                  <SelectValue placeholder="Choose role" />
                </SelectTrigger>
                <SelectContent className="border-gray-700 bg-gray-900">
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id} className="text-white">
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.role && (
                <p className="text-sm text-red-400">{formErrors.role}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeEditDialog}
              className="border-gray-700 text-gray-200 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={updateInvitationRoleMutation.isPending}
              className="bg-violet-500 text-white hover:bg-violet-600"
            >
              {updateInvitationRoleMutation.isPending ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-gray-800 bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Invitation</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Remove the pending invitation for{" "}
              <span className="hdx-mask font-semibold text-white">
                {selectedInviteEmail}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={closeDeleteDialog}
              className="border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteInvitation}
              disabled={deleteInvitationMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteInvitationMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
