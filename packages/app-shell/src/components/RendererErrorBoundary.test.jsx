// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";

function ThrowingChild({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error("renderer failed");
  }
  return React.createElement("div", null, "renderer active");
}

describe("RendererErrorBoundary", () => {
  let container;
  let root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root.unmount());
    }
    container?.remove();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  it("shows a recoverable fallback for unexpected renderer errors", async () => {
    const onError = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          RendererErrorBoundary,
          { resetKey: "stable", onError },
          React.createElement(ThrowingChild, { shouldThrow: true }),
        ),
      );
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Rendering stopped unexpectedly.",
    );

    await act(async () => {
      container.querySelector("button")?.click();
    });

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("recovers when its structural reset key changes", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          RendererErrorBoundary,
          { resetKey: "before" },
          React.createElement(ThrowingChild, { shouldThrow: true }),
        ),
      );
    });

    await act(async () => {
      root.render(
        React.createElement(
          RendererErrorBoundary,
          { resetKey: "after" },
          React.createElement(ThrowingChild, { shouldThrow: false }),
        ),
      );
    });

    expect(container.textContent).toContain("renderer active");
  });
});
