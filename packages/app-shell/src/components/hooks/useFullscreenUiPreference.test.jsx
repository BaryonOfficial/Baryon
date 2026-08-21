/* @vitest-environment jsdom */

import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installLocalStorageMock } from "../../test/installLocalStorageMock.js";
import {
  FULLSCREEN_UI_STORAGE_KEY,
  useFullscreenUiPreference,
} from "./useFullscreenUiPreference.js";

function PreferenceProbe({ onValue }) {
  const preference = useFullscreenUiPreference();

  useEffect(() => {
    onValue(preference);
  }, [onValue, preference]);

  return null;
}

let container = null;
let root = null;
let originalActEnvironment;

beforeEach(() => {
  originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  installLocalStorageMock();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  if (originalActEnvironment === undefined) {
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  } else {
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
});

test("fullscreen UI defaults hidden and persists only direct opt-in changes", () => {
  const onValue = vi.fn();

  act(() => {
    root.render(<PreferenceProbe onValue={onValue} />);
  });

  expect(onValue.mock.lastCall[0].showUiInFullscreen).toBe(false);
  expect(window.localStorage.getItem(FULLSCREEN_UI_STORAGE_KEY)).toBeNull();

  act(() => {
    onValue.mock.lastCall[0].setShowUiInFullscreen(true);
  });

  expect(onValue.mock.lastCall[0].showUiInFullscreen).toBe(true);
  expect(window.localStorage.getItem(FULLSCREEN_UI_STORAGE_KEY)).toBe("1");
});
