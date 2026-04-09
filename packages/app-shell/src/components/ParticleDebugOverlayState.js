import { DEVTOOLS_ENABLED } from "../devtools/config.js";

export function normalizeDebugOverlayItems(debugOverlayExtraItems) {
  return Array.isArray(debugOverlayExtraItems) && debugOverlayExtraItems.length
    ? debugOverlayExtraItems
    : null;
}

export function resolveDebugOverlayState({
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

export function shouldRenderDebugOverlay({
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
