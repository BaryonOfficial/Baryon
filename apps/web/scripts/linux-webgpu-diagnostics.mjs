import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium, firefox } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4174/";
const OUTPUT_PATH =
  process.env.OUTPUT_PATH || "test-results/linux-webgpu-diagnostics.json";
const SUMMARY_PATH =
  process.env.SUMMARY_PATH || "test-results/linux-webgpu-diagnostics.md";
const SCREENSHOT_DIR =
  process.env.SCREENSHOT_DIR || "test-results/linux-webgpu-screenshots";
const WAIT_AFTER_GOTO_MS = Number(process.env.WAIT_AFTER_GOTO_MS || 3000);

const SEVERE_ERROR_PATTERNS = [
  /createBuffer failed/i,
  /popErrorScope/i,
  /uncapturederror/i,
  /device lost/i,
];

const WARNING_ERROR_PATTERNS = [/not supported/i];

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

function normalizeMessage(message) {
  return String(message || "").trim();
}

function classifyPageError(message, info = null) {
  const normalizedMessage = normalizeMessage(message);
  const expectedUnsupported =
    info?.adapterAvailable === false &&
    typeof info?.adapterError === "string" &&
    info.adapterError.length > 0;

  if (expectedUnsupported) {
    return "expected-unsupported";
  }

  if (
    SEVERE_ERROR_PATTERNS.some((pattern) => pattern.test(normalizedMessage))
  ) {
    return "runtime-severe";
  }

  if (
    WARNING_ERROR_PATTERNS.some((pattern) => pattern.test(normalizedMessage))
  ) {
    return "runtime-warning";
  }

  return "runtime-warning";
}

function aggregateMessages(messages, info = null) {
  const counts = new Map();

  for (const message of messages) {
    const normalized = normalizeMessage(message);
    const currentCount = counts.get(normalized) ?? 0;
    counts.set(normalized, currentCount + 1);
  }

  return Array.from(counts.entries()).map(([message, count]) => ({
    message,
    count,
    classification: classifyPageError(message, info),
  }));
}

function shouldFailBrowserDiagnostics(result) {
  if (result.infrastructureError) {
    return true;
  }

  if (!result.info?.adapterAvailable) {
    return false;
  }

  return result.pageErrorSummary.some(
    (entry) => entry.classification === "runtime-severe",
  );
}

function summarizeClassification(pageErrorSummary, classification) {
  return pageErrorSummary.filter(
    (entry) => entry.classification === classification,
  );
}

function getBrowserLaunches() {
  return [
    {
      browserName: "chromium-linux-webgpu",
      browserType: chromium,
      launchOptions: {
        args: [
          "--enable-unsafe-webgpu",
          "--enable-features=Vulkan",
          "--use-angle=vulkan",
        ],
      },
    },
    {
      browserName: "firefox-linux-webgpu",
      browserType: firefox,
      launchOptions: {
        firefoxUserPrefs: {
          "dom.webgpu.enabled": true,
          "dom.webgpu.service-workers.enabled": true,
        },
      },
    },
  ];
}

async function collectBrowserDiagnostics(
  browserName,
  browserType,
  launchOptions,
  screenshotDirectory,
) {
  const screenshotPath = path.join(screenshotDirectory, `${browserName}.png`);
  const result = {
    browserName,
    launchOptions,
    ok: false,
    infrastructureError: null,
    info: null,
    consoleMessages: [],
    pageErrors: [],
    pageErrorSummary: [],
    screenshotPath,
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
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    result.info = await page.evaluate(async () => {
      const readAdapterLimits = (limits) => {
        if (!limits) {
          return null;
        }

        const limitKeys = [
          "maxBufferSize",
          "maxStorageBufferBindingSize",
          "maxUniformBufferBindingSize",
          "maxBindGroups",
          "maxTextureDimension2D",
        ];

        const entries = limitKeys
          .map((key) => [key, limits[key]])
          .filter(([, value]) => typeof value === "number");

        return Object.fromEntries(entries);
      };

      const unsupportedDiagnostics =
        window.__baryonSupportProbe?.diagnostics ?? [];

      let adapter = null;
      let adapterError = null;
      let adapterInfo = null;

      try {
        adapter = await Promise.race([
          navigator.gpu?.requestAdapter?.() ?? Promise.resolve(null),
          new Promise((_, reject) => {
            window.setTimeout(() => {
              reject(new Error("requestAdapter timed out after 5000ms"));
            }, 5000);
          }),
        ]);

        if (adapter) {
          const resolvedInfo =
            typeof adapter.requestAdapterInfo === "function"
              ? await adapter.requestAdapterInfo().catch(() => null)
              : (adapter.info ?? null);

          adapterInfo = {
            features: Array.from(adapter.features ?? []),
            limits: readAdapterLimits(adapter.limits),
            info: resolvedInfo
              ? {
                  vendor: resolvedInfo.vendor ?? null,
                  architecture: resolvedInfo.architecture ?? null,
                  device: resolvedInfo.device ?? null,
                  description: resolvedInfo.description ?? null,
                }
              : null,
          };
        }
      } catch (error) {
        adapterError = error instanceof Error ? error.message : String(error);
      }

      const canvas = document.querySelector("canvas");
      const canvasPresent = Boolean(canvas);
      const canvasVisible =
        canvasPresent &&
        window.getComputedStyle(canvas).display !== "none" &&
        window.getComputedStyle(canvas).visibility !== "hidden";

      return {
        userAgent: navigator.userAgent,
        hasGpu: Boolean(navigator.gpu),
        hasRequestAdapter: typeof navigator.gpu?.requestAdapter === "function",
        adapterAvailable: Boolean(adapter),
        adapterError,
        adapterInfo,
        rendererInfo: window.__baryonRendererInfo ?? null,
        supportProbe: window.__baryonSupportProbe ?? null,
        testReady: window.__baryonTestReady ?? null,
        controlStateAvailable: Boolean(window.__baryonControlState),
        unsupportedText: document.body.innerText.includes(
          "working WebGPU stack",
        ),
        unsupportedDiagnostics,
        canvasPresent,
        canvasVisible,
        visuallyReady:
          canvasVisible &&
          window.__baryonRendererInfo?.backendType === "webgpu" &&
          window.__baryonRendererInfo?.error == null,
      };
    });

    result.pageErrorSummary = aggregateMessages(result.pageErrors, result.info);
    result.ok = true;
  } catch (error) {
    result.infrastructureError = toErrorString(error);
  } finally {
    await browser?.close();
  }

  return result;
}

