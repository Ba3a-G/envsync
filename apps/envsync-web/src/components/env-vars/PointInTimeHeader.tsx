import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
	ArrowLeft,
	Clock3,
	Database,
	RefreshCw,
	Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EnvironmentType } from "@/constants";
import {
	buildPitHref,
	getPitKindFromPathname,
} from "@/pages/PointInTimeVariables/pit.utils";

interface PointInTimeHeaderProps {
	projectName: string;
	environmentTypes: EnvironmentType[];
	selectedEnvironmentId?: string;
	isRefetching: boolean;
	enableSecrets?: boolean;
	onBack: () => void;
	onRefresh: () => void;
	onEnvironmentChange?: (environmentId: string) => void;
}

export const PointInTimeHeader = ({
	projectName,
	environmentTypes,
	selectedEnvironmentId,
	isRefetching,
	enableSecrets,
	onBack,
	onRefresh,
	onEnvironmentChange,
}: PointInTimeHeaderProps) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { appId } = useParams();

	const isSecretsPage = getPitKindFromPathname(location.pathname) === "secrets";
	const currentSection = isSecretsPage ? "Secrets" : "Variables";
	const selectedEnvironment =
		environmentTypes.find((environment) => environment.id === selectedEnvironmentId) ??
		environmentTypes[0];

	function handleSectionChange(section: "variables" | "secrets") {
		if (!appId) return;
		const query = selectedEnvironment?.name?.toLowerCase();
		navigate(buildPitHref(appId, section, query));
	}

	return (
		<div className="space-y-4">
			<Card className="border-zinc-800 bg-zinc-900">
				<CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-3">
						<div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
							<Button
								variant="ghost"
								size="sm"
								onClick={onBack}
								className="h-8 gap-2 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
							>
								<ArrowLeft className="size-4" />
								Back
							</Button>
							<span>/</span>
							<span className="inline-flex items-center gap-2 text-zinc-300">
								<Database className="size-4 text-emerald-400" />
								{projectName}
							</span>
							<span>/</span>
							<span className="inline-flex items-center gap-2 text-white">
								<Clock3 className="size-4 text-emerald-400" />
								Point in Time
							</span>
						</div>

						<div className="space-y-1">
							<h1 className="text-2xl font-semibold text-white">{projectName}</h1>
							<p className="text-sm text-zinc-400">
								Review snapshot history, compare changes, and restore environment state.
							</p>
						</div>

						{enableSecrets ? (
							<div className="inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-950 p-1">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSectionChange("variables")}
									className={cn(
										"h-8 gap-2 rounded-md px-3 text-sm",
										!isSecretsPage
											? "bg-zinc-800 text-white hover:bg-zinc-800"
											: "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
									)}
								>
									<Clock3 className="size-4 text-emerald-400" />
									Variables
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => handleSectionChange("secrets")}
									className={cn(
										"h-8 gap-2 rounded-md px-3 text-sm",
										isSecretsPage
											? "bg-zinc-800 text-white hover:bg-zinc-800"
											: "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
									)}
								>
									<Shield className="size-4 text-cyan-400" />
									Secrets
								</Button>
							</div>
						) : (
							<Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
								{currentSection} PiT
							</Badge>
						)}
					</div>

					<div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[280px]">
						{selectedEnvironment && (
							<Select
								value={selectedEnvironment.id}
								onValueChange={onEnvironmentChange}
							>
								<SelectTrigger className="border-zinc-800 bg-zinc-950 text-white">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="border-zinc-800 bg-zinc-900 text-white">
									{environmentTypes.map((environment) => (
										<SelectItem key={environment.id} value={environment.id}>
											<div className="flex items-center gap-2">
												<span
													className="size-2 rounded-full"
													style={{
														backgroundColor: environment.color || "#10b981",
													}}
												/>
												<span>{environment.name}</span>
												{environment.is_default && (
													<span className="text-xs text-zinc-500">Default</span>
												)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							disabled={isRefetching}
							className="border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-800 hover:text-white"
						>
							<RefreshCw className={cn("mr-2 size-4", isRefetching && "animate-spin")} />
							Refresh history
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
};
