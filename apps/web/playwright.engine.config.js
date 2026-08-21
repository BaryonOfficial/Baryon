import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

process.env.BARYON_BUILD_MODE = "production";

const webGpuLaunchArgs = ["--enable-unsafe-webgpu"];
if (process.platform === "darwin") {
  webGpuLaunchArgs.push("--use-angle=metal");
}

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: webGpuLaunchArgs,
    },
  },
  webServer: {
    command:
      "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-webgpu",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
