import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdvancedControlsHelpPosition } from "../../../../packages/app-shell/src/components/advancedControlsHelpPosition.js";

test("prefers the right side when there is room", () => {
  const position = resolveAdvancedControlsHelpPosition({
    anchorRect: { left: 24, right: 40, top: 80, height: 16 },
    tooltipRect: { width: 140, height: 60 },
    viewportWidth: 480,
    viewportHeight: 320,
  });

  assert.equal(position.horizontal, "right");
  assert.equal(position.left, 50);
  assert.equal(position.top, 58);
});

test("flips to the left when the right edge would overflow", () => {
  const position = resolveAdvancedControlsHelpPosition({
    anchorRect: { left: 208, right: 224, top: 120, height: 16 },
    tooltipRect: { width: 120, height: 72 },
    viewportWidth: 320,
    viewportHeight: 280,
  });

  assert.equal(position.horizontal, "left");
  assert.equal(position.left, 78);
});

test("clamps the tooltip into the viewport vertically", () => {
  const position = resolveAdvancedControlsHelpPosition({
    anchorRect: { left: 40, right: 56, top: 8, height: 12 },
    tooltipRect: { width: 120, height: 80 },
    viewportWidth: 320,
    viewportHeight: 180,
  });

  assert.equal(position.top, 8);
  assert.equal(position.vertical, "top");
});
