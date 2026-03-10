import process from "node:process";
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
  test.skip(
    process.env.BARYON_BUILD_MODE === "production",
    "Control smoke runs only against dev-mode builds."
  );

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

    await setControl(page, "auditEnabled", true);
    await expect(page.getByTestId("particle-debug-overlay")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          fieldState: window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
          centerParticleOccupancy:
            window.__baryonAuditSnapshot?.particleDebug?.centerParticleOccupancy ?? null,
          centerPotentialOccupancy:
            window.__baryonAuditSnapshot?.particleDebug?.centerPotentialOccupancy ?? null,
          continuityMode: window.__baryonAuditSnapshot?.particleDebug?.continuityMode ?? null,
        }))
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
          fieldState: window.__baryonAuditSnapshot?.particleDebug?.fieldState ?? null,
          pitchSource: window.__baryonAuditSnapshot?.pitchSource ?? null,
          modeSlotCount: window.__baryonAuditSnapshot?.modeSlotCount ?? 0,
        }))
      )
      .toEqual({
        fieldState: "test",
        pitchSource: "test",
        modeSlotCount: expect.any(Number),
      });

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

    await setControl(page, "attractionStrength", 19.2);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__baryonControlState?.particle?.uniforms?.attractionStrength ?? null
        )
      )
      .toBe(19.2);

    await setControl(page, "injectTestTone", false);
  });
});
