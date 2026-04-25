import { Clock3, GitCompareArrows } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PitMode } from "@/pages/PointInTimeVariables/pit.utils";

interface PitModeSwitchProps {
	value: PitMode;
	onValueChange: (value: PitMode) => void;
}

export const PitModeSwitch = ({ value, onValueChange }: PitModeSwitchProps) => {
	return (
		<div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
			<ToggleGroup
				type="single"
				value={value}
				onValueChange={(nextValue) => {
					if (nextValue === "snapshots" || nextValue === "time-range") {
						onValueChange(nextValue);
					}
				}}
				className="gap-1"
			>
				<ToggleGroupItem
					value="snapshots"
					aria-label="Snapshots"
					className="h-9 gap-2 rounded-md border-0 px-4 text-sm data-[state=on]:bg-zinc-800 data-[state=on]:text-white"
				>
					<Clock3 className="size-4 text-emerald-400" />
					Snapshots
				</ToggleGroupItem>
				<ToggleGroupItem
					value="time-range"
					aria-label="Time Range"
					className="h-9 gap-2 rounded-md border-0 px-4 text-sm data-[state=on]:bg-zinc-800 data-[state=on]:text-white"
				>
					<GitCompareArrows className="size-4 text-cyan-400" />
					Time Range
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
};
