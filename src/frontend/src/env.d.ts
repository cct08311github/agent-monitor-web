/// <reference types="vite/client" />

// Type declarations for .vue single-file components
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>
  export default component
}

// Augment ImportMeta so VITE_* env vars are typed
interface ImportMetaEnv {
  /** Mirrors the server-side BASE_PATH for sub-path routing (e.g. /agent-monitor) */
  readonly VITE_BASE_PATH?: string
  /** Override API base URL for dev/test */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
