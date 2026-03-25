import test from "node:test";
import assert from "node:assert/strict";
import { createControlState } from "../../../../packages/visualizer/src/controls/schema.js";
import { shouldSkipChromesthesiaStaticColorInvalidation } from "../../../../packages/app-shell/src/components/hooks/controlInvalidation.js";

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

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    true,
  );
});

test("skips invalidation when only contour color changes in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    surfaceColor: "#ddeeff",
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    true,
  );
});

test("skips invalidation when both static color pickers change in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    true,
  );
});

test("keeps invalidation when no control values changed", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls(previousControls);

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    false,
  );
});

test("keeps invalidation when a live chromesthesia control changes", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    chromesthesiaMix: 0.9,
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    false,
  );
});

test("keeps invalidation when contour sharpness changes in chromesthesia", () => {
  const previousControls = createControls({ colorMode: "chromesthesia" });
  const nextControls = createControls({
    ...previousControls,
    contourSharpness: previousControls.contourSharpness + 0.5,
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    false,
  );
});

test("keeps invalidation when changing into chromesthesia with a color edit", () => {
  const previousControls = createControls({ colorMode: "static" });
  const nextControls = createControls({
    ...previousControls,
    colorMode: "chromesthesia",
    volumeColor: "#112233",
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    false,
  );
});

test("keeps invalidation when static mode is active", () => {
  const previousControls = createControls();
  const nextControls = createControls({
    ...previousControls,
    volumeColor: "#112233",
    surfaceColor: "#ddeeff",
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(
      previousControls,
      nextControls,
    ),
    true,
  );
});

test("keeps invalidation when control snapshots are missing", () => {
  const nextControls = createControls({
    colorMode: "chromesthesia",
    volumeColor: "#112233",
  });

  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(null, nextControls),
    false,
  );
  assert.equal(
    shouldSkipChromesthesiaStaticColorInvalidation(nextControls, null),
    false,
  );
});
