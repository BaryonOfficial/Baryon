const viteEnvironment = /** @type {any} */ (import.meta).env;

export const DEVTOOLS_ENABLED = viteEnvironment.DEV;

export const RAYMARCH_AUDIT_FIXTURE_ENABLED =
  DEVTOOLS_ENABLED &&
  viteEnvironment.VITE_BARYON_RAYMARCH_AUDIT_FIXTURE === "1";
