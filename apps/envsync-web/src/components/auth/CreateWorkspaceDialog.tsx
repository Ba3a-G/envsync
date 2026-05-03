import { useEffect, useState } from "react";

import { useAuthContext } from "@/contexts/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateWorkspaceDialog = ({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) => {
  const { createWorkspace, isCreatingWorkspace } = useAuthContext();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Workspace name is required.");
      return;
    }

    if (trimmedName.length > 120) {
      setError("Workspace name must be 120 characters or fewer.");
      return;
    }

    setError(null);

    try {
      await createWorkspace(trimmedName);
      onOpenChange(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to create workspace.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-md"
        data-testid="create-workspace-dialog"
      >
        <DialogHeader>
          <DialogTitle>Create new workspace</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Set up a new workspace and switch into it immediately.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="workspace-name" className="text-zinc-200">
              Workspace name
            </Label>
            <Input
              id="workspace-name"
              data-testid="create-workspace-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Platform"
              autoFocus
              maxLength={120}
              disabled={isCreatingWorkspace}
              className="border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>

          {error && (
            <div
              data-testid="create-workspace-error"
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreatingWorkspace}
              className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="create-workspace-submit"
              disabled={isCreatingWorkspace}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {isCreatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
