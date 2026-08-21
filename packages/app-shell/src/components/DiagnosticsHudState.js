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

export function reconcileDiagnosticsHudState(currentState, nextState) {
  if (
    currentState?.enabled === nextState?.enabled &&
    currentState?.snapshot === nextState?.snapshot
  ) {
    return currentState;
  }

  return nextState;
}

export function shouldRenderDiagnosticsHud({
  devtoolsEnabled = DEVTOOLS_ENABLED,
  enabledOverride,
  diagnosticsHudState,
}) {
  if (!diagnosticsHudState?.enabled || !diagnosticsHudState.snapshot) {
    return false;
  }

  if (typeof enabledOverride === "boolean") {
    return true;
  }

  return devtoolsEnabled;
}
