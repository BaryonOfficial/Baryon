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

async function waitForVisualizationMethod(page, method) {
  await expect
    .poll(() =>
      page.evaluate(() => window.__baryonControlState?.method ?? null),
    )
    .toBe(method);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__baryonAuditSnapshot?.visualizationMethod ?? null,
      ),
    )
    .toBe(method);
}

async function readSceneSnapshot(page) {
  return page.evaluate(() => window.__baryonControlState?.scene ?? null);
}

async function readAuditMethodSnapshot(page) {
  return page.evaluate(() => {
    const snapshot = window.__baryonAuditSnapshot ?? null;
    const visualizationMethod = snapshot?.visualizationMethod ?? null;
    const activeDebug =
      visualizationMethod === "cymatics-2d"
        ? (snapshot?.cymatics2dDebug ?? null)
        : (snapshot?.raymarchDebug ?? null);

    return {
      visualizationMethod,
      activeDebug,
      hasRaymarchDebug: Boolean(snapshot?.raymarchDebug),
      hasCymatics2dDebug: Boolean(snapshot?.cymatics2dDebug),
    };
  });
}

async function installFakeLiveInput(page) {
  await page.addInitScript(() => {
    const REDACTED_DEFAULT_AUDIO_INPUT = Object.freeze({
      kind: "audioinput",
      deviceId: "",
      label: "",
      groupId: "fake-group",
    });
    const GRANTED_FAKE_AUDIO_INPUTS = Object.freeze([
      {
        kind: "audioinput",
        deviceId: "fake-live-input-device",
        label: "Fake Live Input",
        groupId: "fake-group",
      },
    ]);
    const fakeMicState = {
      scene: "voice",
      timerId: 0,
      permissionBehavior: "granted",
      permissionGranted: false,
    };

    function setPartialTargets(nodes, targets, timeConstant = 0.015) {
      if (!nodes?.audioContext) {
        return;
      }

      const now = nodes.audioContext.currentTime;
      targets.forEach((target, index) => {
        const gainNode = nodes.partialGains[index];
        if (!gainNode?.gain) {
          return;
        }
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setTargetAtTime(target, now, timeConstant);
      });
    }

    function clearSceneAutomation() {
      if (fakeMicState.timerId) {
        window.clearInterval(fakeMicState.timerId);
        fakeMicState.timerId = 0;
      }
    }

    function applyFakeLiveInputScene(nodes, scene) {
      if (!nodes?.audioContext) {
        return;
      }

      clearSceneAutomation();

      const gainTargets =
        scene === "silent"
          ? [0, 0, 0, 0, 0, 0]
          : scene === "ambient"
            ? [0.12, 0.18, 0.24, 0.16, 0.1, 0.08]
            : [0, 0.45, 0.22, 0.08, 0.03, 0];

      setPartialTargets(nodes, gainTargets);

      if (scene === "voice-flutter") {
        const phases = [
          [0, 0.45, 0.22, 0.08, 0.03, 0],
          [0, 0.08, 0.04, 0.2, 0.05, 0],
          [0, 0.38, 0.18, 0.06, 0.02, 0],
          [0, 0.06, 0.03, 0.18, 0.045, 0],
        ];
        let phaseIndex = 0;
        setPartialTargets(nodes, phases[phaseIndex], 0.012);
        fakeMicState.timerId = window.setInterval(() => {
          phaseIndex = (phaseIndex + 1) % phases.length;
          setPartialTargets(nodes, phases[phaseIndex], 0.02);
        }, 110);
      }
    }

    function createFakeLiveInputStream() {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const destination = audioContext.createMediaStreamDestination();
      const masterGain = audioContext.createGain();
      const partialGains = [110, 190, 380, 760, 1520, 2600].map((frequency) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start();
        return {
          oscillator,
          gain,
        };
      });
      masterGain.connect(destination);

      const nodes = {
        audioContext,
        partialGains: partialGains.map((entry) => entry.gain),
        oscillators: partialGains.map((entry) => entry.oscillator),
      };
      window.__baryonFakeMicNodes = nodes;
      applyFakeLiveInputScene(nodes, fakeMicState.scene);

      const originalTracks = destination.stream.getAudioTracks();
      const wrappedStream = new MediaStream(originalTracks);
      for (const track of wrappedStream.getAudioTracks()) {
        const originalStop = track.stop.bind(track);
        track.stop = () => {
          originalStop();
          clearSceneAutomation();
          for (const oscillator of nodes.oscillators) {
            try {
              oscillator.stop();
            } catch (error) {
              if (error?.name !== "InvalidStateError") {
                throw error;
              }
            }
          }
          window.__baryonFakeMicNodes = null;
          audioContext.close().catch(() => {});
        };
      }

      audioContext.resume().catch(() => {});
      return wrappedStream;
    }

    window.__setFakeLiveInputScene = (scene) => {
      fakeMicState.scene = scene;
      applyFakeLiveInputScene(window.__baryonFakeMicNodes, scene);
    };
    window.__setFakeLiveInputPermission = (behavior) => {
      fakeMicState.permissionBehavior = behavior;
      if (behavior !== "granted") {
        fakeMicState.permissionGranted = false;
      }
    };

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {},
      });
    }
    const { mediaDevices } = navigator;

    mediaDevices.getUserMedia = async () => {
      if (fakeMicState.permissionBehavior === "denied") {
        const error = new Error("permission blocked");
        error.name = "NotAllowedError";
        throw error;
      }
      if (fakeMicState.permissionBehavior === "unsupported") {
        const error = new Error("secure context required");
        error.name = "SecurityError";
        throw error;
      }

      fakeMicState.permissionGranted = true;
      return createFakeLiveInputStream();
    };
    mediaDevices.enumerateDevices = async () =>
      fakeMicState.permissionGranted
        ? GRANTED_FAKE_AUDIO_INPUTS
        : [REDACTED_DEFAULT_AUDIO_INPUT];
    mediaDevices.addEventListener ??= () => {};
    mediaDevices.removeEventListener ??= () => {};
  });
}

