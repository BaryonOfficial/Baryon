import { expect, test } from "vitest";
import * as THREE from "three";
import { prepareBaryonGeometryFromScene } from "./defaultBaryonGeometry.js";
import { DEFAULT_BARYON_GEOMETRY_URL } from "./useDefaultBaryonGeometry.js";

test("default Baryon geometry loads from the app root", () => {
  expect(DEFAULT_BARYON_GEOMETRY_URL).toBe("/glb/Baryon_v2.glb");
});

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

  expect(preparedGeometry).not.toBe(geometry);
  expect(Array.from(sourcePositions)).toStrictEqual([1, 2, 3, -4, 5, -6]);
  Array.from(preparedPositions).forEach((value, index) => {
    expect(Math.abs(value - expectedPositions[index]) < 1e-6).toBe(true);
  });
});

test("prepareBaryonGeometryFromScene throws when no mesh is present", () => {
  const scene = new THREE.Scene();

  expect(() => prepareBaryonGeometryFromScene(scene)).toThrow(
    /does not contain a mesh geometry/,
  );
});
