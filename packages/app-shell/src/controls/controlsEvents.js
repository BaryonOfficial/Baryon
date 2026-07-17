const BARYON_CONTROLS_CHANGE_EVENT = "__baryon-controls-change";
const BARYON_CONTROLS_COMMAND_EVENT = "__baryon-controls-command";

function resolveEventTarget(target) {
  if (
    !target ||
    typeof target.addEventListener !== "function" ||
    typeof target.removeEventListener !== "function" ||
    typeof target.dispatchEvent !== "function"
  ) {
    return null;
  }
  return target;
}

function createCustomEvent(target, type, detail) {
  const CustomEventImpl = target?.CustomEvent ?? globalThis.CustomEvent;
  return typeof CustomEventImpl === "function"
    ? new CustomEventImpl(type, { detail })
    : null;
}

export function dispatchControlsChanged(
  controlsState,
  target = globalThis.window,
) {
  const eventTarget = resolveEventTarget(target);
  const event = createCustomEvent(
    target,
    BARYON_CONTROLS_CHANGE_EVENT,
    controlsState && typeof controlsState === "object"
      ? { ...controlsState }
      : {},
  );
  return eventTarget && event ? eventTarget.dispatchEvent(event) : false;
}

export function subscribeControlsChanged(listener, target = globalThis.window) {
  const eventTarget = resolveEventTarget(target);
  if (!eventTarget || typeof listener !== "function") {
    return () => {};
  }
  eventTarget.addEventListener(BARYON_CONTROLS_CHANGE_EVENT, listener);
  return () => {
    eventTarget.removeEventListener(BARYON_CONTROLS_CHANGE_EVENT, listener);
  };
}

export function dispatchControlsCommand(command, target = globalThis.window) {
  const eventTarget = resolveEventTarget(target);
  if (!eventTarget || !command || typeof command.key !== "string") {
    return false;
  }
  const event = createCustomEvent(target, BARYON_CONTROLS_COMMAND_EVENT, {
    ...command,
  });
  return event ? eventTarget.dispatchEvent(event) : false;
}

export function subscribeControlsCommand(listener, target = globalThis.window) {
  const eventTarget = resolveEventTarget(target);
  if (!eventTarget || typeof listener !== "function") {
    return () => {};
  }
  eventTarget.addEventListener(BARYON_CONTROLS_COMMAND_EVENT, listener);
  return () => {
    eventTarget.removeEventListener(BARYON_CONTROLS_COMMAND_EVENT, listener);
  };
}
