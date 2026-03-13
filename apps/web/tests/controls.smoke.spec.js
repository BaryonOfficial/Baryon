import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

function createMonoWavBuffer({
  sampleRate = 44100,
  durationSeconds = 1,
  frequency = 220,
  amplitude = 0.45,
} = {}) {
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const channelCount = 1;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  const writeAscii = (offset, value) => {
    bytes.set(encoder.encode(value), offset);
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < frameCount; index += 1) {
    const sample =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
    const pcm = Math.max(-1, Math.min(1, sample)) * 0x7fff;
    view.setInt16(44 + index * bytesPerSample, Math.round(pcm), true);
  }

  return Buffer.from(buffer);
}

async function waitForControlSurface(page) {
  await page.waitForFunction(() => {
    return window.__baryonTestReady === true;
  });
}

async function installFakeMicrophone(page) {
  await page.addInitScript(() => {
    function createFakeMicStream() {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const destination = audioContext.createMediaStreamDestination();

      oscillator.type = "sine";
      oscillator.frequency.value = 440;
      gain.gain.value = 0.25;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();

      const originalTracks = destination.stream.getAudioTracks();
      const wrappedStream = new MediaStream(originalTracks);
      for (const track of wrappedStream.getAudioTracks()) {
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          originalStop();
          try {
            oscillator.stop();
          } catch (error) {
            if (error?.name !== "InvalidStateError") {
              throw error;
            }
          }
          audioContext.close().catch(() => {});
        };
      }

      audioContext.resume().catch(() => {});
      return wrappedStream;
    }

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {},
      });
    }
    const { mediaDevices } = navigator;

    mediaDevices.getUserMedia = async () => createFakeMicStream();
    mediaDevices.enumerateDevices = async () => [
      {
        kind: "audioinput",
        deviceId: "fake-mic-device",
        label: "Fake Microphone",
        groupId: "fake-group",
      },
    ];
    mediaDevices.addEventListener ??= () => {};
    mediaDevices.removeEventListener ??= () => {};
  });
}

async function setControl(page, key, value) {
  await page.evaluate(
    ([controlKey, controlValue]) => {
      window.__baryonControls.setControl(controlKey, controlValue);
    },
    [key, value],
  );
}

async function readTimelineValue(page) {
  return page.getByTestId("playback-timeline").evaluate((input) => {
    return Number(input.value);
  });
}

