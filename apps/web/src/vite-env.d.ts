/// <reference types="vite/client" />
/// <reference path="../../../packages/app-shell/src/baryon-env.d.ts" />

interface ImportMetaEnv {
  readonly VITE_SOUNDCLOUD_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
