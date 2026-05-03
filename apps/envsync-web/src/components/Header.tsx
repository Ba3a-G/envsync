import { Search, Bell, LogOut, Settings, Globe, Sparkles, ChevronsUpDown, Check, Loader2, Plus } from "lucide-react";
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
import { Fragment, useMemo, useState } from "react";
import { logoutWebSession } from "@/api";
import { runtimeConfig } from "@/utils/runtime-config";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { CreateWorkspaceDialog } from "@/components/auth/CreateWorkspaceDialog";

export const Header = () => {
  const { user, memberships, activeMembershipUserId, switchOrg, isSwitchingOrg, isCreatingWorkspace } = useAuthContext();
  const breadcrumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const activeMembership = useMemo(
    () =>
      memberships.find((membership) => membership.user_id === activeMembershipUserId)
      ?? memberships.find((membership) => membership.is_active)
      ?? null,
    [activeMembershipUserId, memberships],
  );
  const activeOrgName = activeMembership?.org_name || user?.org?.name || "EnvSync Workspace";
  const activeOrgSlug = activeMembership?.org_slug || user?.org?.slug || "";
  const activeRole = activeMembership?.role_name || user?.role?.name || "Member";
  const canSwitchOrganizations = runtimeConfig.edition === "enterprise";

  const handleLogout = async () => {
    try {
      await logoutWebSession();
    } catch (error) {
      console.error("Failed to logout cleanly:", error);
    }
  };

  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <>
      <header className="border-b border-white/10 bg-zinc-950/70 px-6 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {canSwitchOrganizations ? (
              <Popover open={orgSwitcherOpen} onOpenChange={setOrgSwitcherOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-testid="workspace-switcher-trigger"
                    className="inline-flex items-center gap-3 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-left text-emerald-50 transition-colors hover:border-emerald-400/30 hover:bg-emerald-500/14"
                  >
                    <span className="inline-flex size-6 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/15">
                      <Sparkles className="size-3 text-emerald-200" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                        {activeOrgName}
                      </span>
                      <span className="block truncate text-[11px] text-emerald-100/70">
                        {activeRole}
                      </span>
                    </span>
                    {isSwitchingOrg || isCreatingWorkspace ? (
                      <Loader2 className="size-4 animate-spin text-emerald-100/70" />
                    ) : (
                      <ChevronsUpDown className="size-4 text-emerald-100/70" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[340px] border-zinc-800 bg-zinc-950 p-0">
                  <Command className="bg-transparent text-zinc-100">
                    <div className="border-b border-zinc-900 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">Active workspace</p>
                      <p className="mt-1 truncate text-sm font-medium text-zinc-100">{activeOrgName}</p>
                      <p className="truncate text-xs text-zinc-500">{activeRole}</p>
                    </div>
                    <CommandInput placeholder="Search workspaces..." className="text-zinc-100 placeholder:text-zinc-500" />
                    <CommandList className="max-h-[320px]">
                      <CommandEmpty className="text-zinc-500">No workspaces found.</CommandEmpty>
                      <CommandGroup heading="Your workspaces">
                        {memberships.map((membership) => {
                          const isActive = membership.user_id === activeMembershipUserId || membership.is_active;
                          return (
                            <CommandItem
                              key={membership.user_id}
                              data-testid={`workspace-switcher-item-${membership.org_slug}`}
                              value={`${membership.org_name} ${membership.org_slug} ${membership.role_name}`}
                              onSelect={() => {
                                setOrgSwitcherOpen(false);
                                void switchOrg(membership.org_id);
                              }}
                              disabled={isSwitchingOrg || isCreatingWorkspace}
                              className="flex items-center gap-3 rounded-xl px-3 py-3 data-[selected=true]:bg-zinc-900"
                            >
                              <span className="inline-flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                                <Globe className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-zinc-100">
                                  {membership.org_name}
                                </span>
                                <span className="block truncate text-xs text-zinc-500">
                                  {membership.org_slug} · {membership.role_name}
                                </span>
                              </span>
                              {isActive && <Check className="size-4 text-emerald-300" />}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                      <CommandSeparator className="bg-zinc-900" />
                      <CommandGroup heading="Workspace">
                        <CommandItem
                          data-testid="create-workspace-action"
                          value="create new workspace"
                          onSelect={() => {
                            setOrgSwitcherOpen(false);
                            setCreateWorkspaceOpen(true);
                          }}
                          disabled={isSwitchingOrg || isCreatingWorkspace}
                          className="flex items-center gap-3 rounded-xl px-3 py-3 text-emerald-200 data-[selected=true]:bg-zinc-900"
                        >
                          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                            <Plus className="size-4" />
                          </span>
                          <span className="text-sm font-medium">+ Create new Workspace</span>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                <Sparkles className="size-3" />
                {activeOrgName}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              {activeRole}
            </span>
            {activeOrgSlug && (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-500">
                {activeOrgSlug}
              </span>
            )}
          </div>

          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={crumb.href}>
                  {index > 0 && (
                    <BreadcrumbSeparator className="text-zinc-600" />
                  )}
                  <BreadcrumbItem>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage className="text-sm font-medium text-zinc-100">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link
                          to={crumb.href}
                          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
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
            className="group flex min-w-[240px] flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-zinc-500 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-300 md:flex-none"
          >
            <Search className="size-4" />
            <span className="text-sm">Search, jump to a page, or run an action…</span>
            <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors group-hover:text-zinc-300">
              {isMac ? "⌘" : "Ctrl+"}K
            </kbd>
          </button>

          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("toggle-notification-center")
              )
            }
            className="relative rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-zinc-400 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200"
            title="Notifications"
          >
            <Bell className="size-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 transition-colors hover:border-emerald-500/30 hover:bg-white/[0.06]">
                <div className="flex min-w-0 flex-col text-right">
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {user?.user?.full_name ?? "User"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {activeRole}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 transition-colors hover:border-emerald-500/50">
                  {user?.user?.profile_picture_url ? (
                    <img
                      src={user.user.profile_picture_url}
                      alt="Avatar"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-zinc-200 font-medium text-xs">
                      {user?.user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-zinc-900 border-zinc-800"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {user?.user?.full_name ?? "User"}
                </p>
                <p className="hdx-mask text-xs text-zinc-500 truncate">
                  {user?.user?.email ?? ""}
                </p>
                {runtimeConfig.releaseVersion && (
                  <p className="text-[11px] text-zinc-600">
                    {`v${runtimeConfig.releaseVersion}`}
                    {runtimeConfig.activeApiSlot ? ` · slot ${runtimeConfig.activeApiSlot}` : ""}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-200 cursor-pointer"
              >
                <Settings className="size-4 mr-2" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate("/organisation")}
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-200 cursor-pointer"
              >
                <Globe className="size-4 mr-2" />
                Organisation
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
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
      <CreateWorkspaceDialog
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
      />
    </>
  );
};
