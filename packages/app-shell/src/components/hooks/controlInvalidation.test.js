import { expect, test } from "vitest";
import { createControlState } from "@baryon/visualizer/controls/schema";
import { shouldSkipChromesthesiaStaticColorInvalidation } from "./controlInvalidation.js";

function createControls(overrides = {}) {
  return {
    ...createControlState(),
    ...overrides,
  };
}

test("skips invalidation when only volume color changes in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(true);
});

test("skips invalidation when only contour color changes in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(true);
});

test("skips invalidation when both static color pickers change in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(true);
});

test("keeps invalidation when no control values changed", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls(previousControls);

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(false);
});

test("keeps invalidation when a live chromesthesia control changes", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    chromesthesiaMix: 0.9,
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(false);
});

test("keeps invalidation when contour sharpness changes in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    contourSharpness: previousControls.contourSharpness + 0.5,
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(false);
});

test("keeps invalidation when changing into chromesthesia with a color edit", () => {
  const previousControls = createControls({ colorMode: "static" });
  const nextControls = createControls({
    ...previousControls,
    colorMode: "chromesthesia",
    volumeColor: "#112233",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(false);
});

test("keeps invalidation when static mode is active", () => {
  const previousControls = createControls();
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
  ).toBe(true);
});

test("keeps invalidation when control snapshots are missing", () => {
  const nextControls = createControls({
    colorMode: "chromesthesia",
    volumeColor: "#112233",
  });

  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(null, nextControls),
  ).toBe(false);
  expect(
    shouldSkipChromesthesiaStaticColorInvalidation(nextControls, null),
  ).toBe(false);
});
