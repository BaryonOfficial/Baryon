// Guardrail against "built but unwired": machinery that is constructed,
// populated and uploaded to spec, but that nothing downstream ever reads.
//
// This class of defect is invisible to ordinary tests because the producer
// works perfectly and nothing throws. It has shipped here more than once — a
// per-mode spectral colour buffer uploaded every topology change and read by no
// shader, and a diagnostics chain sourced from a runtime property that had no
// writer. Both are mechanically detectable, which is what this file does.
import { readFileSync, readdirSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { setupRaymarch } from "../raymarchSetup.js";
import { SIMULATION_DEFAULTS } from "../../defaults.js";

function createRuntimeState() {
  return setupRaymarch(
    new THREE.BoxGeometry(1, 1, 1),
    {
      radius: SIMULATION_DEFAULTS.radius,
      cavityGeometry: SIMULATION_DEFAULTS.cavityGeometry,
      volumeShape: SIMULATION_DEFAULTS.volumeShape,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    },
    { capacity: 8, fftSize: 2048 },
  );
}

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function collectSources(rootUrls) {
  const sources = [];
  const walk = (dirUrl) => {
    for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(new URL(`${entry.name}/`, dirUrl));
        continue;
      }
      if (!/\.(?:js|jsx)$/.test(entry.name) || entry.name.includes(".test.")) {
        continue;
      }
      sources.push(readFileSync(new URL(entry.name, dirUrl), "utf8"));
    }
  };
  for (const rootUrl of rootUrls) {
    walk(rootUrl);
  }
  return sources;
}

// Buffers whose only consumer is CPU-side. Each entry must name the consumer,
// so an unread buffer cannot be parked here without an explicit claim that is
// itself checkable by reading the named file.
const CPU_CONSUMED_BUFFERS = Object.freeze({});

describe("raymarch GPU buffer wiring", () => {
  it("reads every uploaded modal buffer from a shader or a named CPU consumer", () => {
    const runtimeState = createRuntimeState();
    // The modal packet is sampled by the field cache bake now, not by the
    // march: the march reads the baked atlas. So the bindings that matter are
    // the ones the bake compiled against.
    const bindings = runtimeState.fieldCache.modalResourceBindings;
    expect(bindings).toBeTruthy();

    // The shader-side readers. A binding that is passed but never sampled is
    // still unwired, so receiving the uniforms is not sufficient evidence.
    const shaderSource = [
      readSource("./fieldCacheBake.js"),
      readSource("./radiationPotentialObservation.js"),
    ].join("\n");

    const bufferKeys = Object.keys(runtimeState).filter(
      (key) => key.endsWith("Buffer") && runtimeState[key]?.uniforms,
    );
    expect(bufferKeys.length).toBeGreaterThan(0);

    const unwired = [];
    for (const bufferKey of bufferKeys) {
      const cpuConsumer = CPU_CONSUMED_BUFFERS[bufferKey];
      if (cpuConsumer) {
        // Verify the claim rather than trusting the allowlist.
        expect(readSource(cpuConsumer.consumer)).toContain(cpuConsumer.token);
        continue;
      }

      const bindingName = `${bufferKey.slice(0, -"Buffer".length)}Uniforms`;
      const boundIdentity = bindings[bindingName];
      const sampled = shaderSource.includes(`${bindingName}.element(`);
      // Identity, not name matching: this proves the buffer the runtime uploads
      // is the same object the material compiled against.
      if (boundIdentity !== runtimeState[bufferKey].uniforms || !sampled) {
        unwired.push({
          buffer: bufferKey,
          bound: boundIdentity === runtimeState[bufferKey].uniforms,
          sampled,
        });
      }
    }

    expect(unwired).toEqual([]);
  });

  it("uploads nothing that no consumer reads", () => {
    // Complements the check above from the other direction: the upload owner
    // must not mark a buffer for GPU upload unless that buffer is wired.
    const uploadSource = readSource("./runtimeModalUpload.js");
    const runtimeState = createRuntimeState();
    const bindings = runtimeState.fieldCache.modalResourceBindings;
    const shaderSource = [
      readSource("./fieldCacheBake.js"),
      readSource("./radiationPotentialObservation.js"),
    ].join("\n");

    const uploadedButUnread = [];
    for (const key of Object.keys(runtimeState)) {
      if (!key.endsWith("Buffer") || !runtimeState[key]?.uniforms) {
        continue;
      }
      if (!uploadSource.includes(`runtimeState.${key}`)) {
        continue;
      }
      if (CPU_CONSUMED_BUFFERS[key]) {
        continue;
      }
      const bindingName = `${key.slice(0, -"Buffer".length)}Uniforms`;
      const wired =
        bindings[bindingName] === runtimeState[key].uniforms &&
        shaderSource.includes(`${bindingName}.element(`);
      if (!wired) {
        uploadedButUnread.push(key);
      }
    }

    expect(uploadedButUnread).toEqual([]);
  });
});

describe("raymarch diagnostic wiring", () => {
  it("sources every published diagnostic from a runtime property that has a writer", () => {
    const diagnosticsSource = readSource("./runtimeDiagnostics.js");
    const runtimeState = createRuntimeState();

    const readProperties = new Set(
      Array.from(
        diagnosticsSource.matchAll(/runtimeState\.([A-Za-z_][A-Za-z0-9_]*)/g),
        (match) => match[1],
      ),
    );
    expect(readProperties.size).toBeGreaterThan(0);

    // A property is written if setup produces it or some owner assigns it.
    // Anything else is read-only-forever and can only ever yield its fallback,
    // which is indistinguishable from a real measurement of zero.
    //
    // Writers legitimately live outside the engine — the app shell sets audit
    // and probe flags — so the search covers both source trees rather than a
    // hand-listed set of files that would drift.
    const engineSources = collectSources([
      new URL("../../", import.meta.url),
      new URL("../../../../app-shell/src/", import.meta.url),
    ]);

    const writerless = [];
    for (const property of readProperties) {
      if (Object.hasOwn(runtimeState, property)) {
        continue;
      }
      const assigned = engineSources.some((source) =>
        new RegExp(`runtimeState\\.${property}\\s*(?:=[^=]|\\?\\?=|\\+=)`).test(
          source,
        ),
      );
      if (!assigned) {
        writerless.push(property);
      }
    }

    expect(writerless).toEqual([]);
  });
});
