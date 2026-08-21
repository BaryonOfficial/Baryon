import { expect, test } from "vitest";
import * as THREE from "three";
import { prepareBaryonGeometryFromScene } from "./defaultBaryonGeometry.js";
import { DEFAULT_BARYON_GEOMETRY_URL } from "./useDefaultBaryonGeometry.js";

test("default Baryon geometry stays inside web and packaged renderer roots", () => {
  expect(
    new URL(DEFAULT_BARYON_GEOMETRY_URL, "https://baryon.live/").href,
  ).toBe("https://baryon.live/glb/Baryon_v2.glb");
  expect(
    new URL(
      DEFAULT_BARYON_GEOMETRY_URL,
      "file:///Applications/Baryon.app/Contents/Resources/app.asar/.vite/renderer/main_window/index.html",
    ).href,
  ).toBe(
    "file:///Applications/Baryon.app/Contents/Resources/app.asar/.vite/renderer/main_window/glb/Baryon_v2.glb",
  );
});

test("prepareBaryonGeometryFromScene merges transformed meshes into one normalized source", () => {
  const scene = new THREE.Scene();
  const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  left.position.x = -2;
  right.position.x = 2;
  scene.add(left, right);

  const prepared = prepareBaryonGeometryFromScene(scene);
  const size = prepared.boundingBox.getSize(new THREE.Vector3());
  const center = prepared.boundingBox.getCenter(new THREE.Vector3());

  expect(prepared).not.toBe(left.geometry);
  expect(prepared).not.toBe(right.geometry);
  expect(prepared.index).toBeNull();
  expect(prepared.attributes.position.count).toBe(
    left.geometry.index.count + right.geometry.index.count,
  );
  expect(prepared.attributes.normal.count).toBe(
    prepared.attributes.position.count,
  );
  expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(1.2);
  expect(center.length()).toBeCloseTo(0);
});

test("prepareBaryonGeometryFromScene throws when no mesh is present", () => {
  const scene = new THREE.Scene();

  expect(() => prepareBaryonGeometryFromScene(scene)).toThrow(
    /does not contain mesh triangle geometry/,
  );
});
