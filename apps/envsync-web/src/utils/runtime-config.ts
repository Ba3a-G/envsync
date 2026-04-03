import z from "zod";

const runtimeConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  appBaseUrl: z.string().url(),
  authBaseUrl: z.string().url(),
  keycloakRealm: z.string().min(1),
  webClientId: z.string().min(1),
  apiDocsUrl: z.string().url(),
  otelEndpoint: z.string().url().optional(),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

declare global {
  interface Window {
    __ENVSYNC_RUNTIME_CONFIG__?: unknown;
  }
}

const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const fallbackRuntimeConfig: RuntimeConfig = {
  apiBaseUrl: defaultApiBaseUrl,
  appBaseUrl: "http://app.lvh.me:8001",
  authBaseUrl: "http://auth.lvh.me:8080",
  keycloakRealm: "envsync",
  webClientId: "envsync-web",
  apiDocsUrl: `${defaultApiBaseUrl.replace(/\/$/, "")}/docs`,
  otelEndpoint: "http://localhost:14318",
};

function getRuntimeConfig(): RuntimeConfig {
  try {
    return runtimeConfigSchema.parse(
      typeof window !== "undefined" ? window.__ENVSYNC_RUNTIME_CONFIG__ : undefined
    );
  } catch (error) {
    console.warn("Runtime config validation failed, using defaults:", error);
    return fallbackRuntimeConfig;
  }
}

export const runtimeConfig = getRuntimeConfig();
