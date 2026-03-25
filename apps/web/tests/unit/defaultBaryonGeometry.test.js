import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { prepareBaryonGeometryFromScene } from "../../../../packages/app-shell/src/components/hooks/defaultBaryonGeometry.js";

test("prepareBaryonGeometryFromScene clones mesh geometry and bakes scale", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([1, 2, 3, -4, 5, -6], 3),
  );

  const mesh = new THREE.Mesh(geometry);
  const scene = new THREE.Scene();
  scene.add(mesh);

  const preparedGeometry = prepareBaryonGeometryFromScene(scene);
  const preparedPositions = preparedGeometry.attributes.position.array;
  const sourcePositions = geometry.attributes.position.array;
  const expectedPositions = [0.2, 0.4, 0.6, -0.8, 1, -1.2];

  assert.notStrictEqual(preparedGeometry, geometry);
  assert.deepEqual(Array.from(sourcePositions), [1, 2, 3, -4, 5, -6]);
  Array.from(preparedPositions).forEach((value, index) => {
    assert.ok(Math.abs(value - expectedPositions[index]) < 1e-6);
  });
});

test("prepareBaryonGeometryFromScene throws when no mesh is present", () => {
  const scene = new THREE.Scene();

  assert.throws(
    () => prepareBaryonGeometryFromScene(scene),
    /does not contain a mesh geometry/,
  );
});
