import { LogOut, Menu, ChevronLeft, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { navGroups } from "@/constants";
import { useAuthContext } from "@/contexts/auth";
import { logoutWebSession } from "@/api";
import { runtimeConfig } from "@/utils/runtime-config";

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ expanded, onToggle }: SidebarProps) => {
  const { user, allowedScopes } = useAuthContext();
  const { pathname } = useLocation();

  const authorizedGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => allowedScopes.includes(item.id)),
        }))
        .filter((group) => group.items.length > 0),
    [allowedScopes]
  );

  const handleLogout = async () => {
    try {
      await logoutWebSession();
    } catch (error) {
      console.error("Failed to logout cleanly:", error);
    }
  };

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-white/10 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 transition-all duration-300 ease-in-out",
        expanded ? "w-64" : "w-16"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent" />

      <div className="flex-shrink-0 border-b border-white/10 px-4 py-5">
        <div className="flex items-center justify-between">
          <div className={cn("flex items-center", expanded ? "gap-3" : "justify-center")}>
            <div className="flex size-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-lg shadow-emerald-500/10">
              <img src="/EnvSync.svg" alt="EnvSync" className="size-8" />
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-wide text-zinc-100">EnvSync</p>
                <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                  Operator Console
                </p>
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-emerald-500/10 hover:text-white"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded ? (
              <ChevronLeft className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-clip px-2 py-4">
        {authorizedGroups.map((group, groupIdx) => (
          <div key={group.label}>
            {expanded ? (
              <div className="mb-2 px-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                  {group.label}
                </span>
              </div>
            ) : (
              groupIdx > 0 && (
                <div className="mx-3 mb-2 border-t border-white/10" />
              )
            )}

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <div key={item.id} className="relative group">
                    <Link
                      to={item.href}
                      className={cn(
                        "relative flex w-full items-center rounded-2xl text-left text-sm font-medium transition-all duration-200",
                        expanded
                          ? "gap-3 px-3 py-2.5"
                          : "justify-center px-2 py-2.5",
                        isActive
                          ? "border border-emerald-500/20 bg-emerald-500/12 text-white shadow-lg shadow-emerald-500/10"
                          : "border border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-zinc-200"
                      )}
                      title={!expanded ? item.name : undefined}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isActive
                            ? "bg-emerald-500/18 text-emerald-100"
                            : "bg-white/[0.04] text-zinc-400 group-hover:text-zinc-100"
                        )}
                      >
                        <Icon className="size-[18px]" />
                      </span>
                      {expanded && (
                        <div className="min-w-0">
                          <span className="block truncate transition-opacity duration-200">
                            {item.name}
                          </span>
                          {isActive && (
                            <span className="text-[11px] text-emerald-200/80">
                              Active
                            </span>
                          )}
                        </div>
                      )}
                    </Link>

                    {!expanded && (
                      <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-emerald-500/20 bg-zinc-800/95 px-2.5 py-1.5 text-xs text-white opacity-0 invisible shadow-glow-sm backdrop-blur-sm transition-all duration-150 group-hover:visible group-hover:opacity-100">
                        {item.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {expanded && (
        <div className="px-4 pb-2">
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-shortcuts-dialog"));
            }}
            className="flex w-full items-center space-x-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-emerald-500/5 hover:text-emerald-300"
          >
            <Keyboard className="size-3.5" />
            <span>Keyboard shortcuts</span>
            <kbd className="ml-auto text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700">
              ?
            </kbd>
          </button>
        </div>
      )}

      {user && (
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <div
            className={cn(
              "flex items-center transition-all duration-300",
              expanded ? "space-x-3" : "justify-center"
            )}
          >
            <div className="relative flex-shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800">
                {user.user.profile_picture_url ? (
                  <img
                    src={user.user.profile_picture_url}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-zinc-200 font-medium text-sm">
                    {user.user.full_name?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 bg-emerald-500 animate-pulse" />
            </div>

            {expanded && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {user.user.full_name ?? ""}
                </p>
                <p className="hdx-mask text-[11px] text-zinc-500 truncate">
                  {user.user.email ?? ""}
                </p>
                {runtimeConfig.releaseVersion && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                    {`v${runtimeConfig.releaseVersion}`}
                    {runtimeConfig.activeApiSlot ? ` · slot ${runtimeConfig.activeApiSlot}` : ""}
                  </p>
                )}
              </div>
            )}

            {expanded && (
              <div className="relative group">
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>

                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-zinc-800/95 backdrop-blur-sm text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 whitespace-nowrap z-50 top-1/2 -translate-y-1/2 border border-emerald-500/20 shadow-glow-sm">
                  Logout
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
