import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

test.describe("Baryon AR lab smoke", () => {
  test("loads /ar-lab without crashing and previews when only AR is missing", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "baryon:settings",
        JSON.stringify({
          version: 2,
          controls: {
            outputMode: "opaque",
            outputBackgroundColor: "#123456",
          },
        }),
      );
    });

    await page.goto("/ar-lab");
    await expect(page.getByTestId("ar-lab-root")).toBeVisible();

    // Headless CI may still lack a WebGPU adapter. That is a hard block.
    // When WebGPU is available but immersive-ar is not, the lab should render
    // a desktop preview. The Immersive XR entry stays hidden until headset
    // verification resumes.
    const unsupportedPanel = page.getByTestId("ar-lab-unsupported");
    if ((await unsupportedPanel.count()) > 0) {
      await expect(unsupportedPanel).toBeVisible();
      const failureCode =
        await unsupportedPanel.getAttribute("data-failure-code");
      expect([
        "webgpu-missing",
        "webgpu-adapter-unavailable",
        "insecure-context",
      ]).toContain(failureCode);
    } else {
      await expect(page.getByTestId("ar-lab-preview-note")).toHaveCount(0);
      await expect(page.getByTestId("ar-lab-enter")).toHaveCount(0);
      await expect(page.getByTestId("ar-recording-dock")).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () => window.__baryonControls?.getState?.().outputMode ?? null,
          ),
        )
        .toBe("transparent");
    }

    // The lab route must not mount the normal web app shell.
    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
    ).toHaveCount(0);

    expect(pageErrors).toEqual([]);
  });

  test("keeps the main app route unchanged", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
    ).toBeVisible();
    await expect(page.getByTestId("ar-lab-launch-button")).toBeVisible();
    await expect(page.getByTestId("ar-lab-root")).toHaveCount(0);
  });

  test("opens /ar-lab from the main app launch button", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await page.getByTestId("ar-lab-launch-button").click();
    await expect(page).toHaveURL(/\/ar-lab\/?$/);
    await expect(page.getByTestId("ar-lab-root")).toBeVisible();
  });

  test("exposes file and system audio controls in webcam mode", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.addInitScript(() => {
      window.__arLabCameraConstraints = null;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async (constraints) => {
            window.__arLabCameraConstraints = constraints;
            return new MediaStream();
          },
          enumerateDevices: async () => [
            {
              deviceId: "loopback-1",
              groupId: "fake-loopback",
              kind: "audioinput",
              label: "BlackHole 2ch (Virtual)",
            },
          ],
        },
      });

      HTMLMediaElement.prototype.play = () => Promise.resolve();
    });

    await page.goto("/ar-lab");

    const unsupportedPanel = page.getByTestId("ar-lab-unsupported");
    if ((await unsupportedPanel.count()) > 0) {
      test.skip(true, "WebGPU is unavailable in this browser environment");
    }

    await expect(page.getByTestId("ar-lab-enter")).toHaveCount(0);
    await expect(page.getByText("Immersive XR")).toHaveCount(0);

    await page.getByTestId("ar-lab-start-camera").click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__arLabCameraConstraints?.video?.frameRate),
      )
      .toEqual({ ideal: 60, min: 50 });

    await expect(page.getByTestId("source-mode-control")).toBeVisible();
    await expect(page.getByTestId("file-source-tab")).toBeVisible();
    await expect(page.getByTestId("live-input-source-tab")).toBeVisible();
    await expect(page.getByTestId("advanced-controls-trigger")).toBeVisible();
    await expect(page.getByTestId("ar-recording-dock")).toBeVisible();
    await expect(page.getByTestId("ar-lab-background-room")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("ar-lab-background-preset")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-background-custom")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-background-upload")).toBeVisible();
    await expect(page.getByTestId("ar-lab-camera-feed")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveAttribute(
      "src",
      /baryon-founder-background\.jpg/,
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(page.getByTestId("ar-lab-camera-person-cutout")).toHaveCSS(
      "opacity",
      "0",
    );

    await page.getByTestId("ar-lab-background-preset").click();
    await expect(page.getByTestId("ar-lab-background-room")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-background-preset")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("ar-lab-background-custom")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-camera-feed")).toHaveCSS(
      "opacity",
      "0",
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveAttribute(
      "src",
      /baryon-founder-background\.jpg/,
    );
    await expect(page.getByTestId("ar-lab-camera-person-cutout")).toHaveCSS(
      "opacity",
      "1",
    );

    await page.getByTestId("ar-lab-background-file").setInputFiles({
      name: "custom-bg.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mMMqTd7DwADtgGFCqVchQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(page.getByTestId("ar-lab-background-preset")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-background-custom")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveAttribute(
      "src",
      /^blob:/,
    );

    await page.getByTestId("ar-lab-background-preset").click();
    await expect(page.getByTestId("ar-lab-background-preset")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("ar-lab-background-custom")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("ar-lab-camera-background")).toHaveAttribute(
      "src",
      /baryon-founder-background\.jpg/,
    );

    const viewport = page.viewportSize();
    const advancedBox = await page
      .getByTestId("advanced-controls-trigger")
      .boundingBox();
    const sourceBox = await page
      .getByTestId("source-mode-control")
      .boundingBox();
    const playerBox = await page.locator(".am-player-shell").boundingBox();
    const recordingBox = await page
      .getByTestId("ar-recording-dock")
      .boundingBox();
    expect(viewport).not.toBeNull();
    expect(advancedBox).not.toBeNull();
    expect(sourceBox).not.toBeNull();
    expect(playerBox).not.toBeNull();
    expect(recordingBox).not.toBeNull();

    expect(advancedBox.x).toBeLessThan(80);
    expect(advancedBox.y).toBeLessThan(80);
    expect(recordingBox.x).toBeLessThan(80);
    expect(sourceBox.x + sourceBox.width).toBeGreaterThan(viewport.width - 80);
    expect(
      Math.abs(playerBox.x + playerBox.width / 2 - viewport.width / 2),
    ).toBeLessThan(80);

    await page.getByTestId("advanced-controls-trigger").click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeVisible();
    await page.getByRole("button", { name: "Close advanced controls" }).click();

    await page.getByTestId("live-input-source-tab").click();
    await expect(page.getByTestId("live-input-status-panel")).toBeVisible();
    await expect(
      page.getByTestId("ar-lab-live-input-device-select"),
    ).toBeVisible();
  });
});
