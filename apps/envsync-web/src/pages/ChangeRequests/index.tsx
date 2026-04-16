import { useEffect, useMemo, useState } from "react";
import { Ban, Check, GitPullRequest, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { api, sdk } from "@/api";
import { useAuthContext } from "@/contexts/auth";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type RequestMode = "direct" | "promotion";
type ActiveView = "requests" | "create";

const getStatusClass = (status: string) => {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-200";
  if (status === "rejected") return "bg-red-500/10 text-red-200";
  if (status === "cancelled") return "bg-gray-700 text-gray-200";
  return "bg-amber-500/10 text-amber-200";
};

const ChangeRequests = () => {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuthContext();
  const authEnabled = !isAuthLoading && isAuthenticated;
  const canReview = Boolean(user?.role?.is_admin || user?.role?.is_master);

  const { data: requests = [] } = api.changeRequests.getChangeRequests(undefined, {
    enabled: authEnabled,
  });
  const { data: apps = [] } = api.applications.allApplications({
    enabled: authEnabled,
  });

  const [activeView, setActiveView] = useState<ActiveView>("requests");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [mode, setMode] = useState<RequestMode>("direct");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetEnvTypeId, setTargetEnvTypeId] = useState("");
  const [sourceEnvTypeId, setSourceEnvTypeId] = useState("");
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: selectedRequest } = api.changeRequests.getChangeRequest(
    selectedRequestId || undefined,
    { enabled: authEnabled }
  );

  const [appDetail, setAppDetail] = useState<
    Awaited<ReturnType<typeof sdk.applications.getApp>> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedAppId) {
      setAppDetail(null);
      return;
    }

    sdk.applications
      .getApp(selectedAppId)
      .then((response) => {
        if (!cancelled) setAppDetail(response);
      })
      .catch(() => {
        if (!cancelled) setAppDetail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAppId]);

  const createDirect = api.changeRequests.createDirect({
    onSuccess: () => {
      toast.success("Change request created");
      setActiveView("requests");
      setTitle("");
      setMessage("");
      setEnvKey("");
      setEnvValue("");
      setSecretKey("");
      setSecretValue("");
    },
    onError: ({ error }) =>
      toast.error(error.message || "Failed to create request"),
  });

  const createPromotion = api.changeRequests.createPromotion({
    onSuccess: () => {
      toast.success("Promotion request created");
      setActiveView("requests");
      setTitle("");
      setMessage("");
    },
    onError: ({ error }) =>
      toast.error(error.message || "Failed to create request"),
  });

  const approve = api.changeRequests.approve({
    onSuccess: () => {
      toast.success("Change request approved");
      setSelectedRequestId(null);
    },
    onError: ({ error }) =>
      toast.error(error.message || "Failed to approve request"),
  });

  const reject = api.changeRequests.reject({
    onSuccess: () => {
      toast.success("Change request rejected");
      setSelectedRequestId(null);
      setRejectReason("");
    },
    onError: ({ error }) =>
      toast.error(error.message || "Failed to reject request"),
  });

  const cancel = api.changeRequests.cancel({
    onSuccess: () => toast.success("Change request cancelled"),
    onError: ({ error }) =>
      toast.error(error.message || "Failed to cancel request"),
  });

  const envTypes = appDetail?.env_types || [];

  const submit = () => {
    if (!selectedAppId || !targetEnvTypeId || !title.trim() || !message.trim()) {
      return;
    }

    if (mode === "promotion") {
      if (!sourceEnvTypeId) return;
      createPromotion.mutate({
        app_id: selectedAppId,
        source_env_type_id: sourceEnvTypeId,
        target_env_type_id: targetEnvTypeId,
        title: title.trim(),
        message: message.trim(),
      });
      return;
    }

    const envs = envKey.trim()
      ? [
          {
            key: envKey.trim().toUpperCase(),
            proposed_value: envValue,
            operation: "CREATE" as const,
          },
        ]
      : undefined;
    const secrets = secretKey.trim()
      ? [
          {
            key: secretKey.trim().toUpperCase(),
            proposed_value: secretValue,
            operation: "CREATE" as const,
          },
        ]
      : undefined;

    createDirect.mutate({
      app_id: selectedAppId,
      target_env_type_id: targetEnvTypeId,
      title: title.trim(),
      message: message.trim(),
      envs,
      secrets,
    });
  };

  const requestRows = useMemo(
    () =>
      requests.map((request) => {
        const app = apps.find((entry) => entry.id === request.app_id);
        return {
          ...request,
          appName: app?.name || request.app_id,
        };
      }),
    [apps, requests]
  );

  const pendingRequests = requestRows.filter(
    (request) => request.status === "pending"
  ).length;
  const awaitingReview = requestRows.filter(
    (request) =>
      request.status === "pending" &&
      request.requested_by_user_id !== user?.user.id
  ).length;

  return (
    <div className="animate-page-enter space-y-6">
      <PageShell
        title="Change Requests"
        description="Route protected environment changes through a reviewable, auditable workflow."
        icon={GitPullRequest}
        stats={[
          {
            label: "Requests",
            value: requestRows.length,
            hint: "Open and recent change requests",
          },
          {
            label: "Pending",
            value: pendingRequests,
            hint: "Waiting on action",
            tone: pendingRequests > 0 ? "warning" : "default",
          },
          {
            label: "Need Review",
            value: awaitingReview,
            hint: "Requests others submitted",
            tone: awaitingReview > 0 ? "danger" : "default",
          },
        ]}
        secondaryNav={
          <Tabs
            value={activeView}
            onValueChange={(value) => setActiveView(value as ActiveView)}
          >
            <TabsList className="h-auto bg-transparent p-0">
              <TabsTrigger
                data-testid="change-requests-tab-list"
                value="requests"
                className="rounded-xl data-[state=active]:bg-violet-500/18 data-[state=active]:text-white"
              >
                Requests
              </TabsTrigger>
              <TabsTrigger
                data-testid="change-requests-tab-create"
                value="create"
                className="rounded-xl data-[state=active]:bg-violet-500/18 data-[state=active]:text-white"
              >
                Create Request
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <Tabs
          value={activeView}
          onValueChange={(value) => setActiveView(value as ActiveView)}
          className="space-y-6"
        >
          <TabsContent value="create" className="mt-0">
            <Card data-testid="change-requests-create-panel" className="border-gray-800 bg-gray-950/70">
              <CardHeader>
                <CardTitle className="text-white">Create Request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-white">Request type</Label>
                    <Select
                      value={mode}
                      onValueChange={(value) => setMode(value as RequestMode)}
                    >
                      <SelectTrigger
                        data-testid="change-request-mode-select"
                        className="border-gray-700 bg-gray-950 text-white"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-gray-700 bg-gray-900">
                        <SelectItem value="direct" className="text-white">
                          Direct protected change
                        </SelectItem>
                        <SelectItem value="promotion" className="text-white">
                          Promotion request
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white">Project</Label>
                    <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                      <SelectTrigger
                        data-testid="change-request-project-select"
                        className="border-gray-700 bg-gray-950 text-white"
                      >
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent className="border-gray-700 bg-gray-900">
                        {apps.map((app) => (
                          <SelectItem key={app.id} value={app.id} className="text-white">
                            {app.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-2">
                    <Label className="text-white">Title</Label>
                    <Input
                      data-testid="change-request-title-input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="border-gray-700 bg-gray-950 text-white"
                    />
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
                    <p className="font-medium text-gray-200">Request summary</p>
                    <p className="mt-2">
                      {mode === "promotion"
                        ? "Promote values from a lower environment into a protected target."
                        : "Propose env or secret changes directly against a protected environment."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Message</Label>
                  <Textarea
                    data-testid="change-request-message-input"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="border-gray-700 bg-gray-950 text-white"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {mode === "promotion" && (
                    <div className="space-y-2">
                      <Label className="text-white">Source environment</Label>
                      <Select
                        value={sourceEnvTypeId}
                        onValueChange={setSourceEnvTypeId}
                      >
                        <SelectTrigger
                          data-testid="change-request-source-env-select"
                          className="border-gray-700 bg-gray-950 text-white"
                        >
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent className="border-gray-700 bg-gray-900">
                          {envTypes.map((envType) => (
                            <SelectItem
                              key={envType.id}
                              value={envType.id}
                              className="text-white"
                            >
                              {envType.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-white">Target environment</Label>
                    <Select
                      value={targetEnvTypeId}
                      onValueChange={setTargetEnvTypeId}
                    >
                      <SelectTrigger
                        data-testid="change-request-target-env-select"
                        className="border-gray-700 bg-gray-950 text-white"
                      >
                        <SelectValue placeholder="Select target" />
                      </SelectTrigger>
                      <SelectContent className="border-gray-700 bg-gray-900">
                        {envTypes.map((envType) => (
                          <SelectItem
                            key={envType.id}
                            value={envType.id}
                            className="text-white"
                          >
                            {envType.name}{" "}
                            {envType.is_protected ? "(protected)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {mode === "direct" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-white">Env var</Label>
                      <Input
                        data-testid="change-request-env-key-input"
                        value={envKey}
                        onChange={(event) => setEnvKey(event.target.value)}
                        placeholder="DATABASE_URL"
                        className="border-gray-700 bg-gray-950 text-white"
                      />
                      <Textarea
                        data-testid="change-request-env-value-input"
                        value={envValue}
                        onChange={(event) => setEnvValue(event.target.value)}
                        placeholder="postgres://..."
                        className="border-gray-700 bg-gray-950 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Secret</Label>
                      <Input
                        data-testid="change-request-secret-key-input"
                        value={secretKey}
                        onChange={(event) => setSecretKey(event.target.value)}
                        placeholder="API_TOKEN"
                        className="border-gray-700 bg-gray-950 text-white"
                      />
                      <Textarea
                        data-testid="change-request-secret-value-input"
                        value={secretValue}
                        onChange={(event) => setSecretValue(event.target.value)}
                        placeholder="secret value"
                        className="border-gray-700 bg-gray-950 text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
                  Requesters can propose the change. Reviewers with protected-environment authority approve or reject it.
                </div>

                <Button
                  className="bg-violet-500 hover:bg-violet-600"
                  onClick={submit}
                  data-testid="change-request-submit-button"
                >
                  Submit request
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="mt-0">
            <Card data-testid="change-requests-list" className="border-gray-800 bg-gray-950/70">
              <CardHeader>
                <CardTitle className="text-white">Open and Recent Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-transparent">
                      <TableHead className="text-gray-400">Title</TableHead>
                      <TableHead className="text-gray-400">Project</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Status</TableHead>
                      <TableHead className="text-gray-400">Items</TableHead>
                      <TableHead className="text-right text-gray-400">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestRows.map((request) => (
                      <TableRow key={request.id} className="border-gray-800">
                        <TableCell className="text-white">{request.title}</TableCell>
                        <TableCell className="text-gray-300">{request.appName}</TableCell>
                        <TableCell className="text-gray-300 capitalize">
                          {request.request_kind}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusClass(request.status)}>
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-300">
                          {request.env_item_count} env / {request.secret_item_count} secret
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              className="text-gray-200"
                              data-testid="change-request-view-button"
                              onClick={() => setSelectedRequestId(request.id)}
                            >
                              View
                            </Button>
                            {request.status === "pending" &&
                              canReview &&
                              request.requested_by_user_id !== user?.user.id && (
                                <Button
                                  variant="ghost"
                                  className="text-green-300 hover:bg-green-950 hover:text-green-200"
                                  data-testid="change-request-approve-button"
                                  onClick={() =>
                                    approve.mutate({
                                      id: request.id,
                                      app_id: request.app_id,
                                    })
                                  }
                                >
                                  <Check className="mr-1 size-4" />
                                  Approve
                                </Button>
                              )}
                            {request.status === "pending" &&
                              request.requested_by_user_id === user?.user.id && (
                                <Button
                                  variant="ghost"
                                  className="text-gray-300 hover:bg-gray-800"
                                  data-testid="change-request-cancel-button"
                                  onClick={() =>
                                    cancel.mutate({
                                      id: request.id,
                                      app_id: request.app_id,
                                    })
                                  }
                                >
                                  <Ban className="mr-1 size-4" />
                                  Cancel
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageShell>

      <Dialog
        open={Boolean(selectedRequestId)}
        onOpenChange={(open) => !open && setSelectedRequestId(null)}
      >
        <DialogContent data-testid="change-request-detail-dialog" className="flex max-h-[85vh] max-w-3xl flex-col border-gray-800 bg-gray-900">
          <DialogHeader className="shrink-0">
            <DialogTitle className="pr-8 text-white">
              {selectedRequest?.title || "Change request"}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Type</p>
                  <p className="mt-1 text-sm capitalize text-white">
                    {selectedRequest.request_kind}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <p className="mt-1 text-sm capitalize text-white">
                    {selectedRequest.status}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Env changes</p>
                  <p className="mt-1 text-sm text-white">
                    {selectedRequest.env_item_count}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Secret changes</p>
                  <p className="mt-1 text-sm text-white">
                    {selectedRequest.secret_item_count}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-300">
                {selectedRequest.message}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div data-testid="change-request-detail-env-items" className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                  <h3 className="mb-3 font-medium text-white">Environment Items</h3>
                  <div className="space-y-2">
                    {selectedRequest.env_items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-gray-800 bg-gray-900/70 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-white">{item.key}</span>
                          <Badge className="bg-violet-500/10 text-violet-300">
                            {item.operation}
                          </Badge>
                        </div>
                        <p className="mt-2 text-gray-400">
                          {item.previous_value || "empty"} →{" "}
                          {item.proposed_value || "deleted"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div data-testid="change-request-detail-secret-items" className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                  <h3 className="mb-3 font-medium text-white">Secret Items</h3>
                  <div className="space-y-2">
                    {selectedRequest.secret_items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded border border-gray-800 bg-gray-900/70 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-white">{item.key}</span>
                          <Badge className="bg-red-500/10 text-red-300">
                            {item.operation}
                          </Badge>
                        </div>
                        <p className="mt-2 text-gray-400">
                          {item.previous_value || "empty"} →{" "}
                          {item.proposed_value || "deleted"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedRequest.status === "pending" &&
                canReview &&
                selectedRequest.requested_by_user_id !== user?.user.id && (
                  <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/30 p-4">
                    <div className="mb-3 flex items-center gap-2 text-yellow-300">
                      <ShieldAlert className="size-4" />
                      Review decision
                    </div>
                    <Textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Optional rejection reason"
                      className="border-gray-700 bg-gray-950 text-white"
                    />
                    <div className="mt-3 flex gap-2">
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="change-request-dialog-approve-button"
                        onClick={() =>
                          approve.mutate({
                            id: selectedRequest.id,
                            app_id: selectedRequest.app_id,
                          })
                        }
                      >
                        <Check className="mr-2 size-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        className="border-red-700 text-red-300 hover:bg-red-950"
                        data-testid="change-request-dialog-reject-button"
                        onClick={() =>
                          reject.mutate({
                            id: selectedRequest.id,
                            rejection_reason:
                              rejectReason || "Rejected during review",
                            app_id: selectedRequest.app_id,
                          })
                        }
                      >
                        <X className="mr-2 size-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0">
            <Button
              variant="outline"
              className="border-gray-700 text-gray-200"
              onClick={() => setSelectedRequestId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChangeRequests;
