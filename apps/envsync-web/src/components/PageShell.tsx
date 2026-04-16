import type { ReactNode, FC } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type PageShellStatTone = "default" | "success" | "warning" | "danger";

interface PageShellStat {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: PageShellStatTone;
}

interface PageShellProps {
  title: string;
  description?: string;
  icon?: FC<{ className?: string }>;
  actions?: ReactNode;
  secondaryNav?: ReactNode;
  statusBanner?: ReactNode;
  stats?: PageShellStat[];
  stickyActions?: boolean;
  children: ReactNode;
  isLoading?: boolean;
}

const toneClasses: Record<PageShellStatTone, string> = {
  default: "border-white/10 bg-white/[0.04] text-white",
  success: "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-100",
  warning: "border-amber-500/20 bg-amber-500/[0.08] text-amber-100",
  danger: "border-rose-500/20 bg-rose-500/[0.08] text-rose-100",
};

export function PageShell({
  title,
  description,
  icon: Icon,
  actions,
  secondaryNav,
  statusBanner,
  stats,
  stickyActions = false,
  children,
  isLoading,
}: PageShellProps) {
  if (isLoading) {
    return (
      <div className="animate-page-enter space-y-6">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-2xl bg-gray-800" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-48 bg-gray-800" />
                <Skeleton className="h-4 w-72 bg-gray-800" />
              </div>
            </div>
            <Skeleton className="h-9 w-32 bg-gray-800" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl bg-gray-800" />
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-14 w-full rounded-2xl bg-gray-800" />
          <div className="space-y-2">
            <Skeleton className="h-64 w-full rounded-3xl bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-enter space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#10131d] via-[#0d1119] to-[#0a0f17] shadow-2xl shadow-black/20">
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-violet-500/12 via-sky-500/8 to-transparent pointer-events-none" />
          <div className="relative space-y-5 p-6 md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                {Icon && (
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 shadow-lg shadow-violet-500/10">
                    <Icon className="size-5 text-violet-300" />
                  </div>
                )}
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-gray-50 md:text-[1.9rem]">
                    {title}
                  </h1>
                  {description && (
                    <p className="max-w-2xl text-sm leading-6 text-gray-400 md:text-[15px]">
                      {description}
                    </p>
                  )}
                </div>
              </div>
              {actions && (
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2",
                    stickyActions &&
                      "lg:sticky lg:top-0 lg:justify-end"
                  )}
                >
                  {actions}
                </div>
              )}
            </div>

            {stats && stats.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className={cn(
                      "rounded-2xl border p-4 shadow-lg shadow-black/10 backdrop-blur-sm",
                      toneClasses[stat.tone ?? "default"]
                    )}
                  >
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">
                      {stat.label}
                    </p>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">
                      {stat.value}
                    </div>
                    {stat.hint && (
                      <p className="mt-2 text-sm text-gray-400">{stat.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {statusBanner && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-300">
                {statusBanner}
              </div>
            )}

            {secondaryNav && (
              <div className="rounded-2xl border border-white/10 bg-black/10 p-2">
                {secondaryNav}
              </div>
            )}
          </div>
        </div>
      </section>
      {children}
    </div>
  );
}
