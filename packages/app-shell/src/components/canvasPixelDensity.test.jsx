/* @vitest-environment jsdom */
import React from "react";
import { act, createRoot, extend } from "@react-three/fiber";
import { Group } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

extend({ Group });
const roots = [];
let listeners;
let displayRatio;

beforeEach(() => {
  displayRatio = 1;
  listeners = new Set();
  vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(
    () => displayRatio,
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: (_, listener) => listeners.add(listener),
      removeEventListener: (_, listener) => listeners.delete(listener),
    })),
  );
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  expect(listeners.size).toBe(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function surface(dpr) {
  const root = createRoot(document.createElement("canvas"));
  roots.push(root);
  let ratio = 1;
  const gl = {
    render: vi.fn(),
    dispose: vi.fn(),
    getPixelRatio: () => ratio,
    setPixelRatio: vi.fn((value) => {
      ratio = value;
    }),
    setSize: vi.fn(),
    shadowMap: {},
  };
  const factory = vi.fn(async () => gl);
  const settings = {
    gl: factory,
    frameloop: "never",
    dpr,
    size: { width: 1280, height: 720, top: 0, left: 0 },
  };
  await root.configure(settings);
  await act(async () => root.render(<group />));
  return { root, gl, factory, settings };
}

async function moveToDisplay(ratio) {
  await act(async () => {
    displayRatio = ratio;
    for (const listener of [...listeners]) listener();
  });
}

it("follows display density without a viewport resize or renderer reinitialization", async () => {
  const { root, gl, factory, settings } = await surface([1, Infinity]);
  for (const ratio of [2, 3, 0.5, 1.5]) {
    await moveToDisplay(ratio);
    expect(gl.getPixelRatio()).toBe(Math.max(1, ratio));
    expect(gl.setSize).toHaveBeenLastCalledWith(1280, 720, false);
  }
  const writes = gl.setPixelRatio.mock.calls.length;
  await root.configure(settings);
  expect(gl.setPixelRatio).toHaveBeenCalledTimes(writes);
  expect(factory).toHaveBeenCalledOnce();
  expect(gl.dispose).not.toHaveBeenCalled();
});

it("keeps fixed output sizing independent of display density", async () => {
  const { root, gl, factory, settings } = await surface(1.5);
  expect(listeners.size).toBe(0);
  await moveToDisplay(3);
  expect(gl.getPixelRatio()).toBe(1.5);
  await root.configure({
    ...settings,
    size: { width: 2560, height: 1440, top: 0, left: 0 },
  });
  expect(gl.setSize).toHaveBeenLastCalledWith(2560, 1440, false);
  expect(gl.getPixelRatio()).toBe(1.5);
  expect(factory).toHaveBeenCalledOnce();
});

it("honors changing preview limits while the display watcher remains active", async () => {
  const { root, gl, factory, settings } = await surface([1, 2]);
  await moveToDisplay(3);
  expect(gl.getPixelRatio()).toBe(2);
  const replacementFactory = vi.fn();
  await root.configure({ ...settings, gl: replacementFactory, dpr: [1, 1] });
  await moveToDisplay(1.5);
  expect(gl.getPixelRatio()).toBe(1);
  expect(replacementFactory).not.toHaveBeenCalled();
  await root.configure({ ...settings, dpr: [1, 2] });
  expect(gl.getPixelRatio()).toBe(1.5);
  await root.configure({ ...settings, dpr: [1, 1.5] });
  await moveToDisplay(2);
  expect(gl.getPixelRatio()).toBe(1.5);
  expect(factory).toHaveBeenCalledOnce();
});
