import { useEffect, useMemo, useState } from "react";
import { GitPullRequest, Check, X, Ban, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ChangeRequests = () => {
  const { user, api: sdkApi } = useAuth();
  const canReview = Boolean(user?.role?.is_admin || user?.role?.is_master);
  const { data: requests = [] } = api.changeRequests.getChangeRequests();
  const { data: apps = [] } = api.applications.allApplications();

  const [selectedAppId, setSelectedAppId] = useState("");
  const [mode, setMode] = useState<"direct" | "promotion">("direct");
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
  const { data: selectedRequest } = api.changeRequests.getChangeRequest(selectedRequestId || undefined);

  const [appDetail, setAppDetail] = useState<Awaited<ReturnType<typeof sdkApi.applications.getApp>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selectedAppId) {
      setAppDetail(null);
      return;
    }

    sdkApi.applications
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
  }, [selectedAppId, sdkApi.applications]);

  const createDirect = api.changeRequests.createDirect({
    onSuccess: () => toast.success("Change request created"),
    onError: ({ error }) => toast.error(error.message || "Failed to create request"),
  });
  const createPromotion = api.changeRequests.createPromotion({
    onSuccess: () => toast.success("Promotion request created"),
    onError: ({ error }) => toast.error(error.message || "Failed to create request"),
  });
  const approve = api.changeRequests.approve({
    onSuccess: () => {
      toast.success("Change request approved");
      setSelectedRequestId(null);
    },
    onError: ({ error }) => toast.error(error.message || "Failed to approve request"),
  });
  const reject = api.changeRequests.reject({
    onSuccess: () => {
      toast.success("Change request rejected");
      setSelectedRequestId(null);
      setRejectReason("");
    },
    onError: ({ error }) => toast.error(error.message || "Failed to reject request"),
  });
  const cancel = api.changeRequests.cancel({
    onSuccess: () => toast.success("Change request cancelled"),
    onError: ({ error }) => toast.error(error.message || "Failed to cancel request"),
  });

  const envTypes = appDetail?.env_types || [];

  const submit = () => {
    if (!selectedAppId || !targetEnvTypeId || !title.trim() || !message.trim()) return;

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
      ? [{ key: envKey.trim().toUpperCase(), proposed_value: envValue, operation: "CREATE" as const }]
      : undefined;
    const secrets = secretKey.trim()
      ? [{ key: secretKey.trim().toUpperCase(), proposed_value: secretValue, operation: "CREATE" as const }]
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

  const requestRows = useMemo(() => {
    return requests.map((request) => {
      const app = apps.find((entry) => entry.id === request.app_id);
      return {
        ...request,
        appName: app?.name || request.app_id,
      };
    });
  }, [apps, requests]);

  return (
    <div className="animate-page-enter space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-500/10 p-2 ring-1 ring-violet-500/20">
          <GitPullRequest className="size-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-100 tracking-tight">Change Requests</h1>
          <p className="mt-0.5 text-sm text-gray-400">
            Protected environments now route through review and promotion instead of direct mutation.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-gray-800 bg-gray-950/70">
          <CardHeader>
            <CardTitle className="text-white">Create Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white">Request type</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as "direct" | "promotion")}>
                  <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900">
                    <SelectItem value="direct" className="text-white">Direct protected change</SelectItem>
                    <SelectItem value="promotion" className="text-white">Promotion request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-white">Project</Label>
                <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                  <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
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

            <div className="space-y-2">
              <Label className="text-white">Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} className="border-gray-700 bg-gray-950 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-white">Message</Label>
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} className="border-gray-700 bg-gray-950 text-white" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {mode === "promotion" && (
                <div className="space-y-2">
                  <Label className="text-white">Source environment</Label>
                  <Select value={sourceEnvTypeId} onValueChange={setSourceEnvTypeId}>
                    <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent className="border-gray-700 bg-gray-900">
                      {envTypes.map((envType) => (
                        <SelectItem key={envType.id} value={envType.id} className="text-white">
                          {envType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-white">Target environment</Label>
                <Select value={targetEnvTypeId} onValueChange={setTargetEnvTypeId}>
                  <SelectTrigger className="border-gray-700 bg-gray-950 text-white">
                    <SelectValue placeholder="Select target" />
                  </SelectTrigger>
                  <SelectContent className="border-gray-700 bg-gray-900">
                    {envTypes.map((envType) => (
                      <SelectItem key={envType.id} value={envType.id} className="text-white">
                        {envType.name} {envType.is_protected ? "(protected)" : ""}
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
                  <Input value={envKey} onChange={(event) => setEnvKey(event.target.value)} placeholder="DATABASE_URL" className="border-gray-700 bg-gray-950 text-white" />
                  <Textarea value={envValue} onChange={(event) => setEnvValue(event.target.value)} placeholder="postgres://..." className="border-gray-700 bg-gray-950 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Secret</Label>
                  <Input value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder="API_TOKEN" className="border-gray-700 bg-gray-950 text-white" />
                  <Textarea value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder="secret value" className="border-gray-700 bg-gray-950 text-white" />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
              Requesters can propose the change. Reviewers with protected-environment authority approve or reject it.
            </div>

            <Button className="bg-violet-500 hover:bg-violet-600" onClick={submit}>
              Submit request
            </Button>
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-950/70">
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
                    <TableCell className="text-gray-300 capitalize">{request.request_kind}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          request.status === "approved"
                            ? "bg-green-500/10 text-green-300"
                            : request.status === "rejected"
                              ? "bg-red-500/10 text-red-300"
                              : request.status === "cancelled"
                                ? "bg-gray-800 text-gray-300"
                                : "bg-yellow-500/10 text-yellow-300"
                        }
                      >
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
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          View
                        </Button>
                        {request.status === "pending" && canReview && request.requested_by_user_id !== user?.user.id && (
                          <Button
                            variant="ghost"
                            className="text-green-300 hover:bg-green-950 hover:text-green-200"
                            onClick={() => approve.mutate({ id: request.id, app_id: request.app_id })}
                          >
                            <Check className="mr-1 size-4" />
                            Approve
                          </Button>
                        )}
                        {request.status === "pending" && request.requested_by_user_id === user?.user.id && (
                          <Button
                            variant="ghost"
                            className="text-gray-300 hover:bg-gray-800"
                            onClick={() => cancel.mutate({ id: request.id, app_id: request.app_id })}
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
      </div>

      <Dialog open={Boolean(selectedRequestId)} onOpenChange={(open) => !open && setSelectedRequestId(null)}>
        <DialogContent className="max-w-3xl border-gray-800 bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedRequest?.title || "Change request"}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Type</p>
                  <p className="mt-1 text-sm text-white capitalize">{selectedRequest.request_kind}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                  <p className="mt-1 text-sm text-white capitalize">{selectedRequest.status}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Env changes</p>
                  <p className="mt-1 text-sm text-white">{selectedRequest.env_item_count}</p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Secret changes</p>
                  <p className="mt-1 text-sm text-white">{selectedRequest.secret_item_count}</p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4 text-sm text-gray-300">
                {selectedRequest.message}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                  <h3 className="mb-3 font-medium text-white">Environment Items</h3>
                  <div className="space-y-2">
                    {selectedRequest.env_items.map((item) => (
                      <div key={item.id} className="rounded border border-gray-800 bg-gray-900/70 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-white">{item.key}</span>
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-300">
                            {item.operation}
                          </Badge>
                        </div>
                        <p className="mt-2 text-gray-400">
                          {item.previous_value || "empty"} → {item.proposed_value || "deleted"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
                  <h3 className="mb-3 font-medium text-white">Secret Items</h3>
                  <div className="space-y-2">
                    {selectedRequest.secret_items.map((item) => (
                      <div key={item.id} className="rounded border border-gray-800 bg-gray-900/70 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-white">{item.key}</span>
                          <Badge variant="secondary" className="bg-red-500/10 text-red-300">
                            {item.operation}
                          </Badge>
                        </div>
                        <p className="mt-2 text-gray-400">
                          {item.previous_value || "empty"} → {item.proposed_value || "deleted"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedRequest.status === "pending" && canReview && selectedRequest.requested_by_user_id !== user?.user.id && (
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
                      onClick={() => approve.mutate({ id: selectedRequest.id, app_id: selectedRequest.app_id })}
                    >
                      <Check className="mr-2 size-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-700 text-red-300 hover:bg-red-950"
                      onClick={() =>
                        reject.mutate({
                          id: selectedRequest.id,
                          rejection_reason: rejectReason || "Rejected during review",
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
          )}
          <DialogFooter>
            <Button variant="outline" className="border-gray-700 text-gray-200" onClick={() => setSelectedRequestId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChangeRequests;
