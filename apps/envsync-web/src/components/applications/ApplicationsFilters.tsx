import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Filter, SortAsc, SortDesc } from "lucide-react";
import {
  FilterOptions,
  STATUS_OPTIONS,
  SORT_OPTIONS,
  Statistics,
} from "@/constants";

interface ApplicationsFiltersProps {
  searchQuery: string;
  debouncedSearchQuery: string;
  filterOptions: FilterOptions;
  statistics: Statistics;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  onFilterChange: (key: keyof FilterOptions, value: string) => void;
  onSortOrderToggle: () => void;
  onResetFilters: () => void;
}

export const ApplicationsFilters = ({
  searchQuery,
  debouncedSearchQuery,
  filterOptions,
  statistics,
  onSearchChange,
  onClearSearch,
  onFilterChange,
  onSortOrderToggle,
  onResetFilters,
}: ApplicationsFiltersProps) => {
  const hasActiveFilters =
    searchQuery ||
    filterOptions.status !== "all" ||
    filterOptions.sortBy !== "updated_at" ||
    filterOptions.sortOrder !== "desc";

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:ring-emerald-500/20"
            />
            {searchQuery && (
              <button
                onClick={onClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div className="w-full lg:w-44">
          <Select
            value={filterOptions.status}
            onValueChange={(value) => onFilterChange("status", value)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-300 h-9">
              <Filter className="w-3.5 h-3.5 mr-2 text-zinc-500" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Options */}
        <div className="w-full lg:w-44">
          <Select
            value={filterOptions.sortBy}
            onValueChange={(value) => onFilterChange("sortBy", value)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-300 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {SORT_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sort Order Toggle */}
        <Button
          onClick={onSortOrderToggle}
          variant="outline"
          size="sm"
          className="text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200 h-9 w-9 p-0"
        >
          {filterOptions.sortOrder === "asc" ? (
            <SortAsc className="w-4 h-4" />
          ) : (
            <SortDesc className="w-4 h-4" />
          )}
        </Button>

        {/* Reset Filters */}
        {hasActiveFilters && (
          <Button
            onClick={onResetFilters}
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-zinc-300 h-9"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Results Summary */}
      {(debouncedSearchQuery || filterOptions.status !== "all") && (
        <p className="text-xs text-zinc-500">
          Showing {statistics.filtered} of {statistics.total} projects
          {debouncedSearchQuery && (
            <span> matching "{debouncedSearchQuery}"</span>
          )}
          {filterOptions.status !== "all" && (
            <span> with status "{filterOptions.status}"</span>
          )}
        </p>
      )}
    </div>
  );
};
