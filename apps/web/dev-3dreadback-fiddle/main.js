// three.js issue #34118 — readRenderTargetPixelsAsync() on a RenderTarget3D
// returns all zeros on the WebGL backend, correct data on WebGPU.
//
// Both backends run in one page. The texture3D() sample is the control: it
// proves the slice really does hold the data on WebGL, so the zeros are a
// readback bug, not a "WebGL2 cannot render into 3D slices" limitation.

import * as THREE from "three/webgpu";
import { texture3D, uv, vec3 } from "three/tsl";

const WIDTH = 8;
const HEIGHT = 8;
const DEPTH = 4;
const SLICE = 2;
const WRITTEN = [0.25, 0.5, 0.75]; // -> 64, 128, 191 as bytes

const out = document.createElement("pre");
out.style.cssText = "font:13px/1.7 monospace;padding:12px;white-space:pre-wrap";
document.body.appendChild(out);

const log = (line) => {
  out.textContent += line + "\n";
  console.log(line);
};

const quad = (colorNode) => {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = colorNode;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return scene;
};

async function probe(forceWebGL) {
  const renderer = new THREE.WebGPURenderer({ forceWebGL });
  await renderer.init();
  renderer.setSize(WIDTH, HEIGHT);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  camera.position.z = 1;

  const target = new THREE.RenderTarget3D(WIDTH, HEIGHT, DEPTH, {
    type: THREE.UnsignedByteType,
  });
  target.texture.minFilter = THREE.NearestFilter;
  target.texture.magFilter = THREE.NearestFilter;

  // Write a known constant into one slice.
  renderer.setRenderTarget(target, SLICE);
  renderer.render(quad(vec3(...WRITTEN)), camera);
  renderer.setRenderTarget(null);

  // Control: sample that slice in a shader, into an ordinary 2D target.
  const scratch = new THREE.RenderTarget(WIDTH, HEIGHT, {
    type: THREE.UnsignedByteType,
  });
  renderer.setRenderTarget(scratch);
  renderer.render(
    quad(texture3D(target.texture, vec3(uv(), (SLICE + 0.5) / DEPTH))),
    camera,
  );
  renderer.setRenderTarget(null);
  const sampled = await renderer.readRenderTargetPixelsAsync(
    scratch,
    0,
    0,
    WIDTH,
    HEIGHT,
  );

  // The path under test: read the 3D slice directly.
  const direct = await renderer.readRenderTargetPixelsAsync(
    target,
    0,
    0,
    WIDTH,
    HEIGHT,
    0,
    SLICE,
  );

  renderer.dispose();
  return { sampled, direct };
}

const texel = (pixels) => `[${Array.from(pixels.slice(0, 4)).join(", ")}]`;
const zeros = (pixels) => pixels.every((value) => value === 0);

async function main() {
  log(`three r${THREE.REVISION} — RenderTarget3D slice ${SLICE} of ${DEPTH}`);
  log(`wrote ${texel(new Uint8Array([64, 128, 191, 255]))} into the slice\n`);

  for (const forceWebGL of [false, true]) {
    const label = forceWebGL ? "WebGL2 " : "WebGPU ";
    try {
      const { sampled, direct } = await probe(forceWebGL);
      log(
        `${label} texture3D() sample -> ${texel(sampled)}  ${zeros(sampled) ? "ZEROS" : "ok"}`,
      );
      log(
        `${label} 3D slice readback -> ${texel(direct)}  ${zeros(direct) ? "ZEROS  <- bug" : "ok"}\n`,
      );
    } catch (error) {
      log(`${label} threw: ${error.message}\n`);
    }
  }
}

main();
