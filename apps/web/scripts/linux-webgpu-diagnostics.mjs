import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, firefox } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4174/";
const OUTPUT_PATH =
  process.env.OUTPUT_PATH || "test-results/linux-webgpu-diagnostics.json";
const SUMMARY_PATH =
  process.env.SUMMARY_PATH || "test-results/linux-webgpu-diagnostics.md";
const WAIT_AFTER_GOTO_MS = Number(process.env.WAIT_AFTER_GOTO_MS || 3000);

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function toErrorString(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function collectBrowserDiagnostics(
  browserName,
  browserType,
  launchOptions,
) {
  const result = {
    browserName,
    launchOptions,
    ok: false,
    infrastructureError: null,
    info: null,
    consoleMessages: [],
    pageErrors: [],
  };

  let browser;

  try {
    browser = await browserType.launch({
      headless: true,
      ...launchOptions,
    });

    const page = await browser.newPage();

    page.on("console", (message) => {
      result.consoleMessages.push({
        type: message.type(),
        text: message.text(),
      });
    });

    page.on("pageerror", (error) => {
      result.pageErrors.push(toErrorString(error));
    });

    await page.goto(BASE_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForTimeout(WAIT_AFTER_GOTO_MS);

    result.info = await page.evaluate(async () => {
      const unsupportedDiagnostics =
        Array.from(
          document.querySelectorAll('[aria-label="WebGPU diagnostics"] li'),
        ).map((item) => item.textContent?.trim() || "") || [];

      const unsupportedText = document.body.innerText.includes(
        "The music visualizer requires a working WebGPU stack.",
      );

      let adapter = null;
      let adapterError = null;

      try {
        adapter = await Promise.race([
          navigator.gpu?.requestAdapter?.() ?? Promise.resolve(null),
          new Promise((_, reject) => {
            window.setTimeout(() => {
              reject(new Error("requestAdapter timed out after 5000ms"));
            }, 5000);
          }),
        ]);
      } catch (error) {
        adapterError = error instanceof Error ? error.message : String(error);
      }

      return {
        userAgent: navigator.userAgent,
        hasGpu: Boolean(navigator.gpu),
        hasRequestAdapter: typeof navigator.gpu?.requestAdapter === "function",
        adapterAvailable: Boolean(adapter),
        adapterError,
        rendererInfo: window.__baryonRendererInfo ?? null,
        testReady: window.__baryonTestReady ?? null,
        controlStateAvailable: Boolean(window.__baryonControlState),
        unsupportedText,
        unsupportedDiagnostics,
      };
    });

    result.ok = true;
  } catch (error) {
    result.infrastructureError = toErrorString(error);
  } finally {
    await browser?.close();
  }

  return result;
}

function formatResultSummary(result) {
  const lines = [
    `### ${result.browserName}`,
    "",
    `- Launch ok: ${result.ok ? "yes" : "no"}`,
  ];

  if (result.infrastructureError) {
    lines.push(`- Infrastructure error: ${result.infrastructureError}`);
    lines.push("");
    return lines.join("\n");
  }

  const info = result.info ?? {};
  lines.push(`- navigator.gpu: ${info.hasGpu ? "present" : "missing"}`);
  lines.push(
    `- navigator.gpu.requestAdapter: ${
      info.hasRequestAdapter ? "present" : "missing"
    }`,
  );
  lines.push(`- Adapter available: ${info.adapterAvailable ? "yes" : "no"}`);

  if (info.adapterError) {
    lines.push(`- Adapter error: ${info.adapterError}`);
  }

  lines.push(
    `- Renderer backend: ${info.rendererInfo?.backend ?? "not initialized"}`,
  );
  lines.push(`- Renderer error: ${info.rendererInfo?.error ?? "none"}`);
  lines.push(
    `- Unsupported banner shown: ${info.unsupportedText ? "yes" : "no"}`,
  );

  if (
    Array.isArray(info.unsupportedDiagnostics) &&
    info.unsupportedDiagnostics.length > 0
  ) {
    lines.push("- App diagnostics:");
    for (const detail of info.unsupportedDiagnostics) {
      lines.push(`  - ${detail}`);
    }
  }

  if (result.pageErrors.length > 0) {
    lines.push("- Page errors:");
    for (const error of result.pageErrors) {
      lines.push(`  - ${error}`);
    }
  }

  const relevantConsoleMessages = result.consoleMessages.filter(
    (message) => message.type !== "debug",
  );
  if (relevantConsoleMessages.length > 0) {
    lines.push("- Console messages:");
    for (const message of relevantConsoleMessages.slice(0, 10)) {
      lines.push(`  - [${message.type}] ${message.text}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const cwd = process.cwd();
  const outputPath = path.resolve(cwd, OUTPUT_PATH);
  const summaryPath = path.resolve(cwd, SUMMARY_PATH);

  const browserResults = await withTimeout(
    Promise.all([
      collectBrowserDiagnostics("chromium-linux-webgpu", chromium, {
        args: [
          "--enable-unsafe-webgpu",
          "--enable-features=Vulkan",
          "--use-angle=vulkan",
        ],
      }),
      collectBrowserDiagnostics("firefox-linux-webgpu", firefox, {
        firefoxUserPrefs: {
          "dom.webgpu.enabled": true,
          "dom.webgpu.service-workers.enabled": true,
        },
      }),
    ]),
    120_000,
    "Browser diagnostics run",
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    browserResults,
  };

  const summary = [
    "# Linux WebGPU Diagnostics",
    "",
    `- Generated at: ${payload.generatedAt}`,
    `- Base URL: ${payload.baseUrl}`,
    "",
    ...browserResults.map(formatResultSummary),
  ].join("\n");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(summaryPath, `${summary}\n`);

  for (const result of browserResults) {
    console.log(
      `[${result.browserName}] ok=${result.ok} infrastructureError=${
        result.infrastructureError ?? "none"
      }`,
    );
  }

  if (browserResults.some((result) => result.infrastructureError)) {
    process.exitCode = 1;
  }
}

await main();
