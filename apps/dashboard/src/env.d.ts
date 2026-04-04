/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Gateway server URL for API calls. Empty = same-origin proxy. */
  readonly VITE_GATEWAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
