import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  BROWSER_FAILURE_CODES,
  createFailureProbe,
} from "./browserSupport.js";
import UnsupportedWarning from "./UnsupportedWarning.jsx";

const WINDOWS_CHROMIUM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36";

const LINUX_CHROMIUM_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36";

function renderUnsupportedWarning(probe) {
  return renderToStaticMarkup(
    React.createElement(UnsupportedWarning, { probe }),
  );
}

test("renders desktop Chromium graphics acceleration recovery inline", () => {
  const probe = createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.adapterNull,
    navigatorObject: {
      userAgent: WINDOWS_CHROMIUM_USER_AGENT,
    },
    diagnostics: ["`navigator.gpu.requestAdapter()` returned `null`."],
  });

  const markup = renderUnsupportedWarning(probe);

  expect(markup).toContain("Graphics acceleration required");
  expect(markup).toContain("browser graphics acceleration");
  expect(markup).toContain("graphics acceleration");
  expect(markup).toContain("Open your browser");
  expect(markup).toContain("Settings");
  expect(markup).toContain("Turn it on, relaunch the browser");
  expect(markup).toContain("Diagnostic code:");
  expect(markup).toContain(BROWSER_FAILURE_CODES.adapterNull);
  expect(markup).toContain("Try again");
  expect(markup).toContain("Copy diagnostics");
  expect(markup).not.toContain("Use a Chromium-based desktop browser");
  expect(markup).not.toContain("chrome://settings/system");
  expect(markup).not.toContain("var(--nd-shell-shadow)");
});

test("renders Linux Chromium WebGPU flag recovery steps inline", () => {
  const probe = createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.requestAdapterMissing,
    navigatorObject: {
      userAgent: LINUX_CHROMIUM_USER_AGENT,
    },
    diagnostics: [
      "`navigator.gpu.requestAdapter` is not available in this browser.",
    ],
  });

  const markup = renderUnsupportedWarning(probe);

  expect(markup).toContain("Linux WebGPU setup required");
  expect(markup).toContain("graphics acceleration");
  expect(markup).toContain("Unsafe WebGPU Support");
  expect(markup).toContain("Vulkan");
  expect(markup).toContain("Try again");
  expect(markup).not.toContain("Open Baryon on desktop");
});
