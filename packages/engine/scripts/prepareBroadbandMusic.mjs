import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createFftPlan, executeFft } from "../src/core/audio/fft.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = path.resolve(process.argv[2] ?? "/tmp/baryon-music-corpus");
const manifestPath = path.join(
  root,
  "docs/internal/reference/broadband-music-corpus.json",
);
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sampleRate = 48000,
  channelCount = 2,
  commonGain = 0.5;
const preparedDirectory = path.join(directory, "prepared");
await mkdir(preparedDirectory, { recursive: true });

function channelsOf(bytes) {
  assert.equal(bytes.length % 8, 0, "stereo Float32 PCM alignment");
  const frames = bytes.length / 8;
  return Array.from({ length: channelCount }, (_, a) =>
    Float32Array.from({ length: frames }, (_, n) =>
      bytes.readFloatLE(8 * n + 4 * a),
    ),
  );
}
function measurements(channels) {
  const frames = channels[0].length;
  const sums = [0, 0],
    squares = [0, 0],
    peaks = [0, 0];
  let cross = 0;
  for (let n = 0; n < frames; n++) {
    for (let a = 0; a < 2; a++) {
      const value = channels[a][n];
      assert.ok(Number.isFinite(value), "nonfinite decoded PCM");
      sums[a] += value;
      squares[a] += value * value;
      peaks[a] = Math.max(peaks[a], Math.abs(value));
    }
    cross += channels[0][n] * channels[1][n];
  }
  assert.ok(
    squares.every((x) => x > 0),
    "silent corpus channel",
  );
  assert.ok(
    peaks.every((x) => x < 1),
    "common gain leaves insufficient headroom",
  );
  // Diagnostic only: mean-channel, one-sided window power in three bands.
  // This neither equalizes source levels nor influences the engine's forcing.
  const size = 2048,
    hop = 1024;
  const fft = createFftPlan(size);
  const window = Float64Array.from(
    { length: size },
    (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size),
  );
  const windowPower = window.reduce((sum, x) => sum + x * x, 0);
  const bandPower = {
    bass20To200Hz: 0,
    mid200To2000Hz: 0,
    treble2000To24000Hz: 0,
  };
  let windows = 0;
  for (let start = 0; start + size <= frames; start += hop) {
    for (const channel of channels) {
      for (let n = 0; n < size; n++)
        fft.real[n] = channel[start + n] * window[n];
      fft.imaginary.fill(0);
      executeFft(fft);
      for (let bin = 1; bin <= size / 2; bin++) {
        const frequency = (bin * sampleRate) / size;
        if (frequency < 20) continue;
        const band =
          frequency < 200
            ? "bass20To200Hz"
            : frequency < 2000
              ? "mid200To2000Hz"
              : "treble2000To24000Hz";
        bandPower[band] +=
          ((bin === size / 2 ? 1 : 2) *
            (fft.real[bin] ** 2 + fft.imaginary[bin] ** 2)) /
          (size * windowPower);
      }
      windows++;
    }
  }
  for (const band of Object.keys(bandPower)) bandPower[band] /= windows;
  return {
    peak: peaks,
    mean: sums.map((x) => x / frames),
    rms: squares.map((x) => Math.sqrt(x / frames)),
    channelCorrelation: cross / Math.sqrt(squares[0] * squares[1]),
    bandPower,
    bandMeasurement: {
      window: "periodic Hann",
      size,
      hop,
      channelWindows: windows,
    },
  };
}
async function record(id, bytes, metadata) {
  const channels = channelsOf(bytes);
  const relativePath = `prepared/${id}.f32le`;
  await writeFile(path.join(directory, relativePath), bytes);
  // A listening artifact shares exactly the test PCM; it is not a separate
  // decode, normalization or source selection.
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(sampleRate),
    "-ac",
    "2",
    "-i",
    path.join(directory, relativePath),
    "-c:a",
    "pcm_f32le",
    path.join(preparedDirectory, `${id}.wav`),
  ]);
  return {
    id,
    ...metadata,
    sampleRate,
    channelCount,
    frameCount: channels[0].length,
    durationSeconds: channels[0].length / sampleRate,
    relativePath,
    pcmSha256: hash(bytes),
    listeningRelativePath: `prepared/${id}.wav`,
    measurements: measurements(channels),
  };
}

