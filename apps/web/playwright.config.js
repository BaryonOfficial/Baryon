import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // Headless WebGPU presentation degrades across sequential page loads in
  // one browser process; a retry runs in a fresh worker (fresh browser/GPU).
  retries: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    launchOptions: {
      // use-angle=metal keeps WebGPU canvas presentation composited in
      // headless captures; without it headless screenshots show a black
      // canvas while offscreen render targets still work.
      args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
    },
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BARYON_RAYMARCH_AUDIT_FIXTURE: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
