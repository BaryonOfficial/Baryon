import * as THREE from "three";
import { getBoundaryModeValue } from "../core/modeFamily.js";
import { WebGPURenderer } from "three/webgpu";
import { createAudioPcmCapture } from "../core/audio/audioPcmCapture.js";
import { createModalFieldCache } from "../core/raymarch/fieldCacheBake.js";
import { createRaymarchVolumeMesh } from "../core/raymarch/material.js";
import { createCymaticPlasmaProfileLookup } from "../core/raymarch/cymaticPlasmaProfileLookup.js";
import { CYMATIC_OBSERVER_REFERENCE } from "../core/raymarch/cymaticObserverReference.js";
import { createVisualizationUniforms } from "../core/visualizationUniforms.js";
import { createBroadbandMomentField } from "../core/raymarch/broadbandMomentField.js";
import {
  createGpuCompletionSampler,
  resolveGpuProbeTiming,
  installGpuProbeTiming,
  waitForGpuProbeCompletion,
} from "./gpuProbeTiming.js";
import { createBroadbandModalResponse } from "../utils/audio/broadbandModalResponse.js";
import { createBroadbandSpectralExpansion } from "../core/raymarch/broadbandSpectralExpansion.js";
import { createBroadbandSpectralProjection } from "../core/raymarch/broadbandSpectralProjection.js";
import { createGpuSubmissionGate } from "../render/gpuSubmissionGate.js";
import { createObservationHistory } from "../render/observationHistory.js";
import { retainRenderedObservation } from "./renderedObservationTiming.js";

