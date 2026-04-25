import { AlertCircle, GitCompareArrows } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	PitDiffResponse,
} from "@/pages/PointInTimeVariables/pit.utils";
import {
	buildPitDiffRows,
	getPitItemLabel,
} from "@/pages/PointInTimeVariables/pit.utils";

interface PitDiffResultsProps {
	kind: PitDataKind;
	title: string;
	description: string;
	diff: PitDiffResponse | null;
	isPending: boolean;
	error?: Error | null;
	hasPreviewed: boolean;
}

export const PitDiffResults = ({
	kind,
	title,
	description,
	diff,
	isPending,
	error,
	hasPreviewed,
}: PitDiffResultsProps) => {
	const rows = buildPitDiffRows(diff, kind);
	const totalChanges = rows.length;
	const itemLabel = getPitItemLabel(kind);

	return (
		<Card className="border-zinc-800 bg-zinc-900">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base text-white">
					<GitCompareArrows className="size-4 text-emerald-400" />
					{title}
				</CardTitle>
				<p className="text-sm text-zinc-400">{description}</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<Alert className="border-red-500/20 bg-red-500/10 text-red-200">
						<AlertCircle className="size-4" />
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				)}

				{isPending && (
					<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
						Loading diff results...
					</div>
				)}

				{!isPending && !error && !hasPreviewed && (
					<div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
						Run a comparison to render the inline diff here.
					</div>
				)}

				{!isPending && !error && hasPreviewed && diff && totalChanges === 0 && (
					<div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
						No net {itemLabel} changes were found for the selected comparison.
					</div>
				)}

				{!isPending && !error && hasPreviewed && diff && totalChanges > 0 && (
					<>
						<div className="flex flex-wrap items-center gap-2">
							<Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
								Added: {diff.added.length}
							</Badge>
							<Badge className="border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
								Modified: {diff.modified.length}
							</Badge>
							<Badge className="border border-amber-500/20 bg-amber-500/10 text-amber-300">
								Deleted: {diff.deleted.length}
							</Badge>
						</div>

						<Table>
							<TableHeader>
								<TableRow className="border-zinc-800 hover:bg-transparent">
									<TableHead className="text-zinc-500">Change type</TableHead>
									<TableHead className="text-zinc-500">Key</TableHead>
									<TableHead className="text-zinc-500">Before</TableHead>
									<TableHead className="text-zinc-500">After</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={`${row.type}-${row.key}`} className="border-zinc-800 hover:bg-zinc-800/60">
										<TableCell className="text-zinc-200">{row.type}</TableCell>
										<TableCell className="font-mono text-sm text-white">{row.key}</TableCell>
										<TableCell className="text-zinc-400">{row.before}</TableCell>
										<TableCell className="text-zinc-200">{row.after}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</>
				)}
			</CardContent>
		</Card>
	);
};
