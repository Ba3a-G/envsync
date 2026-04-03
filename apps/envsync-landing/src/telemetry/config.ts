import { runtimeConfig } from "@/utils/runtime-config";

export interface TelemetryConfig {
  endpoint: string;
  serviceName: string;
  disabled: boolean;
  sampleRate: number;
}

export function getTelemetryConfig(): TelemetryConfig {
  return {
    endpoint:
      import.meta.env.VITE_OTEL_ENDPOINT ||
      runtimeConfig.otelEndpoint ||
      "http://localhost:14318",
    serviceName: import.meta.env.VITE_OTEL_SERVICE_NAME || "envsync-landing",
    disabled: import.meta.env.VITE_OTEL_SDK_DISABLED === "true",
    sampleRate: parseFloat(import.meta.env.VITE_OTEL_TRACE_SAMPLE_RATE || "1.0"),
  };
}
