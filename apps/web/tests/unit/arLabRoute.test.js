import test from "node:test";
import assert from "node:assert/strict";
import {
  AR_LAB_MODES,
  isArLabPath,
  resolveArLabMode,
} from "../../src/ar-lab/arLabRoute.js";

test("matches /ar-lab with and without a trailing slash", () => {
  assert.equal(isArLabPath("/ar-lab"), true);
  assert.equal(isArLabPath("/ar-lab/"), true);
  assert.equal(isArLabPath("/ar-lab//"), true);
});

test("does not match the main app or nested paths", () => {
  assert.equal(isArLabPath("/"), false);
  assert.equal(isArLabPath("/ar-lab/extra"), false);
  assert.equal(isArLabPath("/ar-laboratory"), false);
  assert.equal(isArLabPath(null), false);
  assert.equal(isArLabPath(undefined), false);
});

test("defaults to the full experience mode", () => {
  assert.equal(resolveArLabMode(""), AR_LAB_MODES.full);
  assert.equal(resolveArLabMode(null), AR_LAB_MODES.full);
  assert.equal(resolveArLabMode("?mode=unknown"), AR_LAB_MODES.full);
});

test("selects the host-proof mode from the query string", () => {
  assert.equal(resolveArLabMode("?mode=host-proof"), AR_LAB_MODES.hostProof);
  assert.equal(resolveArLabMode("mode=host-proof"), AR_LAB_MODES.hostProof);
});
