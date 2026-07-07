import test from "node:test";
import assert from "node:assert/strict";
import { createArLabXrStoreOptions } from "../../src/ar-lab/arLabXrStoreOptions.js";

test("AR Lab XR store does not auto-offer or auto-enter XR sessions", () => {
  const options = createArLabXrStoreOptions();

  assert.equal(options.domOverlay, true);
  assert.equal(options.offerSession, false);
  assert.equal(options.enterGrantedSession, false);
});