// G2a integration harness. Accepted PCM is the only input to the worker state.
// Incoming publications retain bounded immutable observer history. Rendering
// consumes it in order; neither presentation nor completion advances PCM.
// The source model is isolated. Shared observer passes use the candidate
// geometry-validity rule; optical energy and the production optics are retained.
export async function runBroadbandRenderProbe({
  families,
  shells,
  channels,
  cavityAcousticScale,
  tailFrames = 4096,
  boundaryMode = "neumann",
  sampleRate = 48000,
  width = 1920,
  height = 1080,
  spectral = false,
  asynchronous = false,
  snapshotTimes = [],
}) {
  if (asynchronous && snapshotTimes.length)
    throw new Error("timed image readbacks require the synchronized probe");
  const initializationStarted = performance.now();
  const channelCount = channels.length;
  const sourceFrames = channels[0].length;
  const captureFrames = sourceFrames + tailFrames;
  // Orthonormal spatial mean of the raw quadratic response. Signed source
  // overlap is squared once, summed over degenerate families within each shell.
  // This read-only diagnostic cannot feed normalization, brightness or admission.
  const energyWeights = new Float64Array(shells.length);
  for (const family of families)
    energyWeights[family.shellIndex] += family.sourceAmplitudeOverlap ** 2;
  function rawSpatialMeanEnergy(observation) {
    let pressure = 0,
      velocity = 0;
    for (let s = 0; s < shells.length; s++) {
      const i = s * shells.length + s;
      pressure += energyWeights[s] * observation.pressureMoments[i];
      velocity += energyWeights[s] * observation.velocityMoments[i];
    }
    return { pressure, velocity, normalization: pressure + velocity };
  }
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: !asynchronous,
  });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new Error("native WebGPU required");
  }
  const restoreGpuTiming = asynchronous
    ? () => {}
    : installGpuProbeTiming(renderer);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 1);
  document.body.style.margin = "0";
  document.body.appendChild(renderer.domElement);
  const radius = 3;
  const uniforms = createVisualizationUniforms({ radius });
  uniforms.uBoundaryMode.value = getBoundaryModeValue(boundaryMode);
  // A compile-time harness comparison, not a production old/new-engine switch.
  uniforms.uSpectralPresentationEnabled.value = spectral ? 1 : 0;
  // Zero-history metadata only, used to compile before the measured source.
  // The capture worker remains the only writer of measured acoustic history.
  const initialSpectralWindow = spectral
    ? createBroadbandModalResponse({ shells, sampleRate, channelCount }).read()
        .spectral
    : null;
  const expansion = spectral
    ? createBroadbandSpectralExpansion(initialSpectralWindow)
    : null;
  const projection = spectral
    ? createBroadbandSpectralProjection({
        ...initialSpectralWindow,
        sourceTexture: expansion.texture,
      })
    : null;
  const field = createBroadbandMomentField({
    families,
    shellCount: shells.length,
    boundaryMode,
    spectralMatrixTexture: projection?.texture,
    apertureRadius: radius,
  });
  let sourceProjectionCount = 0;
  const cache = createModalFieldCache({
    radius: uniforms.uRadius,
    evaluateAperture: (options) => field.evaluateAperture(options),
    prepareAperture(activeRenderer) {
      field.setApertureRadius(uniforms.uRadius.value);
      if (expansion?.render(activeRenderer)) projection.render(activeRenderer);
      field.render(activeRenderer);
      sourceProjectionCount++;
    },
  });
  const profile = createCymaticPlasmaProfileLookup({
    maximumIntervalWidthWorld: radius,
  });
  const mesh = createRaymarchVolumeMesh({
    radius,
    uniforms,
    fieldCache: cache,
    plasmaProfileLookup: profile,
  });
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  const bakeOptions = {
    boundaryMode,
    volumeShape: "sphere",
    observationTimeSeconds: 0,
    observationAdvancing: true,
    geometryExposureSeconds: CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
    observationResetToken: "warmup",
    observationCheckpointKey: null,
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
  };
  let context, worker, capture, source;
  let observationHistory;
  let completionSampler;
  let submissionGate;
  const presentation = { ticks: 0, capacitySkips: 0 };
  const loans = new Map();
  // This is an independently owned worker snapshot, populated asynchronously.
  /** @type {any} */
  let latest = null;
  let ended = false;
  let failure = null;
  let timeout;
  const pcmAccounting = {
    packets: 0,
    frames: 0,
    sourceFrames: 0,
    postSourceFrames: 0,
    returned: 0,
    maximumCaptureAgeSeconds: 0,
  };
  const workerMs = [];
  const renderRecords = [];
  const snapshots = [];
  const normalizationWeights = new Float64Array(shells.length);
  for (const family of families)
    normalizationWeights[family.shellIndex] +=
      family.sourceAmplitudeOverlap ** 2;
  const warmupRecords = [];
  try {
    // Compile seed, evolution and optics before starting a real-time source.
    // These artificial warmup fields never enter the measured audio generation.
    const warm = new Float64Array(shells.length ** 2);
    for (let i = 0; i < shells.length; i++) warm[i * shells.length + i] = 0.001;
    field.update({ pressureMoments: warm, velocityMoments: warm });
    let warmupStarted = performance.now();
    expansion?.update(initialSpectralWindow);
    for (const time of [0, 1 / 60, 2 / 60]) {
      cache.bake(renderer, { ...bakeOptions, observationTimeSeconds: time });
      renderer.render(scene, camera);
      const submitted = performance.now();
      if (asynchronous) await waitForGpuProbeCompletion(renderer);
      else await renderer.resolveTimestampsAsync();
      warmupRecords.push({
        observationTimeSeconds: time,
        submissionMs: submitted - warmupStarted,
        submissionToCompletionMs: performance.now() - warmupStarted,
      });
      warmupStarted = performance.now();
    }
    const zero = new Float64Array(shells.length ** 2);
    field.update({ pressureMoments: zero, velocityMoments: zero });
    cache.bake(renderer, bakeOptions);
    renderer.render(scene, camera);
    if (asynchronous) await waitForGpuProbeCompletion(renderer);
    else await renderer.resolveTimestampsAsync();
    // Clearing the warm-up image is not an observation of the measured source.
    // Its first admitted response must seed geometry from its own field; mixing
    // it into a zero-distance warm-up history invents a surface throughout the
    // volume, particularly when raw acoustic energy is small.
    bakeOptions.observationResetToken = "measured-source";
    sourceProjectionCount = 0;

    context = new AudioContext({ sampleRate });
    if (context.sampleRate !== sampleRate)
      throw new Error("unexpected capture sample rate");
    if (asynchronous)
      completionSampler = createGpuCompletionSampler({
        completeSubmittedWork: () => waitForGpuProbeCompletion(renderer),
        audioTime: () => context.currentTime,
      });
    if (asynchronous)
      submissionGate = createGpuSubmissionGate({
        completeSubmittedWork: () => waitForGpuProbeCompletion(renderer),
      });
    const buffer = context.createBuffer(channelCount, sourceFrames, sampleRate);
    channels.forEach((samples, channel) =>
      buffer.copyToChannel(Float32Array.from(samples), channel),
    );
    source = context.createBufferSource();
    source.buffer = buffer;
    const configuration = {
      sourceGeneration: 1,
      timelineRevision: 0,
      processingRevision: 0,
      channelCount,
      sampleRate,
      startSample: 0,
    };
    observationHistory = createObservationHistory({
      generation: configuration,
      capacity: 64,
    });
    function retainObservation(observation) {
      latest = observation;
      // Nonlinear startup has no prepared interval to publish yet.
      if (!failure && observation.response?.sampleIndex > 0) {
        try {
          observationHistory.offer({
            ...observation,
            endSample: observation.response.sampleIndex,
          });
        } catch (error) {
          failure = error;
        }
      }
    }
    worker = new Worker(
      new URL("./broadbandCaptureProbe.worker.js", import.meta.url),
      { type: "module" },
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("worker initialization timed out")),
        5000,
      );
      worker.onmessage = ({ data }) => {
        clearTimeout(timer);
        if (data.type === "ready") resolve();
        else reject(new Error(data.reason ?? "worker initialization failed"));
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event.message));
      };
      worker.postMessage({
        type: "initialize",
        options: {
          configuration,
          shells,
          cavityAcousticScale,
        },
        publishObservations: true,
      });
    });
    worker.onerror = (event) => {
      failure = new Error(event.message);
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "error") failure = new Error(data.reason);
      else if (data.type === "consumed") {
        const release = loans.get(data.sequence);
        loans.delete(data.sequence);
        if (!release || !data.accepted.accepted) {
          failure = new Error("invalid worker PCM return/admission");
          return;
        }
        release(data.buffers);
        pcmAccounting.returned++;
        workerMs.push(data.processingMs);
        if (data.observation) retainObservation(data.observation);
      } else if (data.type === "observation") {
        retainObservation(data.observation);
        ended = true;
      }
    };
    let startFrame = 0;
    capture = await createAudioPcmCapture({
      context,
      source,
      configuration,
      onBlock(packet, release) {
        pcmAccounting.packets++;
        pcmAccounting.frames += packet.frameCount;
        pcmAccounting[
          packet.postSourceSilence ? "postSourceFrames" : "sourceFrames"
        ] += packet.frameCount;
        pcmAccounting.maximumCaptureAgeSeconds = Math.max(
          pcmAccounting.maximumCaptureAgeSeconds,
          context.currentTime -
            (packet.contextFrame + packet.frameCount) / sampleRate,
        );
        loans.set(packet.sequence, release);
        worker.postMessage({ type: "pcm", packet }, packet.buffers);
      },
      onEvent(event) {
        if (event.type === "fault") {
          failure = new Error(`capture fault: ${event.reason}`);
          worker.postMessage({ type: "fault", reason: event.reason });
        } else if (event.type === "ended") worker.postMessage(event);
        else if (event.type === "paused") {
          worker.postMessage({ type: "paused" });
          worker.postMessage({ type: "read" });
        }
      },
    });
    startFrame = Math.ceil((context.currentTime + 0.1) * sampleRate);
    const initializationToSourceSchedulingMs =
      performance.now() - initializationStarted;
    capture.start({ contextFrame: startFrame });
    capture.end({ contextFrame: startFrame + sourceFrames });
    // End marks forcing complete. Known zeros continue on the audio clock;
    // pause defines the finite measurement horizon without flushing DSP state.
    capture.pause({ contextFrame: startFrame + captureFrames });
    source.start(startFrame / sampleRate);
    await context.resume();
    timeout = setTimeout(
      () => {
        failure = new Error("capture/render probe timed out");
      },
      (captureFrames / sampleRate + 20) * 1000,
    );
    let submittedSample = 0;
    let renderedObservation = null;
    let renderedFrame = null;
    while (!ended || observationHistory.read().queued > 0) {
      if (asynchronous) {
        await new Promise(requestAnimationFrame);
        presentation.ticks++;
      }
      if (failure) throw failure;
      completionSampler?.assertHealthy();
      if (submissionGate && !submissionGate.canSubmit()) {
        presentation.capacitySkips++;
        continue;
      }
      if (observationHistory.read().queued > 0) {
        const started = performance.now();
        const previousRenderedTime =
          renderedObservation?.renderedSourceTimeSeconds ?? 0;
        const observationUpdates = [];
        let frame, baked;
        let updates = 0;
        // At most two field/observer updates per ordinary presentation tick.
        // Substep reads do no GPU work; retained history is never replaced by
        // the newest endpoint to catch up. Overflow fails explicitly.
        do {
          frame = observationHistory.take();
          const preparedSample = frame.response.sampleIndex;
          const delayFrames = frame.preparation.delayFrames;
          if (
            preparedSample !== frame.preparation.preparedFrames ||
            preparedSample + delayFrames !== frame.nextSample
          )
            throw new Error("inconsistent prepared-sample alignment");
          field.update(frame.response);
          expansion?.update(frame.response.spectral);
          baked = cache.bake(renderer, {
            ...bakeOptions,
            observationTimeSeconds: preparedSample / sampleRate,
          });
          if (
            renderRecords.length === 0 &&
            observationUpdates.length === 0 &&
            !baked.reset
          )
            throw new Error("measured observer inherited warm-up history");
          if (baked.baked) {
            updates++;
            renderedFrame = frame;
          }
          observationUpdates.push({
            sample: preparedSample,
            baked: baked.baked,
            reset: baked.reset,
            steps: baked.stepCount,
          });
          renderedObservation = retainRenderedObservation(renderedObservation, {
            baked: baked.baked,
            sourceTimeSeconds: preparedSample / sampleRate,
            preparationDelaySeconds: delayFrames / sampleRate,
          });
        } while (observationHistory.read().queued > 0 && updates < 2);
        const preparedSample = frame.response.sampleIndex;
        const delayFrames = frame.preparation.delayFrames;
        renderer.render(scene, camera);
        const submitted = performance.now();
        const record = {
          sample: preparedSample,
          capturedSample: frame.nextSample,
          preparationDelayFrames: delayFrames,
          sourceTimeSeconds: preparedSample / sampleRate,
          ...renderedObservation,
          rawSpatialMeanEnergy: rawSpatialMeanEnergy(renderedFrame.response),
          observationGapSeconds:
            renderedObservation.renderedSourceTimeSeconds -
            previousRenderedTime,
          publicationGapSeconds:
            (preparedSample - submittedSample) / sampleRate,
          observerSteps: observationUpdates.reduce(
            (total, value) => total + value.steps,
            0,
          ),
          observerReset: observationUpdates.some((value) => value.reset),
          observerBaked: updates > 0,
          observationUpdates,
        };
        if (completionSampler) {
          completionSampler.observe(
            record,
            {
              startedAtMs: started,
              submittedAtMs: submitted,
              availableAtContextSeconds:
                startFrame / sampleRate +
                renderedObservation.renderedAvailabilityTimeSeconds,
              responseAtContextSeconds:
                startFrame / sampleRate +
                renderedObservation.renderedSourceTimeSeconds,
            },
            submissionGate.markSubmitted(),
          );
        } else {
          const submittedAtContextSeconds = context.currentTime;
          const gpuTiming = await resolveGpuProbeTiming(renderer, started);
          Object.assign(record, {
            submittedAtMs: submitted,
            submitCpuMs: submitted - started,
            submissionAgeSeconds:
              submittedAtContextSeconds -
              startFrame / sampleRate -
              renderedObservation.renderedAvailabilityTimeSeconds,
            submissionAndCompletionMs: performance.now() - started,
            gpuMs: gpuTiming.elapsedMs,
            gpuTiming,
            completionAgeSeconds:
              context.currentTime -
              startFrame / sampleRate -
              renderedObservation.renderedAvailabilityTimeSeconds,
            responseAgeSeconds:
              context.currentTime -
              startFrame / sampleRate -
              renderedObservation.renderedSourceTimeSeconds,
          });
        }
        submittedSample = preparedSample;
        let rawPressureEnergy = 0,
          rawVelocityEnergy = 0;
        for (let m = 0; m < shells.length; m++) {
          const diagonal = m * (shells.length + 1);
          rawPressureEnergy +=
            normalizationWeights[m] *
            renderedFrame.response.pressureMoments[diagonal];
          rawVelocityEnergy +=
            normalizationWeights[m] *
            renderedFrame.response.velocityMoments[diagonal];
        }
        Object.assign(record, {
          rawPressureEnergy,
          rawVelocityEnergy,
          normalizationSquared: rawPressureEnergy + rawVelocityEnergy,
        });
        renderRecords.push(record);
        while (
          snapshots.length < snapshotTimes.length &&
          snapshotTimes[snapshots.length] <= preparedSample / sampleRate
        ) {
          const started = performance.now();
          const image = renderer.domElement.toDataURL("image/png");
          snapshots.push({
            requestedTimeSeconds: snapshotTimes[snapshots.length],
            sourceTimeSeconds: renderedObservation.renderedSourceTimeSeconds,
            rawSpatialMeanEnergy: rawSpatialMeanEnergy(renderedFrame.response),
            captureMs: performance.now() - started,
            image,
          });
        }
      } else if (!asynchronous) {
        await new Promise(requestAnimationFrame);
      }
    }
    await submissionGate?.drain();
    await completionSampler?.drain();
    if (failure) throw failure;
    if (
      !latest?.response ||
      latest.processedFrames !== captureFrames ||
      latest.sourceFrames !== sourceFrames ||
      latest.postSourceFrames !== tailFrames ||
      latest.response.sampleIndex !==
        captureFrames - latest.preparation.delayFrames ||
      loans.size
    )
      throw new Error("incomplete audio history or unreleased PCM");
    const observerBeforeReads = cache.getObserverState();
    for (let i = 0; i < 10; i++) {
      const result = cache.bake(renderer, {
        ...bakeOptions,
        observationTimeSeconds: latest.response.sampleIndex / sampleRate,
      });
      if (result.baked)
        throw new Error("cached display read advanced observer");
    }
    const observerAfterReads = cache.getObserverState();
    const image = renderer.domElement.toDataURL("image/png");
    return {
      pcmAccounting,
      workerMs,
      renderRecords,
      sourceProjectionCount,
      observationHistory: observationHistory.read(),
      asynchronous,
      presentation,
      completionSampling: completionSampler?.read() ?? null,
      snapshots,
      warmupRecords,
      initializationToSourceSchedulingMs,
      finalObservation: latest,
      observerBeforeReads,
      observerAfterReads,
      submittedSample,
      renderedSample: Math.round(
        renderedObservation.renderedSourceTimeSeconds * sampleRate,
      ),
      channelCount,
      cavityAcousticScale,
      tailFrames,
      preparationDelayFrames: latest.preparation.delayFrames,
      dimensions: { width, height },
      boundaryMode,
      reflectionReuse: true,
      spectral,
      cosine: true,
      cosineProjection: {
        width: field.coefficientWidth,
        terms: field.projectionTermCount,
        initializationMs: field.initializationMs,
        textureBytes: field.textureBytes,
      },
      additionalFieldTargetBytes: field.renderTargetBytes,
      geometryAvailabilityBytes: cache.geometryAvailabilityBytes,
      image,
      capture: capture.read(),
      scope: `Live ${channelCount === 2 ? "stereo" : "mono"} PCM through ${latest.preparation.active ? "nonlinear overlap-add and " : ""}DC preparation, full shell state/moments, ${spectral ? "full-bin spectral expansion, matrices and spatial color" : "fixed material color"}, raw GPU field, existing aperture, geometric-validity observer revision and volume optics; no bloom. ${asynchronous ? "Animation-frame scheduling with sampled queue completion; no GPU elapsed timing." : "Synchronized GPU timing."} GPU completion is not physical display presentation.`,
    };
  } finally {
    clearTimeout(timeout);
    capture?.dispose();
    worker?.terminate();
    try {
      try {
        await submissionGate?.drain();
      } finally {
        await completionSampler?.drain();
      }
    } finally {
      if (context && context.state !== "closed") await context.close();
      cache.dispose();
      field.dispose();
      projection?.dispose();
      expansion?.dispose();
      profile.dispose();
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        material.dispose();
      restoreGpuTiming();
      renderer.dispose();
      renderer.domElement.remove();
    }
  }
}
