import { expect, test } from "@playwright/test";

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
      page.getByRole("button", { name: "Toggle advanced controls" }),
    ).toBeVisible();

    await page.setViewportSize({ width: 640, height: 900 });
    await expect(page.getByText("Baryon", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
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
    await expect(page.getByText("Upload Audio")).toBeVisible();
    await expect(page.getByRole("button", { name: "SoundCloud" })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("SoundCloud URL")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
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
      .getByRole("button", { name: "Toggle advanced controls" })
      .click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close advanced controls backdrop" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Close advanced controls" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Shape\s/ })).toBeVisible();
    await expect(page.getByText("Audit")).toHaveCount(0);
    await page.getByRole("button", { name: "Close advanced controls" }).click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeHidden();
  });

  test("shows control help outside the card without shifting slider layout", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await page
      .getByRole("button", { name: "Toggle advanced controls" })
      .click();
    await page.getByRole("button", { name: /^Shape\s/ }).click();

    const slider = page.getByRole("slider", { name: "Node Threshold" });
    const helpTrigger = page.getByRole("button", {
      name: "Show help for Node Threshold",
    });

    const before = await slider.boundingBox();
    expect(before).not.toBeNull();

    await helpTrigger.hover();
    const tooltip = page.getByTestId("advanced-controls-help-tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Node Threshold");

    const after = await slider.boundingBox();
    expect(after).not.toBeNull();
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
      .getByRole("button", { name: "Toggle advanced controls" })
      .click();
    await page.getByRole("button", { name: /^Display\s/ }).click();

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
      .getByRole("button", { name: "Toggle advanced controls" })
      .click();
    await expect(page.getByTestId("advanced-controls-sidebar")).toBeVisible();
    await expect(page.getByText("Upload Audio")).toBeVisible();

    await page.keyboard.press("f");
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(document.fullscreenElement)),
      )
      .toBe(true);

    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("advanced-controls-sidebar")).toHaveCount(0);
    await expect(page.getByText("Upload Audio")).toHaveCount(0);

    await page.keyboard.press("f");
    await expect
      .poll(async () =>
        page.evaluate(() => Boolean(document.fullscreenElement)),
      )
      .toBe(false);

    await expect(
      page.getByRole("button", { name: "Toggle advanced controls" }),
    ).toBeVisible();
    await expect(page.getByTestId("advanced-controls-sidebar")).toHaveCount(0);
    await expect(page.getByText("Upload Audio")).toBeVisible();
  });
});
