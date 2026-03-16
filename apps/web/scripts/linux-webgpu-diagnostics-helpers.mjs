const SEVERE_ERROR_PATTERNS = [
  /createBuffer failed/i,
  /popErrorScope/i,
  /uncapturederror/i,
  /device lost/i,
];

const WARNING_ERROR_PATTERNS = [/not supported/i];
const SOFTWARE_ADAPTER_PATTERNS = [/swiftshader/i, /software/i];

export function toErrorString(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

function normalizeMessage(message) {
  return String(message || "").trim();
}

/**
 * Pure helpers shared by the CLI script and unit tests. Keep browser/process
 * side effects in the entrypoint so diagnostics classification stays easy to
 * reason about.
 */
export function classifyPageError(message, info = null) {
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

export function aggregateMessages(messages, info = null) {
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

export function isSoftwareAdapter(info = null) {
  const adapterInfo = info?.adapterInfo?.info;
  if (!adapterInfo) {
    return false;
  }

  const descriptor = [
    adapterInfo.vendor,
    adapterInfo.architecture,
    adapterInfo.device,
    adapterInfo.description,
  ]
    .filter(Boolean)
    .join(" ");

  return SOFTWARE_ADAPTER_PATTERNS.some((pattern) => pattern.test(descriptor));
}

export function getDiagnosticsResult(result) {
  if (result.infrastructureError) {
    return "fail";
  }

  if (!result.info?.adapterAvailable) {
    return "pass";
  }

  const hasSevereRuntimeErrors = result.pageErrorSummary.some(
    (entry) => entry.classification === "runtime-severe",
  );
  if (!hasSevereRuntimeErrors) {
    return "pass";
  }

  if (isSoftwareAdapter(result.info)) {
    return "environment-limited";
  }

  return "fail";
}

export function shouldFailBrowserDiagnostics(result) {
  return getDiagnosticsResult(result) === "fail";
}

export function summarizeClassification(pageErrorSummary, classification) {
  return pageErrorSummary.filter(
    (entry) => entry.classification === classification,
  );
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

export function formatResultSummary(result) {
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
  lines.push(`- Diagnostics result: ${getDiagnosticsResult(result)}`);

  if (info.adapterInfo?.info) {
    const adapterInfoSummary = Object.entries(info.adapterInfo.info)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    if (adapterInfoSummary) {
      lines.push(`- Adapter info: ${adapterInfoSummary}`);
    }
  }

  lines.push(`- Software adapter: ${isSoftwareAdapter(info) ? "yes" : "no"}`);

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
