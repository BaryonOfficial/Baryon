import { DEVTOOLS_ENABLED } from "../devtools/config.js";

export function normalizeDiagnosticsHudItems(diagnosticsHudExtraItems) {
  return Array.isArray(diagnosticsHudExtraItems) &&
    diagnosticsHudExtraItems.length
    ? diagnosticsHudExtraItems
    : null;
}

export function resolveDiagnosticsHudState({
  localState,
  enabledOverride,
  snapshotOverride,
}) {
  if (typeof enabledOverride === "boolean") {
    return {
      enabled: enabledOverride,
      snapshot: snapshotOverride ?? null,
    };
  }

  return (
    localState ?? {
      enabled: false,
      snapshot: null,
    }
  );
}

export function shouldRenderDiagnosticsHud({
  devtoolsEnabled = DEVTOOLS_ENABLED,
  enabledOverride,
  overlayState,
}) {
  if (!overlayState?.enabled || !overlayState.snapshot) {
    return false;
  }

  if (typeof enabledOverride === "boolean") {
    return true;
  }

  return devtoolsEnabled;
}
