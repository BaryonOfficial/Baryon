// Dev-only probe: does RenderTarget3D support multiple render targets once the
// extra color attachments are upgraded to Data3DTexture by hand?
//
// Three's RenderTarget3D constructor calls super(), which builds `textures[]`
// as `count` clones of a 2D Texture, and only then assigns
// `this.texture = new Data3DTexture(...)`. Since `texture` is a setter onto
// `textures[0]`, attachment 0 becomes 3D and every other attachment stays 2D.
// The backends underneath already handle per-attachment layer binding —
// WebGL calls framebufferTextureLayer once per attachment, WebGPU sets a 3D
// view descriptor with a slice index — so the gap looks like a constructor
// oversight rather than a capability limit.
//
// This decides whether the modal field cache can write its whole 8-float
// payload (field, gradient, spectral radiance, spectral support) in ONE fill
// pass over the grid, or whether it needs two passes and pays the mode loop
// twice.
import * as THREE from "three";
import { WebGPURenderer, MeshBasicNodeMaterial } from "three/webgpu";
import { mrt, vec3, vec4, float, texture3D } from "three/tsl";

const GRID_WIDTH = 8;
const GRID_HEIGHT = 8;
const GRID_DEPTH = 4;

const report = document.getElementById("report");
const lines = [];
function log(line, cls = "") {
  lines.push(cls ? `<span class="${cls}">${line}</span>` : line);
  report.innerHTML = lines.join("\n");
  console.log("[mrt3d-probe]", line.replace(/<[^>]*>/g, ""));
}

// Distinct constants per attachment so an aliased or unwritten attachment is
// unmistakable. Slice index is encoded in the alpha lane of attachment 0 so a
// wrongly-bound layer shows up as the wrong slice rather than as plausible data.
// Slice marker lives in BLUE, not alpha: colorNode on a basic material carries
// RGB only, so an alpha marker would be overwritten by material opacity.
const ATTACHMENT_B = [0.125, 0.375, 0.625, 0.875];
const sliceMark = (slice) => (slice + 1) / 16;
const expectedA = (slice) => [0.25, 0.5, sliceMark(slice), 1];

