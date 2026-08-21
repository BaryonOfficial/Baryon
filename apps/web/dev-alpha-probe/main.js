// Dev-only probe for the transparent external-output alpha boundary.
//
// Reproduces the exact Windows Spout question on any WebGPU host: does a
// premultiplied transparent frame rendered through the production
// createRenderOutputPipeline still carry coverage alpha when the canvas is
// sampled with createImageBitmap() (the Windows compositor-bridge transfer)?
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { vec4, float, uniform } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  createRenderOutputPipeline,
  resolveRenderQualityProfile,
  syncRenderOutputBloomUniforms,
  syncRenderOutputNodeTopology,
  OUTPUT_MODES,
  RENDER_CONTEXTS,
} from "@baryon/engine/render/outputPipeline";

const report = document.getElementById("report");
const lines = [];
function log(line) {
  lines.push(line);
  report.textContent = lines.join("\n");
  console.log("[alpha-probe]", line);
}

function createPremultipliedCoverageMaterial(coverage, radiance) {
  // Mirrors the raymarch volume material contract: the shader returns
  // premultiplied radiance with real coverage alpha, blended One /
  // OneMinusSrcAlpha into the transparent scene target.
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  material.lights = false;
  material.outputNode = vec4(
    float(radiance[0]).mul(uniform(coverage)),
    float(radiance[1]).mul(uniform(coverage)),
    float(radiance[2]).mul(uniform(coverage)),
    uniform(coverage),
  );
  return material;
}

async function sampleCanvasAlpha(canvas, label) {
  const bitmap = await createImageBitmap(canvas);
  try {
    const sampleWidth = Math.min(64, bitmap.width);
    const sampleHeight = Math.min(64, bitmap.height);
    const probeCanvas = new OffscreenCanvas(sampleWidth, sampleHeight);
    const context = probeCanvas.getContext("2d", {
      alpha: true,
      willReadFrequently: true,
    });
    context.globalCompositeOperation = "copy";
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let alphaTotal = 0;
    let maxAlpha = 0;
    let nonZeroAlpha = 0;
    let nonBlack = 0;
    let nonBlackTransparent = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      const bright =
        Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 2;
      alphaTotal += alpha;
      maxAlpha = Math.max(maxAlpha, alpha);
      if (alpha > 0) nonZeroAlpha += 1;
      if (bright) nonBlack += 1;
      if (bright && alpha < 255) nonBlackTransparent += 1;
    }
    const pixelCount = sampleWidth * sampleHeight;
    const centerIndex =
      ((sampleHeight >> 1) * sampleWidth + (sampleWidth >> 1)) * 4;
    const center = Array.from(pixels.slice(centerIndex, centerIndex + 4));
    log(
      `${label}: meanAlpha=${(alphaTotal / pixelCount).toFixed(2)} ` +
        `maxAlpha=${maxAlpha} nonZeroAlpha=${nonZeroAlpha}/${pixelCount} ` +
        `nonBlack=${nonBlack} nonBlackTransparent=${nonBlackTransparent} ` +
        `center rgba=[${center.join(", ")}]`,
    );
    return { maxAlpha, nonZeroAlpha, nonBlack };
  } finally {
    bitmap.close();
  }
}

async function main() {
  if (!navigator.gpu) {
    log("FAIL: WebGPU unavailable in this browser.");
    return;
  }

  const canvas = document.getElementById("stage");
  // Mirror createBaryonRenderer: transparent canvas, no antialias, WebGPU.
  const renderer = new WebGPURenderer({
    canvas,
    alpha: true,
    antialias: false,
  });
  await renderer.init();
  if (renderer.backend?.isWebGLBackend === true) {
    log("FAIL: renderer fell back to WebGL; probe requires WebGPU.");
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(512, 512, false);
  renderer.setClearColor(new THREE.Color(0x000000), 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
  camera.position.set(0, 0, 4);

  // Volume-analog: large quad with premultiplied coverage output (a=0.5).
  const volume = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    createPremultipliedCoverageMaterial(0.5, [0.9, 0.35, 0.1]),
  );
  scene.add(volume);

  // Idle-logo analog: LineSegments with LineBasicMaterial opacity 0.6.
  const logo = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.4, 2.4)),
    new THREE.LineBasicMaterial({
      color: 0x35d0ff,
      transparent: true,
      opacity: 0.6,
    }),
  );
  scene.add(logo);

  const renderProfile = resolveRenderQualityProfile({
    renderContext: RENDER_CONTEXTS.externalOutput,
  });
  log(
    `profile: context=${renderProfile.renderContext} traa=${renderProfile.traaEnabled} bloom=${renderProfile.bloomAllowed}`,
  );
  const pipelineState = createRenderOutputPipeline(renderer, scene, camera, {
    renderProfile,
  });
  if (!pipelineState) {
    log("FAIL: createRenderOutputPipeline returned null.");
    return;
  }
  syncRenderOutputBloomUniforms(pipelineState.postNodes, { enabled: true });
  syncRenderOutputNodeTopology(
    pipelineState.pipeline,
    pipelineState.postNodes,
    {
      outputMode: OUTPUT_MODES.transparent,
    },
  );

  // Let the pipeline warm up (TRAA history, bloom targets) for a few frames.
  // setTimeout, not requestAnimationFrame: headless panes may never fire rAF,
  // and WebGPU presentation only needs a task-boundary yield.
  for (let frame = 0; frame < 5; frame += 1) {
    renderer.setRenderTarget(null);
    renderer.setMRT?.(null);
    pipelineState.pipeline.render();
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  await sampleCanvasAlpha(canvas, "pipeline transparent frame");

  // Control: same scene rendered directly (no RenderPipeline) so pipeline
  // effects can be separated from base renderer/canvas behavior.
  renderer.setRenderTarget(null);
  renderer.setMRT?.(null);
  await renderer.render(scene, camera);
  await new Promise((resolve) => setTimeout(resolve, 16));
  await sampleCanvasAlpha(canvas, "direct renderer frame");

  // Re-render through the pipeline and sample in the SAME task (no rAF wait),
  // matching publishCompletedStageFrame() ordering on the stage.
  renderer.setRenderTarget(null);
  renderer.setMRT?.(null);
  pipelineState.pipeline.render();
  await sampleCanvasAlpha(canvas, "pipeline frame, same-task sample");

  log("done");
}

main().catch((error) => {
  log(`FAIL: ${error?.stack ?? error}`);
});
