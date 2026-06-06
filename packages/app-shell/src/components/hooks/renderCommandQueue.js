export const RENDER_COMMAND_TYPES = Object.freeze({
  controlsChanged: "controls.changed",
});

function cloneControlsSnapshot(controls) {
  return controls ? { ...controls } : {};
}

export function createRenderCommandQueue() {
  let pendingControlsCommand = null;

  return {
    enqueueControlsChanged(controls, options = {}) {
      pendingControlsCommand = {
        type: RENDER_COMMAND_TYPES.controlsChanged,
        controls: cloneControlsSnapshot(controls),
        clearPausedFrameCache: Boolean(
          pendingControlsCommand?.clearPausedFrameCache ||
            options.clearPausedFrameCache,
        ),
        source: options.source ?? pendingControlsCommand?.source ?? null,
      };
    },

    drainControlsChanged() {
      const command = pendingControlsCommand;
      pendingControlsCommand = null;
      return command;
    },

    clear() {
      pendingControlsCommand = null;
    },
  };
}
