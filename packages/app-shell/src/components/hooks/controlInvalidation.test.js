import { expect, test } from "vitest";
import { createControlState } from "@baryon/visualizer/controls/schema";
import { shouldSkipSpectralStaticColorInvalidation } from "./controlInvalidation.js";

function createControls(overrides = {}) {
  return {
    ...createControlState(),
    ...overrides,
  };
}

test("skips invalidation when only volume color changes in Spectral Light", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(true);
});

test("skips invalidation when only contour color changes in Spectral Light", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls({
    ...previousControls,
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(true);
});

test("skips invalidation when both static color pickers change in Spectral Light", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(true);
});

test("keeps invalidation when no control values changed", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls(previousControls);

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(false);
});

test("keeps invalidation when a live Spectral Light control changes", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    spectralMix: 0.9,
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(false);
});

test("keeps invalidation when contour sharpness changes in Spectral Light", () => {
  const previousControls = createControls({ colorMode: "spectral" });
  const nextControls = createControls({
    ...previousControls,
    contourSharpness: previousControls.contourSharpness + 0.5,
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(false);
});

test("keeps invalidation when changing into Spectral Light with a color edit", () => {
  const previousControls = createControls({ colorMode: "static" });
  const nextControls = createControls({
    ...previousControls,
    colorMode: "spectral",
    volumeColor: "#112233",
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(false);
});

test("keeps invalidation when static mode is active", () => {
  const previousControls = createControls({ colorMode: "static" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipSpectralStaticColorInvalidation(previousControls, nextControls),
  ).toBe(false);
});

test("keeps invalidation when control snapshots are missing", () => {
  const nextControls = createControls({
    colorMode: "spectral",
    volumeColor: "#112233",
  });

  expect(shouldSkipSpectralStaticColorInvalidation(null, nextControls)).toBe(
    false,
  );
  expect(shouldSkipSpectralStaticColorInvalidation(nextControls, null)).toBe(
    false,
  );
});
