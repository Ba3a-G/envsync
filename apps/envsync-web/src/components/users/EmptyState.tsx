import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface EmptyStateProps {
  onInviteClick: () => void;
}

export const EmptyState = ({ onInviteClick }: EmptyStateProps) => {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <Plus className="w-8 h-8 text-zinc-400" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">
        No team members yet
      </h3>
      <p className="text-zinc-400 mb-4">
        Invite your first team member to get started collaborating.
      </p>
      <Button
        onClick={onInviteClick}
        className="bg-emerald-500 hover:bg-emerald-600 text-white"
      >
        <Plus className="w-4 h-4 mr-2" />
        Invite Member
      </Button>
    </div>
  );
};