async function setFakeLiveInputScene(page, scene) {
  await page.evaluate((nextScene) => {
    window.__setFakeLiveInputScene?.(nextScene);
  }, scene);
}

async function setFakeLiveInputPermission(page, behavior) {
  await page.evaluate((nextBehavior) => {
    window.__setFakeLiveInputPermission?.(nextBehavior);
  }, behavior);
}

async function setControl(page, key, value) {
  await page.evaluate(
    ([controlKey, controlValue]) => {
      window.__baryonControls.setControl(controlKey, controlValue);
    },
    [key, value],
  );
}

async function startFakeLiveInput(page) {
  await page.getByTestId("live-input-source-tab").click();
  await expect(page.getByTestId("live-input-device-select")).toBeVisible();
  await page
    .getByTestId("live-input-device-select")
    .selectOption({ label: "Fake Live Input" });
  await page.getByTestId("source-live-button").click();
}

async function setLiveInputProfile(page, profile) {
  const sidebar = page.getByTestId("advanced-controls-sidebar");
  const isSidebarOpen =
    (await sidebar.count()) > 0 &&
    (await sidebar.getAttribute("data-open")) === "true";

  if (!isSidebarOpen) {
    await page.getByTestId("advanced-controls-trigger").click();
  }

  const voiceModeSelect = page.getByLabel("Voice Mode", { exact: true });
  if (!(await voiceModeSelect.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /Live Input/ }).click();
  }

  await voiceModeSelect.selectOption(profile);
  await expect(voiceModeSelect).toHaveValue(profile);
}

function trackBlockedAriaHiddenWarnings(page) {
  const blockedWarnings = [];
  page.on("console", (message) => {
    if (message.text().includes("Blocked aria-hidden")) {
      blockedWarnings.push(message.text());
    }
  });
  return blockedWarnings;
}

