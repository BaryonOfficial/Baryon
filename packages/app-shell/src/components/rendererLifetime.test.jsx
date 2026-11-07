/* @vitest-environment jsdom */
import React, { StrictMode } from "react";
import { act, createRoot, extend } from "@react-three/fiber";
import { Group } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

extend({ Group });
const roots = [];
function renderer() {
  return {
    render: vi.fn(),
    dispose: vi.fn(async () => {}),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    shadowMap: {},
  };
}
function root() {
  const value = createRoot(document.createElement("canvas"));
  roots.push(value);
  return value;
}
const settings = {
  frameloop: "never",
  dpr: 1,
  size: { width: 64, height: 64, top: 0, left: 0 },
};
afterEach(async () => {
  await act(async () => {
    for (const value of roots.splice(0)) value.unmount();
  });
});

describe("R3F owns asynchronous renderer lifetimes without a Baryon wrapper", () => {
  it("initializes once across overlapping configurations and never renders during preparation", async () => {
    const value = root(),
      gl = renderer();
    let finish;
    const factory = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = value.configure({ ...settings, gl: factory });
    const second = value.configure({ ...settings, gl: factory });
    expect(factory).toHaveBeenCalledOnce();
    finish(gl);
    await Promise.all([first, second]);
    await act(async () =>
      value.render(
        <StrictMode>
          <group />
        </StrictMode>,
      ),
    );
    expect(factory).toHaveBeenCalledOnce();
    expect(gl.render).not.toHaveBeenCalled();
    await act(async () => value.unmount());
    expect(gl.dispose).toHaveBeenCalledOnce();
  });

  it("releases a late initialization without affecting the replacement root", async () => {
    const old = root(),
      next = root(),
      oldGl = renderer(),
      nextGl = renderer();
    let finish;
    const pending = old.configure({
      ...settings,
      gl: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    await act(async () => old.unmount());
    await next.configure({ ...settings, gl: async () => nextGl });
    await act(async () => {
      finish(oldGl);
      await pending;
    });
    expect(oldGl.dispose).toHaveBeenCalledOnce();
    expect(nextGl.dispose).not.toHaveBeenCalled();
    expect(oldGl.render).not.toHaveBeenCalled();
  });

  it("does not destroy a root reacquired before unmount completes", async () => {
    const value = root(),
      gl = renderer();
    const factory = vi.fn(async () => gl);
    await value.configure({ ...settings, gl: factory });
    await act(async () => value.render(<group />));
    await act(async () => {
      value.unmount();
      value.render(<group />);
    });
    expect(gl.dispose).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledOnce();
    await act(async () => value.unmount());
    expect(gl.dispose).toHaveBeenCalledOnce();
  });
});
