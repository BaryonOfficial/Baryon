// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary.jsx";

function ThrowingApp({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error("app failed");
  }
  return <div>app active</div>;
}

describe("AppErrorBoundary", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it("contains root render failures and offers an explicit reload", async () => {
    const onError = vi.fn();
    const onReload = vi.fn();

    await act(async () => {
      root.render(
        <AppErrorBoundary
          surfaceName="Baryon Desktop"
          onError={onError}
          onReload={onReload}
        >
          <ThrowingApp shouldThrow />
        </AppErrorBoundary>,
      );
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.any(Object));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Baryon Desktop stopped unexpectedly.",
    );
    const reloadButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reload Baryon",
    );
    await act(async () => reloadButton?.click());
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("recovers when a root reset key changes", async () => {
    await act(async () => {
      root.render(
        <AppErrorBoundary resetKey="before">
          <ThrowingApp shouldThrow />
        </AppErrorBoundary>,
      );
    });
    await act(async () => {
      root.render(
        <AppErrorBoundary resetKey="after">
          <ThrowingApp shouldThrow={false} />
        </AppErrorBoundary>,
      );
    });

    expect(container.textContent).toContain("app active");
  });
});
