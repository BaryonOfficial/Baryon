import { expect, test } from "@playwright/test";

test.describe("Baryon production smoke", () => {
  test("keeps user controls but omits developer tooling from the production build", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "WebGPU smoke is chromium-only");

    await page.goto("/");
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.getByText("Upload Audio")).toBeVisible();
    await expect(page.getByRole("button", { name: "Baryon" })).toBeVisible();
    await expect(page.getByText("Volume").first()).toBeAttached(); // folder exists in pane; may be collapsed
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

    await expect(page.getByTestId("raymarch-debug-overlay")).toHaveCount(0);
  });
});
