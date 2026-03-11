import { expect, test } from "@playwright/test";

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
      .toBe("particle");

    await setControl(page, "auditEnabled", true);
    await expect(page.getByTestId("particle-debug-overlay")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
          centerParticleOccupancy:
            window.__baryonAuditSnapshot?.particleDebug
              ?.centerParticleOccupancy ?? null,
          centerPotentialOccupancy:
            window.__baryonAuditSnapshot?.particleDebug
              ?.centerPotentialOccupancy ?? null,
          continuityMode:
            window.__baryonAuditSnapshot?.particleDebug?.continuityMode ?? null,
        })),
      )
      .toEqual({
        fieldState: expect.any(String),
        centerParticleOccupancy: expect.any(Number),
        centerPotentialOccupancy: expect.any(Number),
        continuityMode: expect.any(String),
      });

    await setControl(page, "injectTestTone", true);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState:
            window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
          pitchSource: window.__baryonAuditSnapshot?.pitchSource ?? null,
          modeSlotCount: window.__baryonAuditSnapshot?.modeSlotCount ?? 0,
        })),
      )
      .toEqual({
        fieldState: "test",
        pitchSource: "test",
        modeSlotCount: expect.any(Number),
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
            window.__baryonControlState?.particle?.uniforms?.idleLogoSize ??
            null,
        ),
      )
      .toBe(1.37);

    await setControl(page, "zeroPointPrecision", 0.042);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonControlState?.particle?.uniforms?.threshold ?? null,
        ),
      )
      .toBe(0.042);

    await setControl(page, "attractionStrength", 19.2);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__baryonControlState?.particle?.uniforms
              ?.attractionStrength ?? null,
        ),
      )
      .toBe(19.2);

    await setControl(page, "injectTestTone", false);
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
          fieldState:
            window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
        })),
      )
      .toEqual({
        micActive: true,
        fieldState: expect.not.stringMatching(/^idle$/),
      });

    await page.getByTitle("Stop mic input").click();

    await expect
      .poll(() =>
        page.evaluate(() => ({
          micActive: window.__baryonAuditSnapshot?.micActive ?? true,
          fieldState:
            window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
        })),
      )
      .toEqual({
        micActive: false,
        fieldState: "idle",
      });
  });
});
