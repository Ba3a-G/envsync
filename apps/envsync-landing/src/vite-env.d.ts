/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_OTEL_ENDPOINT: string;
  readonly VITE_OTEL_SERVICE_NAME: string;
  readonly VITE_OTEL_SDK_DISABLED: string;
  readonly VITE_OTEL_TRACE_SAMPLE_RATE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_HYPERDX_API_KEY: string;
  readonly VITE_HYPERDX_URL: string;
  readonly VITE_HYPERDX_DISABLED: string;
  readonly VITE_HYPERDX_ADVANCED_NETWORK_CAPTURE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