test.describe("Baryon control smoke", () => {
  test("updates critical runtime values through the live control surface", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await expect
      .poll(() =>
        page.evaluate(() => window.__baryonControlState?.method ?? null),
      )
      .toBe("raymarch");

    await setControl(page, "auditEnabled", true);
    await expect(page.getByTestId("raymarch-debug-overlay")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          avgOpacity:
            window.__baryonAuditSnapshot?.raymarchDebug?.avgOpacity ?? null,
          avgDensity:
            window.__baryonAuditSnapshot?.raymarchDebug?.avgDensity ?? null,
          stepBudget:
            window.__baryonAuditSnapshot?.raymarchDebug?.stepBudget ?? null,
        })),
      )
      .toEqual({
        fieldState: expect.any(String),
        avgOpacity: expect.any(Number),
        avgDensity: expect.any(Number),
        stepBudget: expect.any(Number),
      });

    await setControl(page, "injectTestTone", true);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          pitchSource: window.__baryonAuditSnapshot?.pitchSource ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        fieldState: "test",
        pitchSource: "test",
        modeSlotCount: expect.any(Number),
        volumeVisible: true,
      });

    await setControl(page, "bloomStrength", 0.91);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.bloom?.strength ?? null,
        ),
      )
      .toBe(0.91);

    await setControl(page, "idleLogoSize", 1.37);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonControlState?.raymarch?.uniforms?.idleLogoSize ??
            null,
        ),
      )
      .toBe(1.37);

    await setControl(page, "zeroPointPrecision", 0.042);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonControlState?.raymarch?.uniforms?.threshold ?? null,
        ),
      )
      .toBeCloseTo(0.042, 6);

    await setControl(page, "densityGain", 2.15);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonControlState?.raymarch?.uniforms?.densityGain ??
            null,
        ),
      )
      .toBe(2.15);

    await setControl(page, "injectTestTone", false);
  });

  test("forces the WebGL2 fallback backend through the audit controls", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Fallback smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    const hasWebGL2 = await page.evaluate(
      () => !!document.createElement("canvas").getContext("webgl2"),
    );
    test.skip(!hasWebGL2, "Headless browser does not expose WebGL2 fallback");

    await setControl(page, "auditEnabled", true);
    await setControl(page, "forceWebGLFallbackTest", true);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          forced: window.__baryonRendererInfo?.forceWebGLFallbackTest ?? false,
          isFallback: window.__baryonRendererInfo?.isFallback ?? false,
          backend: window.__baryonRendererInfo?.backend ?? null,
          error: window.__baryonRendererInfo?.error ?? null,
        })),
      )
      .toEqual({
        forced: true,
        isFallback: true,
        backend: expect.any(String),
        error: null,
      });

    await setControl(page, "injectTestTone", true);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
          rendererFallback:
            window.__baryonAuditSnapshot?.renderer?.isFallback ?? false,
        })),
      )
      .toEqual({
        fieldState: "test",
        modeSlotCount: expect.any(Number),
        rendererFallback: true,
      });
  });

  test("returns to the idle logo state after mic input is turned off", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeMicrophone(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await page.getByTitle("Select audio input").click();
    await page.getByRole("button", { name: "Fake Microphone" }).click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          micActive: window.__baryonAuditSnapshot?.micActive ?? false,
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
        })),
      )
      .toEqual({
        micActive: true,
        audioInputMode: "mic",
        analysisSourceUsed: "mic",
      });

    await page.getByTitle("Stop mic input").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          micActive: window.__baryonAuditSnapshot?.micActive ?? true,
          visualizationMethod:
            window.__baryonAuditSnapshot?.visualizationMethod ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          idleOverlayVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.idleOverlayVisible ??
            false,
        })),
      )
      .toEqual({
        micActive: false,
        visualizationMethod: "raymarch",
        fieldState: "idle",
        idleOverlayVisible: true,
      });
  });

  test("clears the stale upload label after switching from file playback to mic mode", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeMicrophone(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "resume-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });
    await expect(page.getByTestId("playback-timeline")).toBeVisible();

    await page.locator(".am-btn--play").click();
    await expect(page.locator('.am-btn--play[title="Pause"]')).toBeVisible();

    await page.getByTitle("Select audio input").click();
    await page.getByRole("button", { name: "Fake Microphone" }).click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fileLabel:
            document.querySelector(".am-track")?.textContent?.trim() ?? "",
          playDisabled:
            document.querySelector(".am-btn--play")?.disabled ?? false,
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
        })),
      )
      .toEqual({
        fileLabel: "Upload Audio",
        playDisabled: true,
        audioInputMode: "mic",
      });

    await page.getByTitle("Stop mic input").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fileLabel:
            document.querySelector(".am-track")?.textContent?.trim() ?? "",
          playDisabled:
            document.querySelector(".am-btn--play")?.disabled ?? false,
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
        })),
      )
      .toEqual({
        fileLabel: "Upload Audio",
        playDisabled: true,
        audioInputMode: "idle",
      });
  });

  test("can reload the last uploaded file from recent uploads after mic mode", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeMicrophone(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "recent-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });
    await expect(page.getByTestId("playback-timeline")).toBeVisible();

    await page.locator(".am-btn--play").click();
    await expect(page.locator('.am-btn--play[title="Pause"]')).toBeVisible();

    await page.getByTitle("Select audio input").click();
    await page.getByRole("button", { name: "Fake Microphone" }).click();
    await page.getByTitle("Stop mic input").click();

    await page.getByTitle("Recent uploads").click();
    await expect(page.getByTestId("recent-uploads-panel")).toBeVisible();
    await expect(page.getByText("recent-tone.wav")).toBeVisible();

    await page.getByRole("button", { name: /recent-tone\.wav/i }).click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          playDisabled:
            document.querySelector(".am-btn--play")?.disabled ?? true,
          timelineVisible: Boolean(
            document.querySelector('[data-testid="playback-timeline"]'),
          ),
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
        })),
      )
      .toEqual({
        playDisabled: false,
        timelineVisible: true,
        audioInputMode: "file",
      });
  });

  test("keeps raymarch analysis active when file output volume is zero", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "smoke-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });

    await page.locator(".am-btn--play").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
        })),
      )
      .toEqual({
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
      });

    await page.locator(".am-slider").evaluate((input) => {
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect
      .poll(() =>
        page.evaluate(() => ({
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
          avgDensity:
            window.__baryonAuditSnapshot?.raymarchDebug?.avgDensity ?? 0,
        })),
      )
      .toEqual({
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
        avgDensity: expect.any(Number),
      });
  });

  test("keeps raymarch analysis active when file output is muted", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "smoke-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });

    await page.locator(".am-btn--play").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
        })),
      )
      .toEqual({
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
      });

    await page.locator(".am-btn--volume").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          modeSlotCount:
            window.__baryonAuditSnapshot?.raymarchDebug?.modeSlotCount ?? 0,
          avgDensity:
            window.__baryonAuditSnapshot?.raymarchDebug?.avgDensity ?? 0,
        })),
      )
      .toEqual({
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
        avgDensity: expect.any(Number),
      });
  });

  test("shows a seekable playback timeline for finite file playback", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "timeline-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });

    const timeline = page.getByTestId("playback-timeline");
    await expect(timeline).toBeVisible();
    await expect.poll(() => readTimelineValue(page)).toBe(0);

    await page.locator(".am-btn--play").click();

    await expect.poll(() => readTimelineValue(page)).toBeGreaterThan(0.2);
  });

  test("clicking the playback timeline seeks to a later point", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "seek-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });

    await page.locator(".am-btn--play").click();
    const timeline = page.getByTestId("playback-timeline");
    const box = await timeline.boundingBox();

    if (!box) {
      throw new Error("Playback timeline did not render a bounding box.");
    }

    await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);

    await expect.poll(() => readTimelineValue(page)).toBeGreaterThan(2.5);
  });

  test("drag scrubbing previews while paused and resumes on release", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "drag-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });

    await page.locator(".am-btn--play").click();
    const timeline = page.getByTestId("playback-timeline");
    const box = await timeline.boundingBox();

    if (!box) {
      throw new Error("Playback timeline did not render a bounding box.");
    }

    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
    await page.mouse.down();

    await expect(page.locator('.am-btn--play[title="Play"]')).toBeVisible();

    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, {
      steps: 8,
    });

    await expect.poll(() => readTimelineValue(page)).toBeGreaterThan(2);

    await page.mouse.up();

    await expect(page.locator('.am-btn--play[title="Pause"]')).toBeVisible();
    await expect.poll(() => readTimelineValue(page)).toBeGreaterThan(2);
  });

  test("hides the playback timeline while mic input is active", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeMicrophone(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await page.getByTitle("Select audio input").click();
    await page.getByRole("button", { name: "Fake Microphone" }).click();

    await expect(page.getByTestId("playback-timeline")).toHaveCount(0);
  });
});
