import test from "node:test";
import assert from "node:assert/strict";
import { createControlState } from "@baryon/visualizer/controls/schema";
import { VISUALIZATION_METHODS } from "@baryon/visualizer/visualization/types";
import {
  CONTROLS_PERSIST_DELAY_MS,
  PRESETS_KEY,
  SETTINGS_KEY,
  createControlsPersistScheduler,
  createInitialControlState,
  deletePresetFromCollection,
  getVisibleControlGroups,
  loadStoredPresets,
  savePresetCollection,
} from "../../src/components/hooks/baryonControlsState.js";

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

test("restores stored control settings on startup", () => {
  const storage = createMemoryStorage({
    [SETTINGS_KEY]: JSON.stringify({
      bloomStrength: 1.42,
      colorMode: "chromesthesia",
    }),
  });

  const controls = createInitialControlState(storage);

  assert.equal(controls.bloomStrength, 1.42);
  assert.equal(controls.colorMode, "chromesthesia");
  assert.equal(
    controls.rotationMode,
    createControlState().rotationMode,
    "untouched controls fall back to schema defaults",
  );
});

test("hides debug-only control groups unless devtools are enabled", () => {
  const prodGroups = getVisibleControlGroups({ devtoolsEnabled: false });
  const devGroups = getVisibleControlGroups({ devtoolsEnabled: true });

  assert.equal(
    prodGroups.some((group) => group.title === "Diagnostics"),
    false,
  );
  assert.equal(
    devGroups.some((group) => group.title === "Diagnostics"),
    true,
  );
});

test("switches visible groups with the fullscreen 2d method", () => {
  const groups = getVisibleControlGroups({
    devtoolsEnabled: false,
    method: VISUALIZATION_METHODS.cymatics2d,
  });

  assert.equal(
    groups.some((group) =>
      group.controls.some((control) => control.key === "rotationMode"),
    ),
    false,
  );
  assert.equal(
    groups.some((group) =>
      group.controls.some((control) => control.key === "visualizationMethod"),
    ),
    true,
  );
});

test("loads presets safely and supports save/delete with stable storage shape", () => {
  const baseControls = createControlState();
  baseControls.bloomStrength = 1.1;
  baseControls.forceWebGLFallbackTest = true;

  const savedPresets = savePresetCollection([], "Studio", baseControls, 1234);
  assert.equal(savedPresets.length, 1);
  assert.equal(savedPresets[0].name, "Studio");
  assert.equal(savedPresets[0].createdAt, 1234);
  assert.equal(savedPresets[0].controls.bloomStrength, 1.1);

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      savedPresets[0].controls,
      "forceWebGLFallbackTest",
    ),
    false,
    "debug-only controls are not persisted into presets",
  );

  const storage = createMemoryStorage({
    [PRESETS_KEY]: JSON.stringify(savedPresets),
  });

  assert.equal(loadStoredPresets(storage).length, 1);
  assert.equal(deletePresetFromCollection(savedPresets, "Studio").length, 0);
});

test("debounces control persistence until the latest scheduled write", () => {
  const timers = new Map();
  let nextTimerId = 0;
  const persistCalls = [];
  const scheduler = createControlsPersistScheduler({
    persist(value) {
      persistCalls.push(value);
    },
    delay: CONTROLS_PERSIST_DELAY_MS,
    setTimeoutFn(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
  });

  scheduler.schedule({ bloomStrength: 1 });
  scheduler.schedule({ bloomStrength: 2 });

  assert.equal(timers.size, 1);
  assert.equal(timers.get(2)?.delay, CONTROLS_PERSIST_DELAY_MS);
  assert.deepEqual(persistCalls, []);

  timers.get(2).callback();

  assert.deepEqual(persistCalls, [{ bloomStrength: 2 }]);
});
