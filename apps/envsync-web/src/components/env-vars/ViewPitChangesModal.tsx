import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	AlertCircle,
	Clock3,
	GitBranch,
	History,
	KeyRound,
	Loader2,
	MessageSquare,
	User,
} from "lucide-react";

import { sdk } from "@/api";
import { useEnvsAtPit } from "@/api/pointInTime.api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	PitDataKind,
	PitHistoryItem,
} from "@/pages/PointInTimeVariables/pit.utils";
import {
	getPitItemLabel,
	getPitKindLabel,
	maskPitValue,
} from "@/pages/PointInTimeVariables/pit.utils";

interface ViewPitChangesModalProps {
	kind: PitDataKind;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	pitData: PitHistoryItem | null;
	projectId: string;
	environmentId: string;
}

export const ViewPitChangesModal = ({
	kind,
	isOpen,
	onOpenChange,
	pitData,
	projectId,
	environmentId,
}: ViewPitChangesModalProps) => {
	const { data: users = [] } = useQuery({
		queryKey: ["pit-users"],
		queryFn: async () => sdk.users.getUsers(),
		staleTime: 5 * 60 * 1000,
	});

	const usersMap = useMemo(
		() => new Map(users.map((entry) => [entry.id, entry])),
		[users]
	);

	const {
		data: pitStateData = [],
		isLoading,
		error,
	} = useEnvsAtPit(
		kind,
		{
			app_id: projectId,
			env_type_id: environmentId,
			pit_id: pitData?.id || "",
		},
		{
			enabled: isOpen && Boolean(pitData?.id && projectId && environmentId),
		}
	);

	if (!pitData) {
		return null;
	}

	const kindLabel = getPitKindLabel(kind);
	const itemLabel = getPitItemLabel(kind);
	const createdCount = pitStateData.filter((item) => item.operation === "CREATE").length;
	const updatedCount = pitStateData.filter((item) => item.operation === "UPDATE").length;
	const operationCount = createdCount + updatedCount;

	function getUserDisplayName(userId: string) {
		const user = usersMap.get(userId);
		if (user?.full_name?.trim()) return user.full_name;
		if (user?.email?.trim()) return user.email;
		if (userId.includes("@")) return userId.split("@")[0];
		return userId;
	}

	function formatDateTime(value: string) {
		return new Date(value).toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	}

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] max-w-5xl flex-col border-zinc-800 bg-zinc-900 text-white">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-xl">
						<History className="size-5 text-emerald-400" />
						{kindLabel} Snapshot Details
					</DialogTitle>
					<DialogDescription className="text-zinc-400">
						Review the recorded snapshot metadata and the {itemLabel} state stored at this point in
						time.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<Card className="border-zinc-800 bg-zinc-950">
						<CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-5">
							<div className="space-y-1">
								<p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
									<GitBranch className="size-3.5" />
									PIT ID
								</p>
								<p className="font-mono text-sm text-white">{pitData.id}</p>
							</div>
							<div className="space-y-1">
								<p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
									<Clock3 className="size-3.5" />
									Created at
								</p>
								<p className="text-sm text-zinc-200">{formatDateTime(pitData.created_at)}</p>
							</div>
							<div className="space-y-1">
								<p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
									<User className="size-3.5" />
									Created by
								</p>
								<p className="text-sm text-zinc-200">{getUserDisplayName(pitData.user_id)}</p>
							</div>
							<div className="space-y-1">
								<p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
									<KeyRound className="size-3.5" />
									Items in snapshot
								</p>
								<p className="text-sm text-zinc-200">{pitStateData.length}</p>
							</div>
							<div className="space-y-1">
								<p className="text-xs uppercase tracking-wide text-zinc-500">Recorded changes</p>
								<p className="text-sm text-zinc-200">{pitData.changes_count}</p>
							</div>
						</CardContent>
					</Card>

					<Card className="border-zinc-800 bg-zinc-950">
						<CardContent className="space-y-4 p-4">
							<div className="space-y-2">
								<p className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
									<MessageSquare className="size-3.5" />
									Message
								</p>
								<p className="text-sm text-zinc-200">{pitData.change_request_message}</p>
							</div>
							<Separator className="bg-zinc-800" />
							<div className="flex flex-wrap items-center gap-2">
								<Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
									Current items: {pitStateData.length}
								</Badge>
								<Badge className="border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
									Recorded ops: {operationCount || pitData.changes_count}
								</Badge>
								{kind === "secrets" && (
									<Badge className="border border-amber-500/20 bg-amber-500/10 text-amber-300">
										Values masked
									</Badge>
								)}
							</div>
						</CardContent>
					</Card>

					{error && (
						<Alert className="border-red-500/20 bg-red-500/10 text-red-200">
							<AlertCircle className="size-4" />
							<AlertDescription>
								Failed to load snapshot state: {error.message}
							</AlertDescription>
						</Alert>
					)}

					<Card className="flex-1 border-zinc-800 bg-zinc-950">
						<CardHeader className="pb-3">
							<CardTitle className="text-base text-white">
								Snapshot state
							</CardTitle>
						</CardHeader>
						<CardContent className="px-0 pt-0">
							<ScrollArea className="max-h-[42vh]">
								{isLoading ? (
									<div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-zinc-400">
										<Loader2 className="size-4 animate-spin" />
										Loading snapshot state...
									</div>
								) : pitStateData.length === 0 ? (
									<div className="px-6 py-16 text-center text-sm text-zinc-500">
										No {itemLabel}s were present in this snapshot.
									</div>
								) : (
									<Table>
										<TableHeader>
											<TableRow className="border-zinc-800 hover:bg-transparent">
												<TableHead className="text-zinc-500">Key</TableHead>
												<TableHead className="text-zinc-500">Value</TableHead>
												<TableHead className="text-zinc-500">Operation</TableHead>
												<TableHead className="text-zinc-500">Last updated</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{pitStateData.map((change) => (
												<TableRow
													key={`${pitData.id}-${change.key}`}
													className="border-zinc-800 hover:bg-zinc-800/60"
												>
													<TableCell className="font-mono text-sm text-white">
														{change.key}
													</TableCell>
													<TableCell className="text-zinc-300">
														{maskPitValue(change.value, kind)}
													</TableCell>
													<TableCell className="text-zinc-300">
														{change.operation ?? "Recorded"}
													</TableCell>
													<TableCell className="text-zinc-400">
														{formatDateTime(change.last_updated)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</ScrollArea>
						</CardContent>
					</Card>
				</div>
			</DialogContent>
		</Dialog>
	);
};
