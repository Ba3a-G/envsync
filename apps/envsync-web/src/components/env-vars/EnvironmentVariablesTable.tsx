import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  Eye,
  EyeOff,
  Copy,
  Edit,
  Trash2,
  MoreHorizontal,
  Key,
  Shield,
  Calendar,
  User,
  X,
  Rows3,
  Rows2,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { EnvironmentVariable, EnvironmentType } from "@/constants";
import { useCopy } from "@/hooks/useClipboard";
import { cn, getDefaultEnvironmentType } from "@/lib/utils";
import { Count } from "../ui/count";

interface EnvironmentVariablesTableProps {
  variables: EnvironmentVariable[];
  environmentTypes: EnvironmentType[];
  selectedEnvironment: string;
  setSelectedEnvironment: (envTypeId: string) => void;
  canEdit: boolean;
  onEdit: (variable: EnvironmentVariable) => void;
  onDelete: (variable: EnvironmentVariable) => void;
  isSecrets?: boolean; // Optional prop to indicate if these are secrets
  onPrimaryAction?: () => void;
  primaryActionLabel?: string;
}

export const EnvironmentVariablesTable = ({
  variables,
  environmentTypes,
  selectedEnvironment,
  setSelectedEnvironment,
  canEdit,
  onEdit,
  onDelete,
  isSecrets,
  onPrimaryAction,
  primaryActionLabel,
}: EnvironmentVariablesTableProps) => {
  const [lastCopiedValue, setLastCopiedValue] = useState<string | null>(null);
  const copy = useCopy({
    onSuccess: (value) => {
      setLastCopiedValue(value);
      window.setTimeout(() => setLastCopiedValue(null), 1500);
    },
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Create environment types map
  const environmentTypesMap = useMemo(() => {
    return new Map(environmentTypes.map((env) => [env.id, env]));
  }, [environmentTypes]);

  // Filter variables
  const filteredVariables = useMemo(() => {
    let filtered = variables;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (variable) =>
          variable.key.toLowerCase().includes(query) ||
          (!variable.sensitive && variable.value.toLowerCase().includes(query))
      );
    }

    // Apply environment filter
    if (selectedEnvironment !== "all") {
      filtered = filtered.filter(
        (variable) => variable.env_type_id === selectedEnvironment
      );
    }

    return filtered.sort((a, b) => a.key.localeCompare(b.key));
  }, [variables, searchQuery, selectedEnvironment]);

  const toggleSensitiveVisibility = (variableId: string) => {
    setShowSensitive((prev) => ({
      ...prev,
      [variableId]: !prev[variableId],
    }));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getEnvironmentBadge = (envTypeId: string) => {
    const envType = environmentTypesMap.get(envTypeId);
    if (!envType) return null;

    return (
      <Badge
        variant="secondary"
        className="text-xs"
        style={{
          backgroundColor: `${envType.color}20`,
          color: envType.color,
          borderColor: `${envType.color}40`,
        }}
      >
        {envType.name}
      </Badge>
    );
  };

  const hasActiveFilters =
    searchQuery !== "" ||
    selectedEnvironment !== getDefaultEnvironmentType(environmentTypes);
  const visibleSelectedCount = filteredVariables.filter((variable) => selectedRows[variable.id]).length;
  const allVisibleSelected = filteredVariables.length > 0 && visibleSelectedCount === filteredVariables.length;

  const toggleAllVisible = (checked: boolean) => {
    setSelectedRows((prev) => {
      const next = { ...prev };
      filteredVariables.forEach((variable) => {
        next[variable.id] = checked;
      });
      return next;
    });
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedRows((prev) => ({ ...prev, [id]: checked }));
  };

  return (
    <Card className="bg-card text-card-foreground bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800/80 shadow-xl rounded-xl">
      <CardHeader className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="text-white flex items-center">
            {isSecrets ? (
              <Shield className="size-8 mr-2 bg-red-500 border border-red-700 p-2 stroke-[3] text-white rounded-md" />
            ) : (
              <Key className="size-8 mr-2 bg-emerald-500 border border-emerald-700 p-2 stroke-[3] text-white rounded-md" />
            )}
            {isSecrets ? "Secrets" : "Variables"}
            <Count
              count={filteredVariables.length}
              variant="subtle"
              size="xl"
              className="ml-2"
            />
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                density === "comfortable" && "border-emerald-500/30 text-emerald-200"
              )}
              onClick={() => setDensity("comfortable")}
            >
              <Rows3 className="mr-2 size-4" />
              Comfortable
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                density === "compact" && "border-emerald-500/30 text-emerald-200"
              )}
              onClick={() => setDensity("compact")}
            >
              <Rows2 className="mr-2 size-4" />
              Compact
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {environmentTypes.map((envType) => {
            const isActive = selectedEnvironment === envType.id;
            return (
              <Button
                key={envType.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEnvironment(envType.id)}
                className={cn(
                  "rounded-full border px-3 text-sm transition-colors",
                  isActive
                    ? "border-white/20 bg-white/[0.08] text-white"
                    : "border-white/10 bg-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                )}
              >
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: envType.color }}
                />
                {envType.name}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
            <Input
              placeholder={isSecrets ? "Search secrets…" : "Search variables…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
              <SelectTrigger className="w-48 bg-zinc-900 border-zinc-800 text-white">
                <Filter className="size-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {environmentTypes.map((envType) => (
                  <SelectItem
                    key={envType.id}
                    value={envType.id}
                    className="text-white"
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: envType.color }}
                      />
                      <span>{envType.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {visibleSelectedCount > 0 && (
              <Badge variant="secondary" className="bg-emerald-500/10 px-3 py-2 text-emerald-200">
                {visibleSelectedCount} selected
              </Badge>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center space-x-2 pt-2">
            <span className="text-sm text-zinc-400">Active filters:</span>
            {searchQuery && (
              <Badge
                variant="secondary"
                className="bg-zinc-800 text-zinc-300"
              >
                Search: "{searchQuery}"
              </Badge>
            )}
            {selectedEnvironment !==
              getDefaultEnvironmentType(environmentTypes) && (
              <Badge
                variant="secondary"
                className="bg-zinc-800 text-zinc-300"
              >
                Environment:{" "}
                {environmentTypesMap.get(selectedEnvironment)?.name}
              </Badge>
            )}
            <Button
              onClick={() => {
                setSearchQuery("");
                setSelectedEnvironment(
                  getDefaultEnvironmentType(environmentTypes)
                );
              }}
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white h-6 px-2"
            >
              Clear
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {filteredVariables.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
              <Key className="w-7 h-7 text-zinc-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {hasActiveFilters
                ? "No variables found"
                : "No variables"}
            </h3>
            <p className="text-zinc-400 mb-4">
              {hasActiveFilters
                ? "No variables match your current filters"
                : "Add your first variable to get started"}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {hasActiveFilters && (
                <Button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedEnvironment(
                      getDefaultEnvironmentType(environmentTypes)
                    );
                  }}
                  variant="outline"
                  className="text-white border-zinc-700 hover:bg-zinc-800"
                >
                  Clear Filters
                </Button>
              )}
              {onPrimaryAction && primaryActionLabel && (
                <Button
                  onClick={onPrimaryAction}
                  className={cn(
                    "text-white",
                    isSecrets ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
                  )}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {primaryActionLabel}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-3 px-4 text-left">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                      aria-label="Select all visible rows"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">
                    Key
                  </th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">
                    Value
                  </th>
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">
                    Environment
                  </th>
                  {/* <th className="text-left py-3 px-4 text-zinc-400 font-medium">
                    Type
                  </th> */}
                  <th className="text-left py-3 px-4 text-zinc-400 font-medium">
                    Updated
                  </th>
                  {canEdit && (
                    <th className="text-right py-3 px-4 text-zinc-400 font-medium">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredVariables.map((variable) => (
                  <tr
                    key={variable.id}
                    className={cn(
                      "border-b border-zinc-800 transition-colors hover:bg-zinc-800/80",
                      selectedRows[variable.id] && "bg-emerald-500/5",
                      density === "compact" ? "text-sm" : ""
                    )}
                  >
                    <td className="px-4 py-4 align-top">
                      <Checkbox
                        checked={Boolean(selectedRows[variable.id])}
                        onCheckedChange={(checked) => toggleRow(variable.id, Boolean(checked))}
                        aria-label={`Select ${variable.key}`}
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-start space-x-2">
                        <div>
                          <code className="text-sm font-mono text-emerald-400 bg-zinc-900 px-2 py-1 rounded">
                            {variable.key}
                          </code>
                          <p className="mt-2 text-xs text-zinc-500">
                            {isSecrets ? "Encrypted secret entry" : "Runtime variable"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                          onClick={() => copy.mutate(variable.key)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        {lastCopiedValue === variable.key && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Copied
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2 max-w-xs">
                        {variable.sensitive ? (
                          <div className="flex items-center space-x-2">
                            <code className="hdx-mask select-none text-sm font-mono text-zinc-300 bg-zinc-900 px-2 py-1 rounded flex-1 truncate">
                              {showSensitive[variable.id]
                                ? variable.value
                                : "••••••••"}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                              onClick={() =>
                                toggleSensitiveVisibility(variable.id)
                              }
                            >
                              {showSensitive[variable.id] ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                            {showSensitive[variable.id] && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                                onClick={() => copy.mutate(variable.value)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <code className="hdx-mask select-all text-sm font-mono text-zinc-300 bg-zinc-900 px-2 py-1 rounded flex-1 truncate">
                              {variable.value}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                              onClick={() => copy.mutate(variable.value)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      {getEnvironmentBadge(variable.env_type_id)}
                    </td>

                    {/* <td className="py-4 px-4">
                      <Badge
                        variant="secondary"
                        className={`${
                          variable.sensitive
                            ? "bg-red-900/20 text-red-400 border-red-800"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        } border flex items-center space-x-1 w-fit`}
                      >
                        {variable.sensitive ? (
                          <Shield className="w-3 h-3" />
                        ) : (
                          <Key className="w-3 h-3" />
                        )}
                        <span>
                          {variable.sensitive ? "Secret" : "Variable"}
                        </span>
                      </Badge>
                    </td> */}

                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-1 text-sm text-zinc-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(variable.updated_at)}</span>
                      </div>
                      {variable.created_by && (
                        <div className="flex items-center space-x-1 text-xs text-zinc-500 mt-1">
                          <User className="w-3 h-3" />
                          <span>{variable.created_by.name}</span>
                        </div>
                      )}
                    </td>
                    {canEdit && (
                      <td className="p-4 flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-zinc-400 hover:text-white hover:bg-zinc-800 h-8 w-8"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="bg-zinc-900 border-zinc-800"
                            align="end"
                          >
                            <DropdownMenuItem
                              className="text-white hover:bg-zinc-800 cursor-pointer"
                              onClick={() => onEdit(variable)}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              {isSecrets ? "Edit Secret" : "Edit Variable"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-400 hover:bg-zinc-800 cursor-pointer"
                              onClick={() => onDelete(variable)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {isSecrets ? "Delete Secret" : "Delete Variable"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
