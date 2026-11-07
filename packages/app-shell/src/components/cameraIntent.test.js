import { expect, test, vi } from "vitest";
import {
  createCameraIntentStore,
  normalizeCameraIntent,
} from "./cameraPolicy.js";
import { resolvePresetCameraPose } from "./cameraPosePresets.js";

test("one intent owner preserves explicit selection across surface subscribers without echoing reads", () => {
  const store = createCameraIntentStore();
  const listener = vi.fn(),
    performer = vi.fn();
  const unsubscribe = store.subscribe(listener);
  store.subscribe(performer);
  const pose = resolvePresetCameraPose("top-down");
  store.setIntent({ mode: "explicit", pose });
  const selected = store.getSnapshot();
  expect(selected.intent).toEqual({ mode: "explicit", pose });
  unsubscribe();
  store.getSnapshot();
  store.getSnapshot();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(performer).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toBe(selected);
  store.setIntent({ mode: "automatic" });
  expect(store.getSnapshot().intent).toEqual({ mode: "automatic" });
  expect(performer).toHaveBeenCalledTimes(2);
});

test("malformed intent cannot change the owner; caller mutation cannot change its stored pose", () => {
  const store = createCameraIntentStore();
  const initial = store.getSnapshot();
  expect(
    store.setIntent({ mode: "explicit", pose: { position: { x: 1 } } }),
  ).toBe(false);
  expect(store.getSnapshot()).toBe(initial);
  const pose = resolvePresetCameraPose("side");
  store.setIntent({ mode: "explicit", pose });
  pose.position.x = 99;
  expect(store.getSnapshot().intent.pose.position.x).toBe(0);
  expect(normalizeCameraIntent({ mode: "automatic", pose })).toEqual({
    mode: "automatic",
  });
});
