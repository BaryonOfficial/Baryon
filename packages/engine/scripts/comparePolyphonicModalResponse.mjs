import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { prepareHistoricalEngine } from "../../../scripts/lib/historical-engine.mjs";

// Preserve the original defect attribution without retaining an alternate
// production engine. This comparison deliberately executes immutable old code.
const snapshot = prepareHistoricalEngine();
try {
  const output = process.argv[2] ? resolve(process.argv[2]) : null;
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(
      join(output, "baseline-source.json"),
      JSON.stringify(
        {
          ...snapshot.provenance,
          scope:
            "historical two-tone representation defect, not current production qualification",
        },
        null,
        2,
      ),
    );
  }
  const result = spawnSync(
    process.execPath,
    [
      join(
        snapshot.directory,
        "packages/engine/scripts/comparePolyphonicModalResponse.mjs",
      ),
      ...(output ? [output] : []),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  snapshot.dispose();
}
