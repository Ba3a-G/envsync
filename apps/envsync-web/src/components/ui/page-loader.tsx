import { cn } from "@/lib/utils";

interface PageLoaderProps {
  color?: string;
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

export const PageLoader = ({
  color = "border-t-emerald-500",
  message = "Loading...",
  fullScreen = false,
  className,
}: PageLoaderProps) => {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen ? "h-screen bg-zinc-950" : "min-h-[60vh]",
        className
      )}
    >
      <div className="flex flex-col items-center space-y-4">
        <div
          className={cn(
            "size-12 border-4 border-zinc-700 rounded-full animate-spin",
            color
          )}
        />
        <p className="text-zinc-400">{message}</p>
      </div>
    </div>
  );
};