function createPatchedRenderTarget3D(count = 2) {
  const target = new THREE.RenderTarget3D(GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH, {
    count,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  target.textures[0].name = "output";
  if (count < 2) {
    return target;
  }

  // The patch under test: make attachment 1 an actual 3D texture, mirroring
  // what the constructor already did for attachment 0.
  const base = target.textures[0];
  const extra = new THREE.Data3DTexture(
    null,
    GRID_WIDTH,
    GRID_HEIGHT,
    GRID_DEPTH,
  );
  extra.type = base.type;
  extra.format = base.format;
  extra.minFilter = base.minFilter;
  extra.magFilter = base.magFilter;
  extra.wrapS = base.wrapS;
  extra.wrapT = base.wrapT;
  extra.wrapR = base.wrapR;
  extra.generateMipmaps = false;
  extra.isRenderTargetTexture = true;
  extra.renderTarget = target;
  target.textures[1] = extra;
  target.textures[1].name = "extra";

  return target;
}

const probeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);

function createProbeScene(slice, { useMrt }) {
  const material = new MeshBasicNodeMaterial();
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;
  const colorA = vec4(
    float(0.25),
    float(0.5),
    float(sliceMark(slice)),
    float(1),
  );
  // colorNode feeds the `output` attachment. fragmentNode must NOT be used here:
  // it replaces the entire fragment stage, which discards the MRT structure and
  // leaves targets[1] with no declared output.
  material.colorNode = colorA;
  if (useMrt) {
    material.mrtNode = mrt({
      output: colorA,
      extra: vec4(...ATTACHMENT_B.map((v) => float(v))),
    });
  }

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;

  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

// WebGL's copyTextureToBuffer binds readback with framebufferTexture2D and only
// special-cases cube maps, so a Data3DTexture is bound as TEXTURE_2D and reads
// back nothing. That is a readback limitation, not a rendering one — and the
// field cache never reads back to the CPU, it samples in a shader. So verify the
// way production will actually consume it: sample the 3D texture with texture3D
// into a plain 2D target, which both backends can read.
async function sampleChannels(renderer, source3D, slice, depth, swizzle) {
  const scratch = new THREE.RenderTarget(GRID_WIDTH, GRID_HEIGHT, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
  });
  const material = new MeshBasicNodeMaterial();
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;
  // Sample the centre of the requested slice in normalized 3D coordinates.
  const sampled = texture3D(
    source3D,
    vec3(float(0.5), float(0.5), float((slice + 0.5) / depth)),
  );
  material.colorNode = swizzle(sampled);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  renderer.setRenderTarget(scratch);
  renderer.render(scene, probeCamera);
  renderer.setRenderTarget(null);
  const pixels = await renderer.readRenderTargetPixelsAsync(
    scratch,
    0,
    0,
    GRID_WIDTH,
    GRID_HEIGHT,
  );
  scratch.dispose();
  return summarize(pixels);
}

// Two sampling passes so all four channels are observed. colorNode carries RGB
// and forces alpha to 1, so the stored alpha is routed through red in a second
// pass rather than being left unverified — both alpha lanes carry real payload
// (gradient Z on attachment A, spectral support on attachment B).
async function verifyBySampling(renderer, source3D, slice, depth) {
  const rgb = await sampleChannels(
    renderer,
    source3D,
    slice,
    depth,
    (sampled) => sampled,
  );
  const alphaProbe = await sampleChannels(
    renderer,
    source3D,
    slice,
    depth,
    (sampled) => vec3(sampled.a, sampled.a, sampled.a),
  );
  return [rgb[0], rgb[1], rgb[2], alphaProbe[0]];
}

function summarize(pixels) {
  // Backends differ: WebGPU hands back raw half-float bit patterns in a
  // Uint16Array, WebGL decodes to Float32Array. Normalize before comparing so a
  // decoding difference cannot masquerade as a rendering failure.
  const raw = Array.from(pixels.slice(0, 4));
  const decoded =
    pixels instanceof Uint16Array
      ? raw.map((bits) => THREE.DataUtils.fromHalfFloat(bits))
      : raw;
  return decoded.map((v) => Number(Number(v).toFixed(4)));
}

function closeEnough(actual, expected, tolerance = 0.01) {
  return expected.every((value, index) =>
    Number.isFinite(actual[index])
      ? Math.abs(actual[index] - value) <= tolerance
      : false,
  );
}

async function runProbe(label, rendererOptions) {
  log(`\n=== ${label} ===`);
  const canvas = document.getElementById("stage");
  const renderer = new WebGPURenderer({ canvas, ...rendererOptions });
  await renderer.init();
  log(`backend: ${renderer.backend?.constructor?.name ?? "unknown"}`);

  let target = null;
  try {
    // Control: a single-attachment RenderTarget3D. If this does not round-trip,
    // the harness is broken and any count:2 failure would be meaningless.
    const control = createPatchedRenderTarget3D(1);
    renderer.setRenderTarget(control, 1);
    renderer.render(createProbeScene(1, { useMrt: false }), probeCamera);
    renderer.setRenderTarget(null);
    const controlPixels = await verifyBySampling(
      renderer,
      control.textures[0],
      1,
      GRID_DEPTH,
    );
    const controlOk = closeEnough(controlPixels, expectedA(1));
    log(
      `control (count:1, slice 1): ${JSON.stringify(controlPixels)} ${controlOk ? "ok" : "HARNESS BROKEN"}`,
      controlOk ? "pass" : "fail",
    );
    control.dispose?.();
    if (!controlOk) {
      log(`RESULT ${label}: inconclusive — control failed`, "fail");
      return null;
    }

    target = createPatchedRenderTarget3D(2);
    log(
      `textures[0]=${target.textures[0].constructor.name} textures[1]=${target.textures[1].constructor.name}`,
    );

    let allPass = true;
    for (let slice = 0; slice < GRID_DEPTH; slice += 1) {
      const scene = createProbeScene(slice, { useMrt: true });
      renderer.setRenderTarget(target, slice);
      renderer.render(scene, probeCamera);
      renderer.setRenderTarget(null);

      const gotA = await verifyBySampling(
        renderer,
        target.textures[0],
        slice,
        GRID_DEPTH,
      );
      const gotB = await verifyBySampling(
        renderer,
        target.textures[1],
        slice,
        GRID_DEPTH,
      );
      // Full RGBA: verifyBySampling routes the stored alpha through red in a
      // second pass, so every channel of both attachments is observed.
      const wantA = expectedA(slice);
      const wantB = ATTACHMENT_B;
      const okA = closeEnough(gotA, wantA);
      const okB = closeEnough(gotB, wantB);
      allPass = allPass && okA && okB;

      log(
        `slice ${slice}: A=${JSON.stringify(gotA)} ${okA ? "ok" : "MISMATCH"} | ` +
          `B=${JSON.stringify(gotB)} ${okB ? "ok" : "MISMATCH"}`,
        okA && okB ? "pass" : "fail",
      );
      if (!okB) {
        log(
          `   expected B=${JSON.stringify(wantB)} — attachment 1 unwritten or aliased`,
          "fail",
        );
      }
    }

    log(
      allPass
        ? `RESULT ${label}: MRT-to-3D WORKS with the patch`
        : `RESULT ${label}: MRT-to-3D FAILED`,
      allPass ? "pass" : "fail",
    );
    return allPass;
  } catch (error) {
    log(`RESULT ${label}: THREW — ${error?.message ?? error}`, "fail");
    console.error(error);
    return false;
  } finally {
    target?.dispose?.();
    renderer.dispose?.();
  }
}

async function main() {
  lines.length = 0;
  log("RenderTarget3D + { count: 2 } + hand-patched Data3DTexture attachment");
  const webgpu = await runProbe("WebGPU", {});
  const webgl = await runProbe("WebGL2 (forceWebGL)", { forceWebGL: true });
  const verdict = (value) =>
    value === null ? "INCONCLUSIVE" : value ? "PASS" : "FAIL";
  log(
    `\nSUMMARY  WebGPU: ${verdict(webgpu)}   WebGL2: ${verdict(webgl)}`,
    webgpu && webgl ? "pass" : "fail",
  );
  window.__mrt3dProbeResult = { webgpu, webgl };
}

main();
