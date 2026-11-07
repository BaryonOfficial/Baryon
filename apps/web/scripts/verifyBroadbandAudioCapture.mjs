import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, platform, arch } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const files = [
  "core/audio/audioPcmCapture.js",
  "core/audio/audioPcmCapture.worklet.js",
  "core/audio/audioPcmStream.js",
  "utils/audio/broadbandAudioState.js",
  "utils/audio/broadbandModalResponse.js",
  "utils/audio/broadbandResponseSpectrum.js",
  "utils/audio/spectralPhase.js",
  "utils/audio/modalResponseMoments.js",
  "utils/audio/streamingAcousticDrive.js",
  "utils/audio/waterAcousticNonlinearity.js",
  "core/audio/fft.js",
  "core/audio/fftSpectrum.js",
  "defaults.js",
  "core/audio/liveInputAnalysis.js",
  "core/audio/inputDeviceSemantics.js",
  "core/cavityGeometry.js",
  "core/volumeShape.js",
  "render/outputProfilePolicy.js",
  "core/raymarch/stepStability.js",
  "utils/math.js",
  "testing/streamingAcousticReference.js",
  "testing/broadbandModalReference.js",
  "testing/broadbandCaptureProbe.worker.js",
];
const served = new Map(
  await Promise.all(
    files.map(async (name) => [
      `/${name}`,
      await readFile(path.join(root, "packages/engine/src", name), "utf8"),
    ]),
  ),
);
const server = createServer((request, response) => {
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Baryon continuous PCM probe</title>");
  } else if (served.has(request.url)) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(served.get(request.url));
  } else {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async () => {
    const { createAudioPcmCapture } =
      await import("/core/audio/audioPcmCapture.js");
    const { createBroadbandReference } =
      await import("/testing/broadbandModalReference.js");
    const { referenceStreamingAcousticDrive } =
      await import("/testing/streamingAcousticReference.js");
    const { createBroadbandAudioState } =
      await import("/utils/audio/broadbandAudioState.js");
    const { iterateAudioPcmBlocks } =
      await import("/core/audio/audioPcmStream.js");
    const { CAVITY_ACOUSTIC_DEFAULTS } = await import("/defaults.js");
    const digest = async (bytes) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    // A real IEEE-float WAV container exercises decodeAudioData's resampler.
    // Both adapters subsequently receive that decoder's complete PCM output;
    // this tests the post-resampling boundary, not an ideal resampling filter.
    function encodeWave(channels, sampleRate) {
      const channelCount = channels.length;
      const frames = channels[0].length;
      const bytes = new ArrayBuffer(44 + frames * channelCount * 4);
      const view = new DataView(bytes);
      const text = (offset, value) => {
        for (let i = 0; i < value.length; i++)
          view.setUint8(offset + i, value.charCodeAt(i));
      };
      text(0, "RIFF");
      view.setUint32(4, bytes.byteLength - 8, true);
      text(8, "WAVE");
      text(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 3, true);
      view.setUint16(22, channelCount, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channelCount * 4, true);
      view.setUint16(32, channelCount * 4, true);
      view.setUint16(34, 32, true);
      text(36, "data");
      view.setUint32(40, bytes.byteLength - 44, true);
      for (let n = 0; n < frames; n++)
        for (let a = 0; a < channelCount; a++)
          view.setFloat32(
            44 + (n * channelCount + a) * 4,
            channels[a][n],
            true,
          );
      return bytes;
    }
    const results = [];
    for (const scenario of [
      { name: "offline-mono", channels: 1, offline: true, length: 4099 },
      { name: "offline-stereo", channels: 2, offline: true, length: 8195 },
      { name: "realtime-stereo", channels: 2, length: 24003 },
      { name: "realtime-44100", channels: 2, length: 22053, sampleRate: 44100 },
      { name: "nonlinear-stereo", channels: 2, length: 8195, nonlinear: true },
      {
        name: "nonlinear-stereo-44100",
        channels: 2,
        length: 8195,
        sampleRate: 44100,
        nonlinear: true,
      },
      {
        name: "decoded-mono-44100-to-48000",
        channels: 1,
        length: 8195,
        encodedSampleRate: 44100,
        sampleRate: 48000,
      },
      {
        name: "decoded-stereo-48000-to-44100",
        channels: 2,
        length: 8195,
        encodedSampleRate: 48000,
        sampleRate: 44100,
      },
      {
        name: "decoded-nonlinear-stereo-44100-to-48000",
        channels: 2,
        length: 8195,
        encodedSampleRate: 44100,
        sampleRate: 48000,
        nonlinear: true,
      },
      {
        name: "decoded-nonlinear-stereo-48000-to-44100",
        channels: 2,
        length: 8195,
        encodedSampleRate: 48000,
        sampleRate: 44100,
        nonlinear: true,
      },
      {
        name: "realtime-pause-resume",
        channels: 2,
        length: 48000,
        pause: true,
      },
      {
        name: "realtime-immediate-pause-resume",
        channels: 2,
        length: 24000,
        pause: true,
        immediatePause: true,
      },
      { name: "realtime-overrun", channels: 1, length: 48000, overrun: true },
    ]) {
      const sampleRate = scenario.sampleRate ?? 48000;
      const tailFrames = scenario.offline ? 0 : 4096;
      const cavityAcousticScale = scenario.nonlinear
        ? CAVITY_ACOUSTIC_DEFAULTS
        : {
            ...CAVITY_ACOUSTIC_DEFAULTS,
            incidentPeakPressurePascalAtFullScale: 0,
          };
      const context = scenario.offline
        ? new OfflineAudioContext(1, scenario.length + 1024, sampleRate)
        : new AudioContext({ sampleRate });
      let buffer = context.createBuffer(
        scenario.channels,
        scenario.length,
        scenario.encodedSampleRate ?? sampleRate,
      );
      for (let channel = 0; channel < scenario.channels; channel++) {
        const values = buffer.getChannelData(channel);
        for (let n = 0; n < values.length; n++)
          values[n] =
            ((channel ? -1 : 1) *
              (((n * (17 + (scenario.encodedSampleRate ? 14 * channel : 0))) %
                257) -
                128)) /
            512;
      }
      let encodedSha256 = null;
      if (scenario.encodedSampleRate) {
        const encoded = encodeWave(
          Array.from({ length: scenario.channels }, (_, a) =>
            buffer.getChannelData(a),
          ),
          scenario.encodedSampleRate,
        );
        encodedSha256 = await digest(encoded);
        buffer = await context.decodeAudioData(encoded);
      }
      const length = buffer.length;
      const expected = Array.from({ length: scenario.channels }, (_, a) =>
        buffer.getChannelData(a),
      );
      const source = context.createBufferSource();
      source.buffer = buffer;
      const configuration = {
        sourceGeneration: 1,
        timelineRevision: 0,
        processingRevision: 0,
        channelCount: scenario.channels,
        sampleRate,
        startSample: 0,
      };
      const shells = [
        { naturalFrequencyHz: 118.4, qualityFactor: 15 },
        { naturalFrequencyHz: 237.1, qualityFactor: 30 },
      ];
      const worker = new Worker("/testing/broadbandCaptureProbe.worker.js", {
        type: "module",
      });
      const loans = new Map();
      const events = [];
      const packets = [];
      let startFrame = 0;
      let sourceEnded = false;
      let maximumError = 0;
      let maximumDeliveryAgeSeconds = 0;
      let resolveDone;
      let rejectDone;
      const done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });
      const timeout = setTimeout(
        () => rejectDone(new Error(`${scenario.name}: timeout`)),
        10000,
      );
      let capture;
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("worker initialization timeout")),
            5000,
          );
          worker.onmessage = ({ data }) => {
            clearTimeout(timer);
            if (data.type === "ready") resolve();
            else reject(new Error(data.reason));
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
          });
        });
        worker.onerror = (event) => rejectDone(new Error(event.message));
        worker.onmessage = ({ data }) => {
          if (data.type === "error") rejectDone(new Error(data.reason));
          else if (data.type === "observation") resolveDone(data.observation);
          else if (data.type === "consumed") {
            if (!data.accepted.accepted)
              rejectDone(new Error(`admission: ${data.accepted.reason}`));
            const release = loans.get(data.sequence);
            loans.delete(data.sequence);
            if (!release) rejectDone(new Error("unknown worker buffer return"));
            else if (!scenario.overrun) release(data.buffers);
          }
        };
        capture = await createAudioPcmCapture({
          context,
          source,
          configuration,
          initialInterval: scenario.offline
            ? {
                startFrame: 257,
                endFrame: 257 + length,
                pauseFrame: 257 + length,
              }
            : undefined,
          onBlock(packet, release) {
            const offset = packet.contextFrame - startFrame;
            for (let channel = 0; channel < scenario.channels; channel++) {
              for (let n = 0; n < packet.frameCount; n++)
                maximumError = Math.max(
                  maximumError,
                  Math.abs(
                    packet.channels[channel][n] -
                      (expected[channel][offset + n] ?? 0),
                  ),
                );
            }
            packets.push({
              startSample: packet.startSample,
              contextFrame: packet.contextFrame,
              frameCount: packet.frameCount,
              sequence: packet.sequence,
              postSourceSilence: packet.postSourceSilence,
            });
            maximumDeliveryAgeSeconds = Math.max(
              maximumDeliveryAgeSeconds,
              context.currentTime -
                (packet.contextFrame + packet.frameCount) / sampleRate,
            );
            loans.set(packet.sequence, release);
            worker.postMessage({ type: "pcm", packet }, packet.buffers);
            if (scenario.immediatePause && packet.sequence === 1)
              capture.pause();
          },
          onEvent(event) {
            events.push(event.type);
            if (event.type === "fault") {
              if (scenario.overrun && event.reason === "pool-exhausted") {
                worker.postMessage({ type: "fault", reason: event.reason });
                worker.postMessage({ type: "read" });
              } else rejectDone(new Error(`${scenario.name}: ${event.reason}`));
            } else if (event.type === "paused") {
              worker.postMessage({ type: "paused" });
              if (sourceEnded) {
                worker.postMessage({ type: "read" });
                return;
              }
              capture.resume(
                scenario.immediatePause
                  ? {}
                  : {
                      contextFrame: Math.ceil(
                        (context.currentTime + 0.04) * sampleRate,
                      ),
                      startSample: event.startSample,
                    },
              );
            } else if (event.type === "resumed") {
              worker.postMessage({
                type: "resumed",
                startSample: event.startSample,
                nextSequence: event.nextSequence,
              });
              capture.end({ contextFrame: startFrame + length });
              capture.pause({
                contextFrame: startFrame + length + tailFrames,
              });
            } else if (event.type === "ended") {
              sourceEnded = true;
              worker.postMessage(event);
            }
          },
        });
        startFrame = scenario.offline
          ? 257
          : Math.ceil((context.currentTime + 0.08) * sampleRate);
        if (!scenario.offline) {
          capture.start({ contextFrame: startFrame });
          if (scenario.pause) {
            if (!scenario.immediatePause)
              capture.pause({ contextFrame: startFrame + 777 });
          } else {
            capture.end({ contextFrame: startFrame + length });
            capture.pause({
              contextFrame: startFrame + length + tailFrames,
            });
          }
        }
        source.start(startFrame / sampleRate);
        let outputMaximum = null;
        if (scenario.offline) {
          const rendered = await context.startRendering();
          outputMaximum = rendered
            .getChannelData(0)
            .reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
        } else await context.resume();
        const observation = await done;
        const responseErrors = {};
        let fileAdapterParity = null;
        if (!scenario.overrun) {
          // Independently prepare exactly the captured source intervals, then
          // refine the direct RK4 oracle. Never use the candidate worker to
          // generate its own expected pressure, velocity or moments.
          const captured = expected.map((channel) => {
            const values = new Float64Array(observation.processedFrames);
            let cursor = 0;
            for (const packet of packets) {
              const offset = packet.contextFrame - startFrame;
              for (let n = 0; n < packet.frameCount; n++) {
                values[cursor++] = channel[offset + n] ?? 0;
              }
            }
            return values;
          });
          const { prepared } = referenceStreamingAcousticDrive(captured, {
            sampleRate,
            cavityAcousticScale,
          });
          const oracles = [8, 16, 32].map((substeps) => {
            const oracle = createBroadbandReference({
              shells,
              sampleRate,
              channelCount: scenario.channels,
              substeps,
            });
            oracle.advance(
              prepared.map((c) =>
                c.subarray(0, observation.response.sampleIndex),
              ),
            );
            return oracle.read();
          });
          const relativeError = (a, b) => {
            let difference = 0,
              energy = 0;
            for (let i = 0; i < a.length; i++) {
              difference += (a[i] - b[i]) ** 2;
              energy += b[i] ** 2;
            }
            return Math.sqrt(difference / Math.max(energy, 1e-30));
          };
          for (const key of [
            "pressure",
            "velocity",
            "pressureMoments",
            "velocityMoments",
          ]) {
            responseErrors[key] = {
              relativeRms: relativeError(
                observation.response[key],
                oracles[2][key],
              ),
              refinements: [
                relativeError(oracles[0][key], oracles[1][key]),
                relativeError(oracles[1][key], oracles[2][key]),
              ],
            };
          }
          if (scenario.encodedSampleRate) {
            const fileState = createBroadbandAudioState({
              configuration,
              shells,
              cavityAcousticScale,
            });
            // Deliberately different block boundaries from the 512-frame tap.
            const acceptFile = (packet) => {
              const result = fileState.accept(packet);
              if (!result.accepted)
                throw new Error(`file adapter: ${result.reason}`);
            };
            for (const packet of iterateAudioPcmBlocks(
              expected,
              configuration,
              73,
            ))
              acceptFile(packet);
            const status = fileState.read();
            const end = fileState.end({
              ...configuration,
              startSample: length,
              nextSequence: status.nextSequence,
            });
            if (!end.accepted) throw new Error(`file end: ${end.reason}`);
            for (const packet of iterateAudioPcmBlocks(
              expected.map(() => new Float32Array(tailFrames)),
              {
                ...configuration,
                startSample: length,
                nextSequence: status.nextSequence,
              },
              137,
            ))
              acceptFile({ ...packet, postSourceSilence: true });
            fileState.pause();
            const file = fileState.read();
            const metrics = {};
            for (const key of [
              "pressure",
              "velocity",
              "pressureMoments",
              "velocityMoments",
            ])
              metrics[key] = relativeError(
                observation.response[key],
                file.response[key],
              );
            for (const key of ["inputSpectrum", "boundaryDelta"])
              metrics[`spectral.${key}`] = relativeError(
                observation.response.spectral[key],
                file.response.spectral[key],
              );
            fileAdapterParity = {
              metrics,
              processedFrames: file.processedFrames,
              preparedFrames: file.response.sampleIndex,
              spectralFrameEndSample: file.response.spectral.frameEndSample,
              capturedSpectralFrameEndSample:
                observation.response.spectral.frameEndSample,
              phase: file.phase,
            };
          }
        }
        results.push({
          ...scenario,
          length,
          encodedFrames: scenario.encodedSampleRate ? scenario.length : null,
          encodedSha256,
          decodedSampleRate: buffer.sampleRate,
          decodedChannelCount: buffer.numberOfChannels,
          fileAdapterParity,
          tailFrames,
          pcmSha256: await Promise.all(expected.map(digest)),
          actualSampleRate: context.sampleRate,
          maximumError,
          outputMaximum,
          maximumDeliveryAgeSeconds,
          events,
          packets: packets.length,
          processedFrames: observation.processedFrames,
          sourceFrames: observation.sourceFrames,
          postSourceFrames: observation.postSourceFrames,
          preparedFrames: observation.response?.sampleIndex ?? null,
          preparation: observation.preparation,
          skippedContextFrames: packets.reduce(
            (total, packet, i) =>
              i === 0
                ? total
                : total +
                  packet.contextFrame -
                  packets[i - 1].contextFrame -
                  packets[i - 1].frameCount,
            0,
          ),
          responseRevoked: observation.response === null,
          responseErrors,
          referenceSubsteps: scenario.overrun ? [] : [8, 16, 32],
          finalPacket: packets.at(-1),
          capture: capture.read(),
        });
      } finally {
        clearTimeout(timeout);
        capture?.dispose();
        worker.terminate();
        if (!scenario.offline) await context.close();
      }
    }
    return results;
  });
  let validationError = null;
  try {
    for (const result of results) {
      assert(Number.isFinite(result.maximumError));
      assert(result.maximumError <= 1e-6, `${result.name}: PCM mismatch`);
      assert.equal(result.actualSampleRate, result.sampleRate ?? 48000);
      assert.equal(result.decodedSampleRate, result.actualSampleRate);
      assert.equal(result.decodedChannelCount, result.channels);
      if (result.encodedSampleRate) {
        assert.ok(
          Math.abs(
            result.length -
              (result.encodedFrames * result.actualSampleRate) /
                result.encodedSampleRate,
          ) <= 1,
          `${result.name}: decoded duration`,
        );
        assert.match(result.encodedSha256, /^[0-9a-f]{64}$/);
        const parity = result.fileAdapterParity;
        assert.equal(parity.processedFrames, result.processedFrames);
        assert.equal(parity.preparedFrames, result.preparedFrames);
        assert.equal(
          parity.spectralFrameEndSample,
          parity.capturedSpectralFrameEndSample,
        );
        assert.equal(parity.phase, "paused");
        for (const [quantity, value] of Object.entries(parity.metrics))
          assert.ok(
            value < 1e-6,
            `${result.name}: file/capture ${quantity} ${value}`,
          );
      }
      if (result.offline) assert.equal(result.outputMaximum, 0);
      if (result.overrun) {
        assert.equal(result.responseRevoked, true);
        // 500 ms of return-stall headroom plus the packet being filled.
        assert.equal(result.processedFrames, 48 * 512);
        assert.deepEqual(result.events, ["started", "fault"]);
      } else if (result.pause) {
        assert.deepEqual(result.events, [
          "started",
          "paused",
          "resumed",
          "ended",
          "paused",
        ]);
        assert(result.sourceFrames <= result.length);
        assert(result.sourceFrames > 777);
        assert.equal(
          result.sourceFrames + result.skippedContextFrames,
          result.length,
        );
      } else {
        assert.equal(result.sourceFrames, result.length);
        assert.deepEqual(result.events, ["started", "ended", "paused"]);
      }
      if (!result.overrun) {
        assert.equal(result.responseRevoked, false);
        assert.equal(result.postSourceFrames, result.tailFrames);
        assert.equal(
          result.preparedFrames,
          result.processedFrames - (result.nonlinear ? 2048 : 0),
        );
        assert.equal(result.preparation.phase, "running");
        assert.equal(
          result.preparation.pendingFrames,
          result.nonlinear ? 2048 : 0,
        );
        assert.equal(
          result.preparation.delayFrames,
          result.nonlinear ? 2048 : 0,
        );
        for (const [quantity, evidence] of Object.entries(
          result.responseErrors,
        )) {
          assert(evidence.relativeRms < 1e-6, `${result.name}: ${quantity}`);
          assert(
            evidence.refinements.every((value) => value < 1e-8),
            `${result.name}: unconverged ${quantity}: ${JSON.stringify(evidence)}`,
          );
        }
      }
    }
  } catch (error) {
    validationError = error;
  }
  const report = {
    timestamp: new Date().toISOString(),
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    browser: await browser.version(),
    machine: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    sourceHashes: Object.fromEntries(
      [...served].map(([name, content]) => [
        name,
        createHash("sha256").update(content).digest("hex"),
      ]),
    ),
    harnessSha256: createHash("sha256")
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest("hex"),
    scope:
      "Isolated AudioWorklet -> transferred PCM -> worker admission/DC/response/moments versus independent refined reference. Includes real WAV decode/resampling and post-decoder file-block/capture parity, not microphone/device resampling or production session routing. No GPU, callback deadline, native display or sound-to-visible acceptance.",
    passed: validationError === null,
    validationError: validationError?.message ?? null,
    results,
  };
  if (process.argv[2]) {
    const output = path.resolve(process.argv[2]);
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "broadband-capture-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report, null, 2));
  if (validationError) throw validationError;
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
