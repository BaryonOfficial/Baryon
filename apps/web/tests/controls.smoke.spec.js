import { expect, test } from "@playwright/test";

async function waitForControlSurface(page) {
  await page.waitForFunction(() => {
    return Boolean(window.__baryonControls && window.__baryonControlState);
  });
}

async function setControl(page, key, value) {
  await page.evaluate(
    ([controlKey, controlValue]) => {
      window.__baryonControls.setControl(controlKey, controlValue);
    },
    [key, value]
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
        page.evaluate(() => window.__baryonControlState?.method ?? null)
      )
      .toBe("particle");

    await setControl(page, "particleSize", 0.123);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.particle?.uniforms?.particleSize ?? null
        )
      )
      .toBe(0.123);

    await setControl(page, "bloomStrength", 0.91);
    await expect
      .poll(() =>
        page.evaluate(() => window.__baryonControlState?.bloom?.strength ?? null)
      )
      .toBe(0.91);

    await setControl(page, "idleLogoSize", 1.37);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.particle?.uniforms?.idleLogoSize ?? null
        )
      )
      .toBe(1.37);

    await setControl(page, "zeroPointPrecision", 0.042);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.particle?.uniforms?.threshold ?? null
        )
      )
      .toBe(0.042);
  });
});
