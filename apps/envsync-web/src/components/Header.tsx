import { Search, Bell, LogOut, Settings, Globe, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useAuthContext } from "@/contexts/auth";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Fragment } from "react";
import { logoutWebSession } from "@/api";
import { runtimeConfig } from "@/utils/runtime-config";

export const Header = () => {
  const { user } = useAuthContext();
  const breadcrumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const workspaceName = "EnvSync Workspace";
  const activeRole = user?.role?.name || "Member";

  const handleLogout = async () => {
    try {
      await logoutWebSession();
    } catch (error) {
      console.error("Failed to logout cleanly:", error);
    }
  };

  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <header className="border-b border-white/10 bg-gray-950/55 px-6 py-3 backdrop-blur-xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-violet-200">
              <Sparkles className="size-3" />
              {workspaceName}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-gray-400">
              {activeRole}
            </span>
          </div>

          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={crumb.href}>
                  {index > 0 && (
                    <BreadcrumbSeparator className="text-gray-600" />
                  )}
                  <BreadcrumbItem>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage className="text-sm font-medium text-gray-100">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link
                          to={crumb.href}
                          className="text-sm text-gray-400 transition-colors hover:text-gray-200"
                        >
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("open-command-palette"))
            }
            className="group flex min-w-[240px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-gray-500 transition-all hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-violet-300 md:flex-none"
          >
            <Search className="size-4" />
            <span className="text-sm">Search, jump to a page, or run an action…</span>
            <kbd className="ml-auto rounded border border-gray-700 bg-gray-800/70 px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors group-hover:text-gray-300">
              {isMac ? "⌘" : "Ctrl+"}K
            </kbd>
          </button>

          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("toggle-notification-center")
              )
            }
            className="relative rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-gray-400 transition-colors hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200"
            title="Notifications"
          >
            <Bell className="size-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors hover:border-violet-500/30 hover:bg-white/[0.06]">
                <div className="flex min-w-0 flex-col text-right">
                  <span className="truncate text-sm font-medium text-gray-100">
                    {user?.user?.full_name ?? "User"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {activeRole}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-800 transition-colors hover:border-violet-500/50">
                  {user?.user?.profile_picture_url ? (
                    <img
                      src={user.user.profile_picture_url}
                      alt="Avatar"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-200 font-medium text-xs">
                      {user?.user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-gray-900 border-gray-800"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-gray-200 truncate">
                  {user?.user?.full_name ?? "User"}
                </p>
                <p className="hdx-mask text-xs text-gray-500 truncate">
                  {user?.user?.email ?? ""}
                </p>
                {runtimeConfig.releaseVersion && (
                  <p className="text-[11px] text-gray-600">
                    {`v${runtimeConfig.releaseVersion}`}
                    {runtimeConfig.activeApiSlot ? ` · slot ${runtimeConfig.activeApiSlot}` : ""}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                className="text-gray-300 focus:bg-gray-800 focus:text-gray-200 cursor-pointer"
              >
                <Settings className="size-4 mr-2" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/organisation")}
                className="text-gray-300 focus:bg-gray-800 focus:text-gray-200 cursor-pointer"
              >
                <Globe className="size-4 mr-2" />
                Organisation
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-800" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer"
              >
                <LogOut className="size-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
