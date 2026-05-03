import z from "zod";

const runtimeConfigSchema = z.object({
  managementApiUrl: z.string().url(),
  dashboardUrl: z.string().url(),
  edition: z.enum(["oss", "enterprise"]).default("enterprise"),
  licenseStatus: z.enum(["unknown", "active", "inactive", "expired", "error", "locked"]).default("unknown"),
  licenseLocked: z.boolean().default(false),
});

declare global {
  interface Window {
    __ENVSYNC_MANAGEMENT_RUNTIME_CONFIG__?: unknown;
  }
}

const fallback = {
  managementApiUrl: import.meta.env.VITE_MANAGEMENT_API_URL || "http://localhost:4001",
  dashboardUrl: import.meta.env.VITE_DASHBOARD_URL || "http://localhost:8001",
  edition: "enterprise" as const,
  licenseStatus: "unknown" as const,
  licenseLocked: false,
};

export const runtimeConfig = runtimeConfigSchema.parse(
  typeof window !== "undefined" ? window.__ENVSYNC_MANAGEMENT_RUNTIME_CONFIG__ ?? fallback : fallback
);