const entries = [];
for (const track of manifest.tracks) {
  const source = path.resolve(directory, track.originalRelativePath);
  assert.ok(
    source.startsWith(directory + path.sep),
    "source escapes corpus directory",
  );
  const original = await readFile(source);
  assert.equal(hash(original), track.sha256, `source changed: ${track.title}`);
  const { startSeconds, durationSeconds } = track.excerpt;
  const bytes = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      source,
      "-af",
      `atrim=start=${startSeconds}:duration=${durationSeconds},asetpts=PTS-STARTPTS,aresample=${sampleRate},volume=${commonGain}`,
      "-ac",
      "2",
      "-f",
      "f32le",
      "-",
    ],
    { maxBuffer: 64 * 1024 ** 2 },
  );
  assert.equal(
    bytes.length,
    durationSeconds * sampleRate * 8,
    `excerpt duration: ${track.title}`,
  );
  entries.push(
    await record(track.id, bytes, {
      kind: "excerpt",
      title: track.title,
      sourceIds: [track.id],
      sourceExcerpt: track.excerpt,
    }),
  );
  process.stdout.write(`prepared ${track.title}\n`);
}
for (const [id, leftId, rightId] of [
  ["transition-edm-trance", "USUAN1500026", "USUAN1100273"],
  ["transition-dance-cipher", "USUAN1100374", "USUAN1100844"],
]) {
  const left = entries.find((e) => e.id === leftId);
  const right = entries.find((e) => e.id === rightId);
  const a = channelsOf(await readFile(path.join(directory, left.relativePath)));
  const b = channelsOf(
    await readFile(path.join(directory, right.relativePath)),
  );
  const overlapFrames = 30 * sampleRate;
  const startRight = a[0].length - overlapFrames;
  const frameCount = startRight + b[0].length;
  const bytes = Buffer.alloc(frameCount * 8);
  for (let n = 0; n < frameCount; n++) {
    const blend = (n - startRight) / (overlapFrames - 1);
    for (let channel = 0; channel < 2; channel++) {
      const value =
        n < startRight
          ? a[channel][n]
          : n >= a[0].length
            ? b[channel][n - startRight]
            : Math.cos((blend * Math.PI) / 2) * a[channel][n] +
              Math.sin((blend * Math.PI) / 2) * b[channel][n - startRight];
      bytes.writeFloatLE(value, 8 * n + 4 * channel);
    }
  }
  assert.equal(frameCount, 60 * sampleRate);
  // Entire pre/post transition intervals must be the unchanged source PCM.
  for (const channel of [0, 1]) {
    assert.equal(bytes.readFloatLE(4 * channel), a[channel][0]);
    assert.equal(
      bytes.readFloatLE(8 * (frameCount - 1) + 4 * channel),
      b[channel].at(-1),
    );
  }
  entries.push(
    await record(id, bytes, {
      kind: "transition",
      title: `${left.title} → ${right.title}`,
      sourceIds: [leftId, rightId],
      transition: {
        startSeconds: 15,
        endSeconds: 45,
        curve: "equal-power cosine/sine",
        beatMatched: false,
        sourcePlaybackRate: 1,
      },
    }),
  );
  process.stdout.write(`prepared ${id}\n`);
}
const report = {
  createdAt: new Date().toISOString(),
  schemaVersion: 1,
  manifestSha256: hash(manifestBytes),
  builderSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  diagnosticFftSha256: hash(
    await readFile(path.join(root, "packages/engine/src/core/audio/fft.js")),
  ),
  ffmpegVersion: execFileSync("ffmpeg", ["-version"], {
    encoding: "utf8",
  }).split("\n")[0],
  sampleRate,
  channelCount,
  commonGain,
  sampleFormat: "interleaved IEEE Float32 little-endian",
  entries,
  status:
    "Prepared and numerically inspected; engine response and musical acceptance unverified",
  limitations: [
    "One catalog",
    "Metadata-based genre selection; no listening review claimed",
    "Constructed crossfades, not a recorded DJ performance or beat-matched transition test",
  ],
};
await writeFile(
  path.join(directory, "prepared-corpus.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const attribution = manifest.tracks
  .map(
    (t) =>
      `"${t.title}" — ${t.artist} (incompetech.com)\n${t.additionalCredits ? t.additionalCredits + "\n" : ""}Licensed under Creative Commons Attribution 4.0: ${t.licenseUrl}\nSource: ${t.downloadUrl}\nChanges: excerpt selection, resampling to 48 kHz, common 0.5 gain; selected tracks also used in equal-power crossfades.\n`,
  )
  .join("\n");
await writeFile(path.join(directory, "ATTRIBUTION.txt"), attribution);
process.stdout.write(`prepared ${entries.length} fixtures: ${directory}\n`);