async function ensureAdvancedSliderVisible(page) {
  await page.waitForSelector(
    ".baryon-controls-group-toggle, .baryon-controls-slider",
  );
  const slider = page.locator(".baryon-controls-slider").first();
  if ((await slider.count()) > 0) {
    return slider;
  }

  const groupToggles = page.locator(".baryon-controls-group-toggle");
  const toggleCount = await groupToggles.count();
  for (let index = 0; index < toggleCount; index += 1) {
    await groupToggles.nth(index).click();
    if ((await slider.count()) > 0) {
      return slider;
    }
  }

  return slider;
}

async function readTimelineValue(page) {
  return page.getByTestId("playback-timeline").evaluate((input) => {
    return Number(input.value);
  });
}

async function readCanvasSample(page) {
  return page
    .locator("#root > div canvas")
    .first()
    .evaluate((canvas) => {
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const context = scratch.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("2D sampling context unavailable");
      }

      context.drawImage(canvas, 0, 0);
      const readPixel = (x, y) =>
        Array.from(context.getImageData(x, y, 1, 1).data);
      const inset = Math.max(
        1,
        Math.floor(Math.min(scratch.width, scratch.height) * 0.02),
      );
      return {
        corner: readPixel(inset, inset),
      };
    });
}

test.describe("Baryon control smoke", () => {
  test("keeps transparent canvas corners when the backdrop color changes", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await setControl(page, "auditEnabled", true);
    await setControl(page, "backgroundColor", "#123456");
    await setControl(page, "injectTestTone", true);

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            getComputedStyle(
              document.querySelector('[data-testid="baryon-scene-root"]'),
            ).backgroundColor,
        ),
      )
      .toBe("rgb(18, 52, 86)");

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          volumeVisible:
            window.__baryonAuditSnapshot?.raymarchDebug?.volumeVisible ?? false,
        })),
      )
      .toEqual({
        fieldState: "test",
        volumeVisible: true,
      });

    await expect
      .poll(async () => {
        const sample = await readCanvasSample(page);
        return {
          cornerAlpha: sample.corner[3],
        };
      })
      .toEqual({
        cornerAlpha: 0,
      });
  });

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
      .toBeCloseTo(0.91 * 0.912, 6);

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

  test("defaults rotation to audio mode and supports manual and off overrides", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          rotationMode:
            window.__baryonControls?.getState?.().rotationMode ?? null,
          motionAmount:
            window.__baryonControls?.getState?.().motionAmount ?? null,
        })),
      )
      .toEqual({
        rotationMode: "audio",
        motionAmount: 1.5,
      });

    await setControl(page, "rotationMode", "manual");
    await setControl(page, "rotationSpeed", 2);

    const manualStart = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__baryonControlState?.scene?.rotationY ?? 0,
          ),
        { timeout: 3000 },
      )
      .not.toBeCloseTo(manualStart, 3);

    await setControl(page, "rotationMode", "off");
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.scene?.rotationMode ?? null,
        ),
      )
      .toBe("off");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const velocity =
            window.__baryonControlState?.scene?.angularVelocity ?? 1;
          return Math.abs(velocity) < 0.05;
        }),
      )
      .toBe(true);
  });

  test("switches between 3d and 2d modes while preserving the expected scene motion semantics", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await expect(page.getByTestId("raymarch-debug-overlay")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.__baryonControlState?.method ?? null),
      )
      .toBe("raymarch");
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonAuditSnapshot?.visualizationMethod ?? null,
        ),
      )
      .toBe("raymarch");

    await setControl(page, "visualizationMethod", "cymatics-2d");
    await waitForVisualizationMethod(page, "cymatics-2d");

    await expect
      .poll(() => readAuditMethodSnapshot(page))
      .toEqual({
        visualizationMethod: "cymatics-2d",
        activeDebug: expect.objectContaining({
          fieldState: expect.any(String),
          modeSlotCount: expect.any(Number),
        }),
        hasRaymarchDebug: false,
        hasCymatics2dDebug: true,
      });
    await expect
      .poll(() => readSceneSnapshot(page))
      .toEqual(
        expect.objectContaining({
          rotationMode: "disabled",
          rotationY: 0,
        }),
      );

    await setControl(page, "rotationMode", "manual");
    await setControl(page, "rotationSpeed", 2);
    const fullscreen2dStart = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    await page.waitForTimeout(150);
    const fullscreen2dEnd = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    expect(fullscreen2dStart).toBe(0);
    expect(fullscreen2dEnd).toBe(0);

    await setControl(page, "injectTestTone", true);
    await expect
      .poll(() => readAuditMethodSnapshot(page))
      .toEqual({
        visualizationMethod: "cymatics-2d",
        activeDebug: expect.objectContaining({
          fieldState: "test",
          modeSlotCount: expect.any(Number),
        }),
        hasRaymarchDebug: false,
        hasCymatics2dDebug: true,
      });
    await expect
      .poll(() => readSceneSnapshot(page))
      .toEqual(
        expect.objectContaining({
          rotationMode: "disabled",
          rotationY: 0,
        }),
      );

    await setControl(page, "injectTestTone", false);
    await setControl(page, "visualizationMethod", "raymarch");
    await waitForVisualizationMethod(page, "raymarch");

    await setControl(page, "rotationMode", "manual");
    await setControl(page, "rotationSpeed", 2);
    const manual3dStart = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    await page.waitForTimeout(120);
    const manual3dEnd = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    expect(manual3dEnd).not.toBeCloseTo(manual3dStart, 3);

    await setControl(page, "rotationMode", "audio");
    await setControl(page, "injectTestTone", true);
    await expect
      .poll(() => readAuditMethodSnapshot(page))
      .toEqual({
        visualizationMethod: "raymarch",
        activeDebug: expect.objectContaining({
          fieldState: "test",
          modeSlotCount: expect.any(Number),
        }),
        hasRaymarchDebug: true,
        hasCymatics2dDebug: false,
      });
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.scene?.rotationMode ?? null,
        ),
      )
      .toBe("audio");

    const audio3dStart = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    await page.waitForTimeout(150);
    const audio3dEnd = await page.evaluate(
      () => window.__baryonControlState?.scene?.rotationY ?? 0,
    );
    expect(audio3dEnd).not.toBeCloseTo(audio3dStart, 3);

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

  test("returns to the idle logo state after live input is turned off", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await startFakeLiveInput(page);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? false,
          audioInputMode: window.__baryonAuditSnapshot?.audioInputMode ?? null,
          analysisSourceUsed:
            window.__baryonAuditSnapshot?.analysisSourceUsed ?? null,
        })),
      )
      .toEqual({
        liveInputActive: true,
        audioInputMode: "live",
        analysisSourceUsed: "live",
      });

    await page.getByTestId("source-live-button").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? true,
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
        liveInputActive: false,
        visualizationMethod: "raymarch",
        fieldState: "idle",
        idleOverlayVisible: true,
      });
  });

  test("returns to the idle logo immediately when an active live input scene goes silent", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await setFakeLiveInputScene(page, "ambient");
    await startFakeLiveInput(page);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? false,
          liveInputCalibrationActive:
            window.__baryonAuditSnapshot?.liveInputCalibrationActive ?? true,
        })),
      )
      .toEqual({
        fieldState: "active",
        liveInputActive: true,
        liveInputCalibrationActive: false,
      });

    await setFakeLiveInputScene(page, "silent");

    await expect
      .poll(
        () =>
          page.evaluate(() => ({
            fieldState:
              window.__baryonAuditSnapshot?.raymarchDebug?.fieldState ?? null,
            liveInputHardSilenceActive:
              window.__baryonAuditSnapshot?.liveInputHardSilenceActive ?? false,
            idleOverlayVisible:
              window.__baryonAuditSnapshot?.raymarchDebug?.idleOverlayVisible ??
              false,
          })),
        { timeout: 10000 },
      )
      .toEqual({
        fieldState: "idle",
        liveInputHardSilenceActive: true,
        idleOverlayVisible: true,
      });
  });

  test("keeps fluctuating voice input from flashing into implausible high-note locks", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await setFakeLiveInputScene(page, "ambient");
    await startFakeLiveInput(page);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? false,
          liveInputCalibrationActive:
            window.__baryonAuditSnapshot?.liveInputCalibrationActive ?? true,
        })),
      )
      .toEqual({
        liveInputActive: true,
        liveInputCalibrationActive: false,
      });

    await setFakeLiveInputScene(page, "voice-flutter");

    const samples = await page.evaluate(async () => {
      const collected = [];
      const startedAt = performance.now();
      while (performance.now() - startedAt < 900) {
        const snapshot = window.__baryonAuditSnapshot ?? {};
        collected.push({
          liveInputActive: snapshot.liveInputActive ?? false,
          driverFrequency: snapshot.driverFrequency ?? 0,
          candidateFrequency: snapshot.candidateFrequency ?? 0,
          highCandidateRejected: snapshot.highCandidateRejected ?? false,
          rejectionReason: snapshot.rejectionReason ?? "none",
          pitchSource: snapshot.pitchSource ?? "none",
          fieldState: snapshot.raymarchDebug?.fieldState ?? snapshot.fieldState,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      return collected;
    });

    expect(samples.some((sample) => sample.liveInputActive)).toBe(true);
    expect(
      samples.every(
        (sample) =>
          sample.candidateFrequency <= 650 ||
          sample.highCandidateRejected ||
          sample.pitchSource !== "fundamental",
      ),
    ).toBe(true);
    expect(
      samples.every(
        (sample) =>
          sample.fieldState !== "active" || !(sample.driverFrequency > 650),
      ),
    ).toBe(true);
  });

  test("keeps source settings on the mode pill and the red live state on the CTA", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);

    const fileSourceTab = page.getByTestId("file-source-tab");
    const micSourceTab = page.getByTestId("live-input-source-tab");
    const liveButton = page.getByTestId("source-live-button");
    const inputPanel = page.getByTestId("live-input-status-panel");

    await expect(inputPanel).toHaveCount(0);
    await expect(liveButton).toHaveCount(0);

    await micSourceTab.click();
    await expect(inputPanel).toBeVisible();
    await expect(page.getByTestId("live-input-device-select")).toBeVisible();
    await expect(
      page.getByTestId("live-input-device-select").locator("option"),
    ).toContainText(["Fake Live Input"]);
    await expect(liveButton).toContainText("Go Live");
    await expect(liveButton).toBeEnabled();

    await fileSourceTab.click();
    await expect(inputPanel).toHaveCount(0);
    await expect(liveButton).toHaveCount(0);

    await micSourceTab.click();
    await expect(inputPanel).toBeVisible();
    await page
      .getByTestId("live-input-device-select")
      .selectOption({ label: "Fake Live Input" });

    const beforeState = await Promise.all([
      liveButton.evaluate((element) => element.getBoundingClientRect().width),
      micSourceTab.evaluate((element) => getComputedStyle(element).color),
    ]);

    await liveButton.click();

    await expect(liveButton).toContainText("Live");
    await expect(liveButton).toHaveAttribute("data-state", "live");
    await expect(liveButton).toHaveAttribute("title", "Stop Live");

    const afterState = await Promise.all([
      liveButton.evaluate((element) => element.getBoundingClientRect().width),
      micSourceTab.evaluate((element) => getComputedStyle(element).color),
    ]);

    expect(Math.abs(afterState[0] - beforeState[0])).toBeLessThan(1);
    expect(beforeState[1].startsWith("rgba(255, 255, 255")).toBe(true);
    expect(afterState[1].startsWith("rgba(255, 255, 255")).toBe(true);
  });

  test("keeps the live-input popover open with retry guidance when mic permission is denied", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setFakeLiveInputPermission(page, "denied");

    await page.getByTestId("live-input-source-tab").click();

    await expect(page.getByTestId("live-input-status-panel")).toBeVisible();
    await expect(
      page.getByText("Audio access is blocked.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry Access" }),
    ).toBeVisible();

    await setFakeLiveInputPermission(page, "granted");
    await page.getByRole("button", { name: "Retry Access" }).click();

    await expect(page.getByTestId("live-input-device-select")).toBeVisible();
    await expect(
      page.getByTestId("live-input-device-select").locator("option"),
    ).toContainText(["Fake Live Input"]);
  });

  test("web app stays listener-first and does not expose desktop-only mode chrome", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);

    const fileSourceTab = page.getByTestId("file-source-tab");

    await expect(page.getByTestId("app-mode-toggle")).toHaveCount(0);
    await expect(page.getByTestId("performer-live-device-select")).toHaveCount(
      0,
    );
    await expect(fileSourceTab).toBeVisible();
    await expect(page.getByTestId("live-input-status-panel")).toHaveCount(0);
    await expect(page.getByTestId("source-live-button")).toHaveCount(0);
  });

  test("hides live-input-only advanced controls when the selected live device is system-classified", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.addInitScript(() => {
      window.localStorage.setItem(
        "baryon:deviceClassification",
        JSON.stringify({
          "fake-live-input-device": "system",
        }),
      );
    });
    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await page.getByTestId("advanced-controls-trigger").click();

    await expect(page.getByRole("button", { name: /Live Input/ })).toHaveCount(
      0,
    );
    await expect(page.getByText("Voice Mode")).toHaveCount(0);
    await expect(page.getByText("Echo Cancel")).toHaveCount(0);
  });

  test("shows Voice Mode for mic-classified live input and applies it to the runtime", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "Walking Around.mp3",
        mimeType: "audio/mpeg",
        buffer: createMonoWavBuffer({ durationSeconds: 4 }),
      });

    await expect(page.getByTestId("live-input-source-tab")).toBeVisible();
    await setLiveInputProfile(page, "voice-tone");
    const voiceModeSelect = page.getByLabel("Voice Mode", { exact: true });
    await expect(voiceModeSelect).toHaveValue("voice-tone");
    await expect(voiceModeSelect.locator("option")).toHaveCount(1);

    await startFakeLiveInput(page);
    await expect
      .poll(async () => {
        return page.evaluate(() => ({
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? false,
          liveInputCalibrationActive:
            window.__baryonAuditSnapshot?.liveInputCalibrationActive ?? true,
          liveInputProfile:
            window.__baryonAuditSnapshot?.liveInputProfile ?? null,
        }));
      })
      .toEqual({
        liveInputActive: true,
        liveInputCalibrationActive: false,
        liveInputProfile: "voice-tone",
      });

    await page.getByTestId("source-live-button").click();
    await expect
      .poll(async () => {
        return page.evaluate(() => ({
          liveInputActive:
            window.__baryonAuditSnapshot?.liveInputActive ?? true,
          liveInputCalibrationActive:
            window.__baryonAuditSnapshot?.liveInputCalibrationActive ?? true,
        }));
      })
      .toEqual({
        liveInputActive: false,
        liveInputCalibrationActive: false,
      });
  });

  test("restores focus to the trigger when advanced controls close from a focused slider", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    const blockedWarnings = trackBlockedAriaHiddenWarnings(page);

    await page.goto("/");
    await waitForControlSurface(page);

    await page.getByTestId("advanced-controls-trigger").click();
    const slider = await ensureAdvancedSliderVisible(page);
    const sliderRow = slider.locator("xpath=..");
    const numberInput = sliderRow.locator(".baryon-controls-number-input");

    await expect(slider).toBeVisible();
    await slider.focus();
    await expect(slider).toBeFocused();

    const initialSliderValue = Number(await slider.inputValue());
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => Number(await slider.inputValue()))
      .not.toBe(initialSliderValue);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("advanced-controls-trigger")).toBeFocused();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeHidden();

    await page.getByTestId("advanced-controls-trigger").click();
    await expect(slider).toBeVisible();

    const sliderValueAfterKeyboard = Number(await slider.inputValue());
    const min = Number(await numberInput.getAttribute("min"));
    const max = Number(await numberInput.getAttribute("max"));
    const step = Number(await numberInput.getAttribute("step"));
    const nextNumberValue = String(
      Number(
        (sliderValueAfterKeyboard + step <= max
          ? sliderValueAfterKeyboard + step
          : Math.max(min, sliderValueAfterKeyboard - step)
        ).toFixed(6),
      ),
    );
    await numberInput.fill(nextNumberValue);
    await numberInput.press("Tab");

    await expect(numberInput).toHaveValue(nextNumberValue);
    await expect(slider).toHaveValue(nextNumberValue);
    expect(blockedWarnings).toEqual([]);
  });

  test("clears the stale upload label after switching from file playback to live input mode", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await page.locator('input[type="file"]').setInputFiles({
      name: "resume-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });
    await expect(page.getByTestId("playback-timeline")).toBeVisible();

    await page.locator(".am-btn--play").click();
    await expect(page.locator('.am-btn--play[title="Pause"]')).toBeVisible();

    await startFakeLiveInput(page);

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
        audioInputMode: "live",
      });

    await page.getByTestId("source-live-button").click();

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

  test("can reload the last uploaded file from recent uploads after live input mode", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await page.locator('input[type="file"]').setInputFiles({
      name: "recent-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 4 }),
    });
    await expect(page.getByTestId("playback-timeline")).toBeVisible();

    await page.locator(".am-btn--play").click();
    await expect(page.locator('.am-btn--play[title="Pause"]')).toBeVisible();

    await startFakeLiveInput(page);
    await page.getByTestId("source-live-button").click();

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
        audioInputMode: "idle",
      });
  });

  test("keeps raymarch analysis active when file output volume is zero", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

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
    await setControl(page, "auditEnabled", true);

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

  test("preserves the paused cymatics frame when switching program output modes", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await waitForControlSurface(page);
    await setControl(page, "auditEnabled", true);

    await page.locator('input[type="file"]').setInputFiles({
      name: "paused-output-tone.wav",
      mimeType: "audio/wav",
      buffer: createMonoWavBuffer({ durationSeconds: 12 }),
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

    await page.locator(".am-btn--play").click();
    await expect
      .poll(() =>
        page.locator(".am-btn--play").evaluate((button) => {
          return button.getAttribute("title");
        }),
      )
      .toBe("Play");

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

    await setControl(page, "outputMode", "opaque");

    await expect
      .poll(() =>
        page.evaluate(() => ({
          outputMode: window.__baryonControlState?.output?.outputMode ?? null,
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
        outputMode: "opaque",
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
      });

    await setControl(page, "outputMode", "transparent");

    await expect
      .poll(() =>
        page.evaluate(() => ({
          outputMode: window.__baryonControlState?.output?.outputMode ?? null,
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
        outputMode: "transparent",
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
      });

    await setControl(page, "outputBackgroundColor", "#123456");

    await expect
      .poll(() =>
        page.evaluate(() => ({
          outputMode: window.__baryonControlState?.output?.outputMode ?? null,
          outputBackgroundColor:
            window.__baryonControlState?.output?.outputBackgroundColor ?? null,
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
        outputMode: "transparent",
        outputBackgroundColor: "#123456",
        audioInputMode: "file",
        analysisSourceUsed: "file",
        fieldState: expect.not.stringMatching(/^idle$/),
        modeSlotCount: expect.any(Number),
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

  test("hides the playback timeline while live input is active", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await installFakeLiveInput(page);
    await page.goto("/");
    await waitForControlSurface(page);

    await startFakeLiveInput(page);

    await expect(page.getByTestId("playback-timeline")).toHaveCount(0);
  });
});
