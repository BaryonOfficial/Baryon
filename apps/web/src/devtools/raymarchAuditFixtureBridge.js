import {
  buildRaymarchAuditFixtureDescriptorFromSources,
  createRaymarchAuditFixtureController,
} from "@baryon/engine/testing/raymarchAuditFixture";

const RUNTIME_ADAPTER_KEY = "__baryonRaymarchAuditFixtureRuntimeAdapter";

/**
 * @typedef {object} RaymarchAuditSnapshotOptions
 * @property {string} [descriptorId]
 * @property {string} [viewPreset]
 * @property {number} [deterministicSeed]
 * @property {Record<string, unknown> | null} [output]
 * @property {"base" | "current"} [checkpointMode]
 * @property {string | null} [decisionManifestSha256]
 */

function readRuntimeAdapter() {
  const adapter = window[RUNTIME_ADAPTER_KEY];
  if (!adapter) {
    throw new Error(
      "The Baryon raymarch audit runtime is not ready on the active canvas.",
    );
  }
  return adapter;
}

export function installRaymarchAuditFixtureBridge() {
  if (!import.meta.env.DEV) {
    throw new Error("The raymarch audit fixture bridge is development-only.");
  }

  let controller = null;
  function getController() {
    const adapter = readRuntimeAdapter();
    if (!controller || controller.runtimeAdapter !== adapter) {
      // Checkpoint C is unlocked: the harness verifies the signed
      // approve-base decision before installing current-mode descriptors.
      const nextController = createRaymarchAuditFixtureController({
        adapter,
        allowedCheckpointModes: ["base", "current"],
      });
      controller = Object.freeze({
        runtimeAdapter: adapter,
        api: nextController,
      });
    }
    return controller.api;
  }

  const command = Object.freeze({
    /** @param {RaymarchAuditSnapshotOptions} [options] */
    async snapshotDescriptor(
      {
        descriptorId,
        viewPreset = "front",
        deterministicSeed = 0,
        output = null,
        checkpointMode = "base",
        decisionManifestSha256 = null,
      } = /** @type {RaymarchAuditSnapshotOptions} */ ({}),
    ) {
      const sources = await readRuntimeAdapter().readFrozenDescriptorSources();
      const mergedSources = output
        ? { ...sources, output: { ...sources.output, ...output } }
        : sources;
      return buildRaymarchAuditFixtureDescriptorFromSources(mergedSources, {
        descriptorId,
        viewPreset,
        deterministicSeed,
        checkpointMode,
        decisionManifestSha256,
      });
    },
    install(descriptor) {
      return getController().install(descriptor);
    },
    status() {
      return (
        controller?.api.status() ?? {
          phase: "idle",
          descriptorId: null,
          checkpointMode: null,
          descriptorHash: null,
          captureAllowed: false,
          invalidReason: window[RUNTIME_ADAPTER_KEY]
            ? null
            : "active-canvas-runtime-unavailable",
          seal: null,
        }
      );
    },
    assertSealed() {
      return getController().assertSealed();
    },
    exportBuffers() {
      return getController().exportBuffers();
    },
    teardown() {
      return getController().teardown();
    },
  });

  window.__baryonAuditFixture = command;
  return () => {
    if (window.__baryonAuditFixture === command) {
      delete window.__baryonAuditFixture;
    }
  };
}
