/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_REALTIME_MODE?: string;
  readonly VITE_REALTIME_POLL_MS?: string;
  readonly VITE_MOCK_LATENCY_MS?: string;
  readonly VITE_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
