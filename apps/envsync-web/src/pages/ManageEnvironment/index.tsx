import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  FolderKanban,
  Layers3,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  Edit3,
} from "lucide-react";
import { toast } from "sonner";

import { sdk } from "@/api";
import { PageShell } from "@/components/PageShell";
import { useAuthContext } from "@/contexts/auth";
import { appDetailPath } from "@/lib/app-routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

interface EnvironmentType {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  is_protected: boolean;
  variable_count?: number;
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface FormData {
  name: string;
  color: string;
  is_default: boolean;
  is_protected: boolean;
}

interface FormErrors {
  name?: string;
  color?: string;
}

const MAX_NAME_LENGTH = 50;
const ENV_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-_\s]*[a-zA-Z0-9]$/;
const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
];

const INITIAL_FORM: FormData = {
  name: "",
  color: "#6366f1",
  is_default: false,
  is_protected: false,
};

export const ManageEnvironment = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const { isLoading: isAuthLoading, isAuthenticated } = useAuthContext();
  const queryClient = useQueryClient();

  const [selectedEnvironment, setSelectedEnvironment] =
    useState<EnvironmentType | null>(null);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["project-environments/manage", appId],
    queryFn: async () => {
      const projectResponse = await sdk.applications.getApp(appId!);
      const environmentTypes = await Promise.all(
        projectResponse.env_types.map(async (envType) => {
          const variables = await sdk.environmentVariables.getEnvs({
            app_id: appId!,
            env_type_id: envType.id,
          });

          return {
            ...envType,
            variable_count: variables.length,
          };
        })
      );

      const project: Project = {
        id: projectResponse.id,
        name: projectResponse.name,
        description: projectResponse.description,
      };

      return { project, environmentTypes };
    },
    enabled: !isAuthLoading && isAuthenticated && !!appId,
    staleTime: 30_000,
  });

  const validateForm = useCallback((): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = "Environment name is required";
    } else if (formData.name.trim().length < 2) {
      errors.name = "Environment name must be at least 2 characters";
    } else if (formData.name.length > MAX_NAME_LENGTH) {
      errors.name = `Environment name must be less than ${MAX_NAME_LENGTH} characters`;
    } else if (!ENV_NAME_REGEX.test(formData.name.trim())) {
      errors.name =
        "Environment name can only contain letters, numbers, spaces, hyphens, and underscores";
    }

    if (!formData.color || !/^#[0-9A-F]{6}$/i.test(formData.color)) {
      errors.color = "Please select a valid color";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback(
    (field: keyof FormData, value: string | boolean) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (typeof value === "string" && formErrors[field as keyof FormErrors]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formErrors]
  );

  const invalidateEnvironmentQueries = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["project-environments", appId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["project-environments/manage", appId],
    });
    await queryClient.refetchQueries({
      queryKey: ["project-environments/manage", appId],
      type: "active",
    });
  }, [appId, queryClient]);

  const createEnvironmentType = useMutation({
    mutationFn: async (payload: FormData) =>
      sdk.environmentTypes.createEnvType({
        name: payload.name.trim(),
        color: payload.color,
        is_default: payload.is_default,
        is_protected: payload.is_protected,
        app_id: appId!,
      }),
    onSuccess: async () => {
      await invalidateEnvironmentQueries();
      setShowCreateSheet(false);
      setFormData(INITIAL_FORM);
      setFormErrors({});
      toast.success("Environment type created successfully");
    },
    onError: (mutationError) => {
      console.error("Failed to create environment type:", mutationError);
      toast.error("Failed to create environment type");
    },
  });

  const updateEnvironmentType = useMutation({
    mutationFn: async (payload: FormData) => {
      if (!selectedEnvironment) {
        throw new Error("No environment selected");
      }

      return sdk.environmentTypes.updateEnvType(selectedEnvironment.id, {
        id: selectedEnvironment.id,
        name: payload.name.trim(),
        color: payload.color,
        is_default: payload.is_default,
        is_protected: payload.is_protected,
      });
    },
    onSuccess: async () => {
      await invalidateEnvironmentQueries();
      setShowEditSheet(false);
      setSelectedEnvironment(null);
      setFormData(INITIAL_FORM);
      setFormErrors({});
      toast.success("Environment type updated successfully");
    },
    onError: (mutationError) => {
      console.error("Failed to update environment type:", mutationError);
      toast.error("Failed to update environment type");
    },
  });

  const deleteEnvironmentType = useMutation({
    mutationFn: async () => {
      if (!selectedEnvironment) {
        throw new Error("No environment selected");
      }
      return sdk.environmentTypes.deleteEnvType(selectedEnvironment.id);
    },
    onSuccess: async () => {
      await invalidateEnvironmentQueries();
      setShowDeleteDialog(false);
      setSelectedEnvironment(null);
      setDeleteConfirmText("");
      toast.success("Environment type deleted successfully");
    },
    onError: (mutationError) => {
      console.error("Failed to delete environment type:", mutationError);
      toast.error("Failed to delete environment type");
    },
  });

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM);
    setFormErrors({});
  }, []);

  const openCreateSheet = useCallback(() => {
    resetForm();
    setShowCreateSheet(true);
  }, [resetForm]);

  const openEditSheet = useCallback((environment: EnvironmentType) => {
    setSelectedEnvironment(environment);
    setFormData({
      name: environment.name,
      color: environment.color,
      is_default: environment.is_default,
      is_protected: environment.is_protected,
    });
    setFormErrors({});
    setShowEditSheet(true);
  }, []);

  const openDeleteDialog = useCallback((environment: EnvironmentType) => {
    setSelectedEnvironment(environment);
    setDeleteConfirmText("");
    setShowDeleteDialog(true);
  }, []);

  const handleCreate = useCallback(() => {
    if (!validateForm() || createEnvironmentType.isPending) {
      return;
    }
    createEnvironmentType.mutate(formData);
  }, [createEnvironmentType, formData, validateForm]);

  const handleUpdate = useCallback(() => {
    if (!validateForm() || updateEnvironmentType.isPending) {
      return;
    }
    updateEnvironmentType.mutate(formData);
  }, [formData, updateEnvironmentType, validateForm]);

  const handleDelete = useCallback(() => {
    if (
      deleteConfirmText !== selectedEnvironment?.name ||
      deleteEnvironmentType.isPending
    ) {
      return;
    }
    deleteEnvironmentType.mutate();
  }, [
    deleteConfirmText,
    deleteEnvironmentType,
    selectedEnvironment?.name,
  ]);

  const handleBack = useCallback(() => {
    navigate(appDetailPath(appId ?? ""));
  }, [appId, navigate]);

  const closeEditSheet = useCallback(() => {
    setShowEditSheet(false);
    setSelectedEnvironment(null);
    resetForm();
  }, [resetForm]);

  const renderEnvironmentForm = (mode: "create" | "edit") => (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
        {mode === "create"
          ? "Create a lane. Protect it only when changes should require review."
          : "Rename the lane, update its color, or adjust default and protection rules."}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${mode}-env-name`} className="text-white">
          Environment Name *
        </Label>
        <Input
          id={`${mode}-env-name`}
          value={formData.name}
          onChange={(event) => handleInputChange("name", event.target.value)}
          placeholder="e.g. Production"
          className="border-zinc-700 bg-zinc-950 text-white"
        />
        {formErrors.name && (
          <p className="text-sm text-red-400">{formErrors.name}</p>
        )}
      </div>

      <div className="space-y-3">
        <Label className="text-white">Color</Label>
        <div className="flex flex-wrap gap-3">
          {PRESET_COLORS.map((color) => (
            <button
              type="button"
              key={color}
              className={`size-10 rounded-2xl border-2 transition-all ${
                formData.color === color
                  ? "scale-105 border-white"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
              onClick={() => handleInputChange("color", color)}
              aria-label={`Use ${color} as environment color`}
            />
          ))}
        </div>
        {formErrors.color && (
          <p className="text-sm text-red-400">{formErrors.color}</p>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-white">Default environment</p>
            <p className="text-sm text-zinc-400">
              New workflows land here first when no environment is specified.
            </p>
          </div>
          <Switch
            checked={formData.is_default}
            onCheckedChange={(checked) =>
              handleInputChange("is_default", checked)
            }
            data-testid="env-type-default-checkbox"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-white">Protected environment</p>
            <p className="text-sm text-zinc-400">
              Direct changes are blocked and move into a reviewable change-request flow.
            </p>
          </div>
          <Switch
            checked={formData.is_protected}
            onCheckedChange={(checked) =>
              handleInputChange("is_protected", checked)
            }
            data-testid="env-type-protected-checkbox"
          />
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="size-12 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500" />
          <p className="text-zinc-400">Loading environment types...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <div>
            <h3 className="mb-2 text-lg font-semibold text-white">
              Failed to load project
            </h3>
            <p className="mb-4 text-zinc-400">
              The requested project could not be found or you do not have access.
            </p>
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => refetch()}
                className="bg-emerald-500 text-white hover:bg-emerald-600"
              >
                Try Again
              </Button>
              <Button
                onClick={handleBack}
                variant="outline"
                className="border-zinc-700 text-white hover:bg-zinc-800"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { project, environmentTypes } = data;
  const protectedCount = environmentTypes.filter((env) => env.is_protected).length;
  const defaultEnvironment = environmentTypes.find((env) => env.is_default);
  const totalVariables = environmentTypes.reduce(
    (sum, env) => sum + (env.variable_count || 0),
    0
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageShell
        title="Manage Environments"
        description={`Configure environment lanes for ${project.name}.`}
        icon={Settings}
        stickyActions
        actions={
          <>
            <Button
              onClick={handleBack}
              variant="outline"
              className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Button>
            <Button
              onClick={openCreateSheet}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Environment Type
            </Button>
          </>
        }
        stats={[
          {
            label: "Environment Types",
            value: <span data-testid="manage-env-stat-types">{environmentTypes.length}</span>,
            hint: "Runtime lanes",
          },
          {
            label: "Protected",
            value: <span data-testid="manage-env-stat-protected">{protectedCount}</span>,
            hint: "Review required",
            tone: protectedCount > 0 ? "warning" : "default",
          },
          {
            label: "Default",
            value: <span data-testid="manage-env-stat-default">{defaultEnvironment?.name || "None"}</span>,
            hint: "Starting lane",
          },
          {
            label: "Variables Indexed",
            value: <span data-testid="manage-env-stat-config-items">{totalVariables}</span>,
            hint: "Across all lanes",
            tone: totalVariables > 0 ? "success" : "default",
          },
        ]}
      >
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {environmentTypes.map((envType) => (
              <Card
                key={envType.id}
                data-testid={`env-type-card-${envType.id}`}
                className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 transition-colors hover:border-zinc-700"
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: envType.color }}
                      />
                      <CardTitle className="text-lg text-white">
                        {envType.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      {envType.is_default && (
                        <span data-testid={`env-type-default-badge-${envType.id}`} className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                          Default
                        </span>
                      )}
                      {envType.is_protected && (
                        <span data-testid={`env-type-protected-badge-${envType.id}`} className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-300">
                          Protected
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Indexed Variables
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {envType.variable_count || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                        Mutation Policy
                      </p>
                      <p className="mt-2 text-sm font-medium text-white">
                        {envType.is_protected
                          ? "Reviewed only"
                          : "Direct edits enabled"}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-zinc-400">
                    {envType.is_protected ? (
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 h-4 w-4 text-red-300" />
                        <span>Changes go through Change Requests.</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <Layers3 className="mt-0.5 h-4 w-4 text-emerald-300" />
                        <span>Direct edits are allowed.</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
                    <Button
                      onClick={() =>
                        navigate(
                          `${appDetailPath(appId ?? "")}?env=${envType.id}&selected=${envType.id}`
                        )
                      }
                      data-testid={`env-type-open-workspace-${envType.id}`}
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      <FolderKanban className="mr-2 h-4 w-4" />
                      Open Workspace
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => openEditSheet(envType)}
                        variant="ghost"
                        size="sm"
                        data-testid={`env-type-edit-${envType.id}`}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => openDeleteDialog(envType)}
                        variant="ghost"
                        size="sm"
                        data-testid={`env-type-delete-${envType.id}`}
                        className="text-zinc-400 hover:bg-red-900/20 hover:text-red-400"
                        disabled={envType.is_protected}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {environmentTypes.length === 0 && (
              <div className="col-span-full">
                <Card className="border-dashed border-zinc-800 bg-zinc-900">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Settings className="mb-4 h-12 w-12 text-zinc-600" />
                    <h3 className="mb-2 text-lg font-medium text-white">
                      No Environment Types
                    </h3>
                    <p className="mb-6 max-w-md text-center text-zinc-400">
                      Create your first environment type to start organizing variables. Common types include Development, Staging, and Production.
                    </p>
                    <Button
                      onClick={openCreateSheet}
                      className="bg-emerald-500 text-white hover:bg-emerald-600"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create Environment Type
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          <Card className="border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <CardHeader>
              <CardTitle className="text-white">Quick Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-400">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-medium text-zinc-200">Keep daily lanes editable</p>
                <p className="mt-2">Development and preview usually stay direct-edit.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-medium text-zinc-200">Choose one default lane</p>
                <p className="mt-2">It becomes the starting context for operators.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-medium text-zinc-200">Protect production-like lanes</p>
                <p className="mt-2">Use protection when changes should be reviewed first.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageShell>

      <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
        <SheetContent
          side="right"
          className="w-full border-zinc-800 bg-zinc-900 sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle className="text-white">
              Create Environment Type
            </SheetTitle>
            <SheetDescription className="text-zinc-400">
              Add a new environment lane for this project.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{renderEnvironmentForm("create")}</div>
          <SheetFooter className="mt-8">
            <Button
              onClick={() => setShowCreateSheet(false)}
              variant="outline"
              className="border-zinc-700 text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createEnvironmentType.isPending}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              {createEnvironmentType.isPending
                ? "Creating..."
                : "Create Environment Type"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={showEditSheet} onOpenChange={setShowEditSheet}>
        <SheetContent
          side="right"
          className="w-full border-zinc-800 bg-zinc-900 sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle className="text-white">Edit Environment Type</SheetTitle>
            <SheetDescription className="text-zinc-400">
              Update naming, color, and workflow rules.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{renderEnvironmentForm("edit")}</div>
          <SheetFooter className="mt-8">
            <Button
              onClick={closeEditSheet}
              variant="outline"
              className="border-zinc-700 text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateEnvironmentType.isPending}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              {updateEnvironmentType.isPending
                ? "Updating..."
                : "Update Environment Type"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              Delete Environment Type
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              This action cannot be undone. Type the environment name to confirm deletion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>
                  Deleting <strong>{selectedEnvironment?.name}</strong> removes that environment type from this project.
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm-text" className="text-white">
                Confirm Environment Name
              </Label>
              <Input
                id="delete-confirm-text"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder={selectedEnvironment?.name}
                className="border-zinc-700 bg-zinc-950 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowDeleteDialog(false)}
              variant="outline"
              className="border-zinc-700 text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={
                deleteConfirmText !== selectedEnvironment?.name ||
                deleteEnvironmentType.isPending
              }
              variant="destructive"
            >
              {deleteEnvironmentType.isPending ? "Deleting..." : "Delete Environment Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageEnvironment;
