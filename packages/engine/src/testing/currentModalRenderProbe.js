import * as THREE from "three";
import { getBoundaryModeValue } from "../core/modeFamily.js";
import { WebGPURenderer } from "three/webgpu";
import {
  createNodeAnalyser,
  sampleAnalyser,
} from "../core/audio/analyserSampler.js";
import { createAudioFeatureRuntime } from "../utils/audio/audioFeatureEngine.js";
import { createRendererFeatureView } from "../utils/audio/audioFeaturePacketCodec.js";
import {
  setupRaymarch,
  tickRaymarch,
  disposeRaymarch,
} from "../core/raymarchSetup.js";
import {
  createGpuCompletionSampler,
  resolveGpuProbeTiming,
  installGpuProbeTiming,
  waitForGpuProbeCompletion,
} from "./gpuProbeTiming.js";
import { createGpuSubmissionGate } from "../render/gpuSubmissionGate.js";
import { retainRenderedObservation } from "./renderedObservationTiming.js";

// Baseline for the isolated G2a comparison. Uses the existing capture snapshots,
// worker, descriptor, upload, field and observer owners. The fixed camera,
// color setting, no bloom and selected scheduling policy match the candidate
// harness; this is not app-shell or physical presentation qualification.
export async function runCurrentModalRenderProbe({
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
  measureWeakResponse = false,
}) {
  if (asynchronous && snapshotTimes.length)
    throw new Error("timed image readbacks require the synchronized probe");
  if (measureWeakResponse && (asynchronous || !snapshotTimes.length))
    throw new Error(
      "weak-response measurement requires synchronized image checkpoints",
    );
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
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // The comparison plugin rewires this import to the pinned historical core.
  // Its setup contract remains isolated here, outside production setup.
  const state =
    /** @type {(geometry: any, parameters: any, audioConfig: any) => any} */ (
      setupRaymarch
    )(
      geometry,
      { radius: 3, volumeShape: "sphere" },
      { fftSize: 8192, sampleRate },
    );
  geometry.dispose();
  state.uniforms.uBoundaryMode.value = getBoundaryModeValue(boundaryMode);
  const scene = new THREE.Scene();
  // Only the volume is drawn in both probes. Product scene motion and the idle
  // logo would change the visual workload and fixed-view comparison.
  scene.add(state.volumeMesh);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  let context, runtime, source;
  let completionSampler;
  let submissionGate;
  const presentation = { ticks: 0, capacitySkips: 0 };
  let startTime = 0;
  let sessionId = 1;
  let playing = false;
  let captures = 0;
  let structuralCaptures = 0;
  const renderRecords = [];
  const snapshots = [];
  try {
    context = new AudioContext({ sampleRate });
    if (context.sampleRate !== sampleRate)
      throw new Error("unexpected sample rate");
    if (asynchronous)
      completionSampler = createGpuCompletionSampler({
        completeSubmittedWork: () => waitForGpuProbeCompletion(renderer),
        audioTime: () => context.currentTime,
      });
    if (asynchronous)
      submissionGate = createGpuSubmissionGate({
        completeSubmittedWork: () => waitForGpuProbeCompletion(renderer),
      });
    const bus = context.createGain();
    const fast = createNodeAnalyser(context, bus, 2048);
    const structural = createNodeAnalyser(context, bus, 8192);
    const silent = context.createGain();
    silent.gain.value = 0;
    fast.analyser.connect(silent);
    structural.analyser.connect(silent);
    silent.connect(context.destination);
    const duration = (channels[0].length + tailFrames) / sampleRate;
    const time = () =>
      Math.max(0, Math.min(duration, context.currentTime - startTime));
    const audioSession = {
      getStatus: () => ({
        analysisSource: "file",
        sourceSession: {
          kind: "file",
          phase: playing ? "playing" : "paused",
          sessionId,
          timelineRevision: 0,
          terminalReason: null,
          systemCapture: null,
        },
        pitchSourceMode: "spectral",
        fftSize: 8192,
        fastFftSize: 2048,
        capacity: 160, // Frozen descriptor capacity of the pinned historical revision.
        sampleRate,
        isAudioLoaded: true,
        isPlaying: playing,
        isPlaybackPaused: !playing,
        isLiveInputActive: false,
        hasAnalysisSource: true,
        playbackSessionId: sessionId,
        lastPlaybackEndReason: null,
      }),
      getTransportState: () => ({ currentTimeSeconds: time() }),
      readFeatureAnalysisCapture: ({ includeStructural }) => {
        captures++;
        if (includeStructural) structuralCaptures++;
        return {
          captureTimestampMs: performance.now(),
          observationTimeSeconds: time(),
          fast: { ...sampleAnalyser(fast), sourceMode: "file" },
          structural: includeStructural
            ? { ...sampleAnalyser(structural), sourceMode: "file" }
            : null,
        };
      },
    };
    runtime = createAudioFeatureRuntime({}, { audioSession });
    runtime.configure({
      radius: 3,
      boundaryMode,
      cavityGeometry: "rectangular",
      cavityAcousticScale,
    });
    const buffer = context.createBuffer(
      channels.length,
      channels[0].length,
      sampleRate,
    );
    channels.forEach((samples, channel) =>
      buffer.copyToChannel(Float32Array.from(samples), channel),
    );
    const warmBuffer = measureWeakResponse
      ? context.createBuffer(channels.length, 2 * sampleRate, sampleRate)
      : buffer;
    if (measureWeakResponse)
      for (let a = 0; a < channels.length; a++) {
        const samples = warmBuffer.getChannelData(a);
        for (let n = 0; n < samples.length; n++)
          samples[n] = 0.1 * Math.sin((2 * Math.PI * 220 * n) / sampleRate);
      }
    function play(audioBuffer = buffer) {
      const nextSource = context.createBufferSource();
      nextSource.buffer = audioBuffer;
      nextSource.connect(bus);
      startTime = context.currentTime + 0.1;
      playing = true;
      nextSource.start(startTime);
      return nextSource;
    }
    source = play(warmBuffer);
    runtime.start();
    await context.resume();
    let warmFrames = 0;
    let lastFrame = -1;
    let lastTime = 0;
    const warmDeadline = performance.now() + 10000;
    // Wait for real production authority, then compile active observer/optics.
    while (warmFrames < 4) {
      if (performance.now() > warmDeadline)
        throw new Error(
          `baseline warmup timed out: ${JSON.stringify({ runtime: runtime.getStatus(), captures, structuralCaptures, context: context.state, contextTime: context.currentTime })}`,
        );
      const frame = createRendererFeatureView(runtime.readLatestFeatureModel());
      if (
        frame?.renderAuthority &&
        frame.activeModeCount > 0 &&
        frame.frameId !== lastFrame
      ) {
        tickRaymarch(
          state,
          frame,
          frame.observationTimeSeconds,
          1 / 60,
          renderer,
        );
        state.uniforms.uSpectralPresentationEnabled.value = spectral ? 1 : 0;
        renderer.render(scene, camera);
        if (asynchronous) await waitForGpuProbeCompletion(renderer);
        else await resolveGpuProbeTiming(renderer);
        lastFrame = frame.frameId;
        warmFrames++;
      } else await new Promise(requestAnimationFrame);
    }
    if (!source) throw new Error("baseline warmup source missing");
    source.stop();
    source.disconnect();
    const measuredGeneration = runtime.getStatus().sourceGeneration + 1;
    playing = false;
    // AnalyserNode windows outlive the source. Drain the longest window before
    // admitting the measured generation so warm-up audio cannot excite it.
    await new Promise((resolve) =>
      setTimeout(resolve, (8192 / sampleRate + 0.05) * 1000),
    );
    sessionId++;
    source = play();
    captures = 0;
    structuralCaptures = 0;
    lastFrame = -1;
    lastTime = 0;
    const deadline = performance.now() + (duration + 20) * 1000;
    let maximumActiveModes = 0;
    let renderedObservation = null;
    let unseededFrames = 0;
    function captureInactiveSnapshots(hasModelAuthority = false) {
      while (
        snapshots.length < snapshotTimes.length &&
        snapshotTimes[snapshots.length] <= time()
      ) {
        const started = performance.now();
        const image = renderer.domElement.toDataURL("image/png");
        snapshots.push({
          requestedTimeSeconds: snapshotTimes[snapshots.length],
          sourceTimeSeconds: state.fieldCache.getObserverState().hasHistory
            ? (renderedObservation?.renderedSourceTimeSeconds ?? null)
            : null,
          contextSourceTimeSeconds: time(),
          renderAuthority: hasModelAuthority,
          observerHasHistory: state.fieldCache.getObserverState().hasHistory,
          measuredObserverSeeded: renderedObservation !== null,
          fieldVisible: state.volumeMesh.visible,
          captureMs: performance.now() - started,
          image,
        });
      }
    }
    while (context.currentTime <= startTime + duration) {
      if (asynchronous) {
        await new Promise(requestAnimationFrame);
        presentation.ticks++;
      }
      if (performance.now() > deadline)
        throw new Error("baseline render timed out");
      completionSampler?.assertHealthy();
      if (submissionGate && !submissionGate.canSubmit()) {
        presentation.capacitySkips++;
        continue;
      }
      const frame = createRendererFeatureView(runtime.readLatestFeatureModel());
      // Only models belonging to the restarted source enter the measurement.
      const status = runtime.getStatus();
      const observationTime = frame?.observationTimeSeconds;
      if (
        frame?.renderAuthority &&
        typeof observationTime === "number" &&
        frame.frameId !== lastFrame &&
        frame.sourceGeneration === status.sourceGeneration &&
        frame.sourceGeneration === measuredGeneration &&
        observationTime <= time()
      ) {
        const started = performance.now();
        tickRaymarch(
          state,
          frame,
          observationTime,
          Math.max(0, observationTime - lastTime),
          renderer,
        );
        const observerBaked = state.cymaticObserverBakeResult?.baked === true;
        if (measureWeakResponse && !observerBaked && !renderedObservation) {
          // A valid historical packet may project no modes at all. Record the
          // actual image, but do not invent a seeded observer or latency zero.
          renderer.render(scene, camera);
          await resolveGpuProbeTiming(renderer);
          unseededFrames++;
          maximumActiveModes = Math.max(
            maximumActiveModes,
            frame.activeModeCount,
          );
          captureInactiveSnapshots(frame.renderAuthority === true);
          lastFrame = frame.frameId;
          lastTime = observationTime;
          await new Promise(requestAnimationFrame);
          continue;
        }
        const previousRenderedTime =
          renderedObservation?.renderedSourceTimeSeconds ?? 0;
        renderedObservation = retainRenderedObservation(renderedObservation, {
          baked: observerBaked,
          sourceTimeSeconds: observationTime,
          preparationDelaySeconds: 0,
        });
        state.uniforms.uSpectralPresentationEnabled.value = spectral ? 1 : 0;
        renderer.render(scene, camera);
        const submitted = performance.now();
        const record = {
          sourceTimeSeconds: observationTime,
          ...renderedObservation,
          observationGapSeconds:
            renderedObservation.renderedSourceTimeSeconds -
            previousRenderedTime,
          publicationGapSeconds: observationTime - lastTime,
          activeModeCount: frame.activeModeCount,
          sourceGeneration: frame.sourceGeneration,
          observerSteps: state.cymaticObserverBakeResult?.stepCount ?? 0,
          observerBaked,
        };
        if (completionSampler) {
          completionSampler.observe(
            record,
            {
              startedAtMs: started,
              submittedAtMs: submitted,
              availableAtContextSeconds:
                startTime + renderedObservation.renderedAvailabilityTimeSeconds,
              responseAtContextSeconds:
                startTime + renderedObservation.renderedSourceTimeSeconds,
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
              startTime -
              renderedObservation.renderedAvailabilityTimeSeconds,
            submissionAndCompletionMs: performance.now() - started,
            gpuMs: gpuTiming.elapsedMs,
            gpuTiming,
            completionAgeSeconds:
              context.currentTime -
              startTime -
              renderedObservation.renderedAvailabilityTimeSeconds,
          });
        }
        maximumActiveModes = Math.max(
          maximumActiveModes,
          frame.activeModeCount,
        );
        renderRecords.push(record);
        while (
          snapshots.length < snapshotTimes.length &&
          snapshotTimes[snapshots.length] <= observationTime
        ) {
          const started = performance.now();
          const image = renderer.domElement.toDataURL("image/png");
          snapshots.push({
            requestedTimeSeconds: snapshotTimes[snapshots.length],
            sourceTimeSeconds: renderedObservation.renderedSourceTimeSeconds,
            captureMs: performance.now() - started,
            image,
          });
        }
        lastFrame = frame.frameId;
        lastTime = observationTime;
      } else if (
        !asynchronous &&
        snapshotTimes.length > 0 &&
        frame &&
        frame.renderAuthority !== true &&
        frame.sourceGeneration === status.sourceGeneration &&
        frame.sourceGeneration === measuredGeneration &&
        typeof observationTime === "number"
      ) {
        // Snapshot qualification must draw the historical owner's revoked
        // field too. Keeping the last active pixels would fabricate a tail.
        // The source clock only schedules the readback; it never advances an
        // acoustic observation or fabricates authority for an idle image.
        if (frame.frameId !== lastFrame) {
          tickRaymarch(
            state,
            frame,
            observationTime,
            Math.max(0, observationTime - lastTime),
            renderer,
          );
          renderer.render(scene, camera);
          await resolveGpuProbeTiming(renderer);
          lastFrame = frame.frameId;
          lastTime = observationTime;
        }
        captureInactiveSnapshots();
        await new Promise(requestAnimationFrame);
      } else if (!asynchronous) await new Promise(requestAnimationFrame);
    }
    await submissionGate?.drain();
    await completionSampler?.drain();
    if (
      !measureWeakResponse &&
      (maximumActiveModes === 0 || renderRecords.length < 10)
    )
      throw new Error(
        "baseline did not render sufficient authoritative active frames",
      );
    if (measureWeakResponse && (captures < 10 || lastFrame < 0))
      throw new Error("baseline control has no measured source evidence");
    return {
      weakResponseMeasurement: measureWeakResponse,
      unseededFrames,
      renderRecords,
      asynchronous,
      presentation,
      completionSampling: completionSampler?.read() ?? null,
      snapshots,
      captures,
      structuralCaptures,
      maximumActiveModes,
      runtimeStatus: runtime.getStatus(),
      dimensions: { width, height },
      boundaryMode,
      spectral,
      channelCount: channels.length,
      cavityAcousticScale,
      tailFrames,
      image: renderer.domElement.toDataURL("image/png"),
      scope: `${channels.length}-channel source through existing mono analyser/worker/descriptor/upload/field/observer/optics, ${cavityAcousticScale.incidentPeakPressurePascalAtFullScale > 0 ? "nonlinear" : "linear"} drive, fixed camera, ${spectral ? "production spectral color" : "fixed material color"}, no bloom. ${asynchronous ? "Animation-frame scheduling with sampled queue completion; no GPU elapsed timing." : "Synchronized GPU timing."} GPU completion is not physical display presentation.`,
    };
  } finally {
    runtime?.dispose();
    try {
      try {
        await submissionGate?.drain();
      } finally {
        await completionSampler?.drain();
      }
    } finally {
      if (context && context.state !== "closed") await context.close();
      disposeRaymarch(state);
      restoreGpuTiming();
      renderer.dispose();
      renderer.domElement.remove();
    }
  }
}
