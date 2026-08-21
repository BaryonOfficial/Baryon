import { devices, expect, test } from "@playwright/test";

test.describe("Baryon production smoke", () => {
  test("switches floating chrome by viewport width instead of device type", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 740, height: 900 });
    await page.goto("/");
    await expect(page.getByText("Baryon", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Toggle settings" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.getByText("Baryon", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Toggle settings" }),
    ).toBeVisible();
  });

  test("keeps the compact dock bottom-anchored across tablet widths", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/");
    await expect(page.locator(".am-compact-card")).toBeVisible();

    const readBottomInset = async () =>
      page.evaluate(() => {
        const card = document.querySelector(".am-compact-card");
        if (!(card instanceof HTMLElement)) {
          throw new Error("Compact dock card not found");
        }
        const rect = card.getBoundingClientRect();
        return window.innerHeight - rect.bottom;
      });

    const wideTabletBottomInset = await readBottomInset();

    await page.setViewportSize({ width: 960, height: 900 });
    await expect(page.locator(".am-compact-card")).toBeVisible();

    const narrowTabletBottomInset = await readBottomInset();
    expect(narrowTabletBottomInset).toBeCloseTo(wideTabletBottomInset, 0);
  });

  test("keeps the compact dock dimensions stable across tablet and phone widths", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto("/");
    await expect(page.locator(".am-compact-card")).toBeVisible();

    const readCardSize = async () =>
      page.evaluate(() => {
        const card = document.querySelector(".am-compact-card");
        if (!(card instanceof HTMLElement)) {
          throw new Error("Compact dock card not found");
        }
        const rect = card.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });

    const tabletSize = await readCardSize();

    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.locator(".am-compact-card")).toBeVisible();

    const phoneSize = await readCardSize();
    expect(phoneSize.width).toBeCloseTo(tabletSize.width, 0);
    expect(phoneSize.height).toBeCloseTo(tabletSize.height, 0);
  });

  test("keeps user controls but omits developer tooling from the production build", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await expect(page.locator("#root > div canvas").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload audio files" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Toggle settings" }),
    ).toBeVisible();
    await expect(page.getByTestId("advanced-controls-sidebar")).toHaveCount(0);
    await expect(page.getByText("Audit")).toHaveCount(0);

    const debugSurface = await page.evaluate(() => ({
      hasControls: "__baryonControls" in window,
      hasControlState: "__baryonControlState" in window,
      hasAuditSnapshot: "__baryonAuditSnapshot" in window,
    }));

    expect(debugSurface).toEqual({
      hasControls: false,
      hasControlState: false,
      hasAuditSnapshot: false,
    });

    await expect(page.getByTestId("diagnostics-hud")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Toggle settings" })
      .click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close settings backdrop" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Close settings" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Volume\s/ })).toBeVisible();
    await expect(page.getByText("Audit")).toHaveCount(0);
    await page.getByRole("button", { name: "Close settings" }).click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeHidden();
  });

  test("shows control help outside the card without shifting slider layout", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await page
      .getByRole("button", { name: "Toggle settings" })
      .click();
    await page.getByRole("button", { name: /^Volume\s/ }).click();

    const slider = page.getByRole("slider", {
      name: "Material Density slider",
    });
    const helpTrigger = page.getByRole("button", {
      name: "Show help for Material Density",
    });
    const scrollPanel = page.locator(".baryon-controls-scroll");

    await slider.evaluate(async (element) => {
      const animations = [];
      for (
        let current = element;
        current && !current.classList.contains("baryon-controls-scroll");
        current = current.parentElement
      ) {
        animations.push(...current.getAnimations());
      }
      await Promise.allSettled(
        animations.map((animation) => animation.finished),
      );
    });

    const before = await slider.boundingBox();
    const scrollTopBefore = await scrollPanel.evaluate(
      (element) => element.scrollTop,
    );
    expect(before).not.toBeNull();

    await helpTrigger.evaluate((element) =>
      element.focus({ preventScroll: true }),
    );
    const tooltip = page.getByTestId("advanced-controls-help-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Material Density");

    const after = await slider.boundingBox();
    const scrollTopAfter = await scrollPanel.evaluate(
      (element) => element.scrollTop,
    );
    expect(after).not.toBeNull();
    expect(scrollTopAfter).toBe(scrollTopBefore);
    expect(after?.x).toBeCloseTo(before?.x ?? 0, 1);
    expect(after?.y).toBeCloseTo(before?.y ?? 0, 1);
    expect(after?.width).toBeCloseTo(before?.width ?? 0, 1);
    expect(after?.height).toBeCloseTo(before?.height ?? 0, 1);

    await page.mouse.click(900, 40);
    await expect(tooltip).toHaveCount(0);
  });

  test("toggles the bloom switch from the dock", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await page
      .getByRole("button", { name: "Toggle settings" })
      .click();
    await page.getByRole("button", { name: /^Appearance\s/ }).click();

    const bloomToggle = page.locator("#baryon-control-bloomEnabled");
    await expect(bloomToggle).toBeChecked();

    await bloomToggle.click();
    await expect(bloomToggle).not.toBeChecked();

    await bloomToggle.click();
    await expect(bloomToggle).toBeChecked();
  });

  test("hides overlay chrome while fullscreen is active and restores closed controls", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await page
      .getByRole("button", { name: "Toggle settings" })
      .click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeVisible();
    const uploadButton = page.getByRole("button", {
      name: "Upload audio files",
    });
    await expect(uploadButton).toBeVisible();

    await page.keyboard.press("f");
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(document.fullscreenElement)),
      )
      .toBe(true);

    await expect(
      page.getByRole("button", { name: "Toggle settings" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("advanced-controls-sidebar")).toHaveCount(0);
    await expect(uploadButton).toHaveCount(0);

    await page.keyboard.press("f");
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(document.fullscreenElement)),
      )
      .toBe(false);

    await expect(
      page.getByRole("button", { name: "Toggle settings" }),
    ).toBeVisible();
    await expect(page.getByTestId("advanced-controls-sidebar")).toHaveCount(0);
    await expect(uploadButton).toBeVisible();
  });
});

test.describe("Baryon mobile compatibility gate", () => {
  const pixel7 = devices["Pixel 7"];
  test.use({
    userAgent: pixel7.userAgent,
    viewport: { width: 393, height: 852 },
    screen: { width: 393, height: 852 },
    deviceScaleFactor: pixel7.deviceScaleFactor,
    isMobile: pixel7.isMobile,
    hasTouch: pixel7.hasTouch,
  });

  test("directs mobile visitors to a Chromium-based desktop browser", async ({
    page,
  }) => {

    await page.goto("/");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Open Baryon on desktop" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Chromium-based desktop browser/i),
    ).toBeVisible();
    await expect(
      page.getByText("Diagnostic code: mobile-unsupported"),
    ).toBeVisible();
    await expect(page.getByTestId("mobile-demo-controls")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Play demo" }),
    ).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
  });
});
