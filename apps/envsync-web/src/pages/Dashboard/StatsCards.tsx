import { Database, Variable, Users, Key, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  stats: {
    projectsCount: number;
    variablesCount: number;
    teamMembersCount: number;
    apiKeysCount: number;
  };
}

export const statCardConfigs = [
  {
    label: "Projects",
    key: "projectsCount" as const,
    testId: "dashboard-stat-projects",
    icon: Database,
    gradient: "from-emerald-500/20 to-emerald-600/20",
    iconColor: "text-emerald-400",
  },
  {
    label: "Variables / Secrets",
    key: "variablesCount" as const,
    testId: "dashboard-stat-config-items",
    icon: Variable,
    gradient: "from-emerald-500/20 to-emerald-600/20",
    iconColor: "text-emerald-400",
  },
  {
    label: "Team Members",
    key: "teamMembersCount" as const,
    testId: "dashboard-stat-team-members",
    icon: Users,
    gradient: "from-blue-500/20 to-blue-600/20",
    iconColor: "text-blue-400",
  },
  {
    label: "API Keys",
    key: "apiKeysCount" as const,
    testId: "dashboard-stat-api-keys",
    icon: Key,
    gradient: "from-emerald-500/20 to-emerald-600/20",
    iconColor: "text-emerald-400",
  },
];

export function BentoStatCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconColor,
  testId,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex h-full items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="mt-2 text-3xl font-bold text-zinc-100 tabular-nums">
          {value}
        </p>
      </div>
      <div
        className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 bg-gradient-to-br ${gradient}`}
      >
        <Icon className={`size-5 ${iconColor}`} />
      </div>
    </div>
  );
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCardConfigs.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.key}
            data-testid={card.testId}
            className="bg-card text-card-foreground bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-xl rounded-xl hover:border-zinc-700 transition-colors"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">{card.label}</p>
                  <p className="text-2xl font-bold text-zinc-100 mt-1 tabular-nums">
                    {stats[card.key]}
                  </p>
                </div>
                <div
                  className={`p-2.5 rounded-xl ring-1 ring-white/5 bg-gradient-to-br ${card.gradient}`}
                >
                  <Icon className={`size-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