function formatAggregatedMessages(lines, heading, entries) {
  if (entries.length === 0) {
    return;
  }

  lines.push(`- ${heading}:`);
  for (const entry of entries) {
    const suffix = entry.count > 1 ? ` (${entry.count}x)` : "";
    lines.push(`  - ${entry.message}${suffix}`);
  }
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

  if (info.supportProbe?.failureCode) {
    lines.push(`- Support failure code: ${info.supportProbe.failureCode}`);
  }

  lines.push(
    `- Renderer backend: ${info.rendererInfo?.backendType ?? "unknown"}`,
  );
  lines.push(
    `- Renderer backend name: ${info.rendererInfo?.backend ?? "none"}`,
  );
  lines.push(`- Renderer error: ${info.rendererInfo?.error ?? "none"}`);
  lines.push(`- Canvas present: ${info.canvasPresent ? "yes" : "no"}`);
  lines.push(`- Canvas visible: ${info.canvasVisible ? "yes" : "no"}`);
  lines.push(`- App visually ready: ${info.visuallyReady ? "yes" : "no"}`);
  lines.push(`- Screenshot: ${result.screenshotPath}`);
  lines.push(
    `- Diagnostics result: ${
      shouldFailBrowserDiagnostics(result) ? "fail" : "pass"
    }`,
  );

  if (info.adapterInfo?.info) {
    const adapterInfoSummary = Object.entries(info.adapterInfo.info)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    if (adapterInfoSummary) {
      lines.push(`- Adapter info: ${adapterInfoSummary}`);
    }
  }

  if (info.adapterInfo?.limits) {
    lines.push(`- Adapter limits: ${JSON.stringify(info.adapterInfo.limits)}`);
  }

  if (info.adapterInfo?.features?.length) {
    lines.push(`- Adapter features: ${info.adapterInfo.features.join(", ")}`);
  }

  if (
    Array.isArray(info.supportProbe?.diagnostics) &&
    info.supportProbe.diagnostics.length > 0
  ) {
    lines.push("- App diagnostics:");
    for (const detail of info.supportProbe.diagnostics) {
      lines.push(`  - ${detail}`);
    }
  }

  formatAggregatedMessages(
    lines,
    "Severe runtime errors",
    summarizeClassification(result.pageErrorSummary, "runtime-severe"),
  );
  formatAggregatedMessages(
    lines,
    "Runtime warnings",
    summarizeClassification(result.pageErrorSummary, "runtime-warning"),
  );
  formatAggregatedMessages(
    lines,
    "Expected unsupported signals",
    summarizeClassification(result.pageErrorSummary, "expected-unsupported"),
  );

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

export async function runLinuxWebGpuDiagnostics() {
  const cwd = process.cwd();
  const outputPath = path.resolve(cwd, OUTPUT_PATH);
  const summaryPath = path.resolve(cwd, SUMMARY_PATH);
  const screenshotDirectory = path.resolve(cwd, SCREENSHOT_DIR);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(screenshotDirectory, { recursive: true });

  const browserResults = await withTimeout(
    Promise.all(
      getBrowserLaunches().map((browser) =>
        collectBrowserDiagnostics(
          browser.browserName,
          browser.browserType,
          browser.launchOptions,
          screenshotDirectory,
        ),
      ),
    ),
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

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(summaryPath, `${summary}\n`);

  for (const result of browserResults) {
    console.log(
      `[${result.browserName}] ok=${result.ok} fail=${shouldFailBrowserDiagnostics(
        result,
      )} infrastructureError=${result.infrastructureError ?? "none"}`,
    );
  }

  if (browserResults.some(shouldFailBrowserDiagnostics)) {
    process.exitCode = 1;
  }

  return payload;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  await runLinuxWebGpuDiagnostics();
}

export { aggregateMessages, classifyPageError, shouldFailBrowserDiagnostics };
