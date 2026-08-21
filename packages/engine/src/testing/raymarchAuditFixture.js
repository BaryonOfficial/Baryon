const FIXTURE_KIND = "baryon-raymarch-audit-fixture/v6";
const FIXTURE_PHASES = Object.freeze({
  idle: "idle",
  installing: "installing",
  installed: "installed",
  tearingDown: "tearing-down",
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_BASE_AOVS = Object.freeze([
  "baseRadiance",
  "transmittance",
  "coverage",
]);
const REQUIRED_CURRENT_AOVS = Object.freeze([
  ...REQUIRED_BASE_AOVS,
  "accentRadiance",
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid raymarch audit fixture: ${message}`);
  }
}

function assertPlainObject(value, path) {
  assert(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    `${path} must be a plain object`,
  );
}

function assertExactKeys(value, path, expectedKeys) {
  assertPlainObject(value, path);
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  assert(
    actualKeys.length === sortedExpectedKeys.length &&
      actualKeys.every((key, index) => key === sortedExpectedKeys[index]),
    `${path} keys must be exactly ${sortedExpectedKeys.join(", ")}`,
  );
}

function assertFinite(value, path, { min = -Infinity, max = Infinity } = {}) {
  assert(Number.isFinite(value), `${path} must be finite`);
  assert(value >= min && value <= max, `${path} is outside [${min}, ${max}]`);
}

function assertInteger(value, path, { min = 0, max = Infinity } = {}) {
  assert(Number.isInteger(value), `${path} must be an integer`);
  assert(value >= min && value <= max, `${path} is outside [${min}, ${max}]`);
}

function assertString(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return;
  assert(
    typeof value === "string" && value.length > 0,
    `${path} must be a string`,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function cloneFixtureValue(value) {
  if (Array.isArray(value)) return value.map(cloneFixtureValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        cloneFixtureValue(child),
      ]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

async function digestSha256(bytes) {
  const subtle = globalThis.crypto?.subtle;
  assert(subtle, "Web Crypto SHA-256 is unavailable");
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashRaymarchAuditNumericArray(values) {
  assert(Array.isArray(values), "typed array values must be an array");
  const bytes = new Uint8Array(values.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    assertFinite(values[index], `typed array values[${index}]`);
    view.setFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      values[index],
      true,
    );
  }
  return digestSha256(bytes);
}

async function hashRaymarchAuditFixtureDescriptor(descriptor) {
  return digestSha256(new TextEncoder().encode(canonicalJson(descriptor)));
}

async function validateNumericArray(value, path, expectedElementCount) {
  assertExactKeys(value, path, ["values", "elementCount", "sha256"]);
  assertInteger(value.elementCount, `${path}.elementCount`);
  assert(
    value.elementCount === expectedElementCount,
    `${path}.elementCount must be ${expectedElementCount}`,
  );
  assert(Array.isArray(value.values), `${path}.values must be an array`);
  assert(
    value.values.length === value.elementCount,
    `${path}.values length does not match elementCount`,
  );
  value.values.forEach((entry, index) =>
    assertFinite(entry, `${path}.values[${index}]`),
  );
  assert(
    typeof value.sha256 === "string" && SHA256_PATTERN.test(value.sha256),
    `${path}.sha256 must be a lowercase SHA-256 digest`,
  );
  const actualHash = await hashRaymarchAuditNumericArray(value.values);
  assert(actualHash === value.sha256, `${path}.sha256 does not match values`);
}

function validateCheckpoint(checkpoint) {
  assertExactKeys(checkpoint, "checkpoint", ["mode", "decisionManifestSha256"]);
  assert(
    ["base", "current", "integrated"].includes(checkpoint.mode),
    "checkpoint.mode is unsupported",
  );
  if (checkpoint.decisionManifestSha256 !== null) {
    assert(
      SHA256_PATTERN.test(checkpoint.decisionManifestSha256),
      "checkpoint.decisionManifestSha256 must be null or a SHA-256 digest",
    );
  }
}

async function validateModal(modal) {
  assertExactKeys(modal, "modal", [
    "fieldAuthority",
    "activeModeCount",
    "capacity",
    "identitySlots",
    "coefficientSlots",
    "phaseSlots",
    "spectralMomentSlots",
    "metadataSlots",
  ]);
  assert(
    modal.fieldAuthority === "complete",
    "modal.fieldAuthority must be complete",
  );
  assertInteger(modal.capacity, "modal.capacity", { min: 1 });
  assertInteger(modal.activeModeCount, "modal.activeModeCount", {
    max: modal.capacity,
  });
  await validateNumericArray(
    modal.identitySlots,
    "modal.identitySlots",
    modal.capacity * 3,
  );
  await validateNumericArray(
    modal.coefficientSlots,
    "modal.coefficientSlots",
    modal.capacity,
  );
  const elementCount = modal.capacity * 4;
  await Promise.all(
    ["phaseSlots", "spectralMomentSlots", "metadataSlots"].map((key) =>
      validateNumericArray(modal[key], `modal.${key}`, elementCount),
    ),
  );
}

function validateDomain(domain) {
  assertExactKeys(domain, "domain", [
    "radius",
    "boundaryMode",
    "cavityGeometry",
    "volumeShape",
  ]);
  assertFinite(domain.radius, "domain.radius", { min: Number.EPSILON });
  assertString(domain.boundaryMode, "domain.boundaryMode");
  assertString(domain.cavityGeometry, "domain.cavityGeometry");
  assertString(domain.volumeShape, "domain.volumeShape");
}

function validateTransport(transport, checkpointMode) {
  assertExactKeys(transport, "transport", [
    "mode",
    "apparatusIdentity",
    "cacheIdentity",
    "expectedDispatchCount",
    "prototype",
  ]);
  const expectedMode = checkpointMode === "base" ? "off" : checkpointMode;
  assert(
    transport.mode === expectedMode,
    `transport.mode must be ${expectedMode}`,
  );
  assertString(transport.apparatusIdentity, "transport.apparatusIdentity", {
    nullable: true,
  });
  assertString(transport.cacheIdentity, "transport.cacheIdentity", {
    nullable: true,
  });
  assertInteger(
    transport.expectedDispatchCount,
    "transport.expectedDispatchCount",
  );
  if (checkpointMode === "base") {
    assert(
      transport.expectedDispatchCount === 0,
      "base transport dispatch count must be zero",
    );
    assert(
      transport.prototype === null,
      "base transport prototype must be null",
    );
  } else if (checkpointMode === "current") {
    assert(
      transport.prototype === null,
      "current transport prototype must be null",
    );
    assertString(transport.apparatusIdentity, "transport.apparatusIdentity");
    // A cache identity names a dispatch-based transport cache. The analytic
    // apparatus dispatches nothing and owns no cache, so the identity is
    // exactly as present as the cache itself.
    if (transport.expectedDispatchCount > 0) {
      assertString(transport.cacheIdentity, "transport.cacheIdentity");
    } else {
      assert(
        transport.cacheIdentity === null,
        "transport.cacheIdentity must be null without transport dispatches",
      );
    }
  } else {
    assertPlainObject(transport.prototype, "transport.prototype");
  }
}

function validateSpectral(spectral) {
  assertExactKeys(spectral, "spectral", ["colorMode", "spectralChroma"]);
  assertString(spectral.colorMode, "spectral.colorMode");
  assertFinite(spectral.spectralChroma, "spectral.spectralChroma", {
    min: 0,
    max: 1,
  });
}

async function validateCamera(camera) {
  assertExactKeys(camera, "camera", [
    "viewPreset",
    "viewMatrix",
    "projectionMatrix",
    "viewport",
  ]);
  assertString(camera.viewPreset, "camera.viewPreset");
  await validateNumericArray(camera.viewMatrix, "camera.viewMatrix", 16);
  await validateNumericArray(
    camera.projectionMatrix,
    "camera.projectionMatrix",
    16,
  );
  assertExactKeys(camera.viewport, "camera.viewport", [
    "width",
    "height",
    "dpr",
  ]);
  assertInteger(camera.viewport.width, "camera.viewport.width", { min: 1 });
  assertInteger(camera.viewport.height, "camera.viewport.height", { min: 1 });
  assertFinite(camera.viewport.dpr, "camera.viewport.dpr", {
    min: Number.EPSILON,
  });
}

function validateMaterial(material) {
  assertExactKeys(material, "material", [
    "densityGain",
    "plasmaRadianceGain",
    "plasmaExtinctionCoefficient",
    "plasmaEmissionCoefficient",
    "plasmaContinuitySpineRadiancePerExtinctionLimit",
    "plasmaDetailSpineRadiancePerExtinctionLimit",
    "plasmaBodyRadiancePerExtinctionLimit",
    "observerFineApertureFwhmWorld",
    "observerTopologyApertureFwhmWorld",
    "observerFineResidualScaleWorld",
    "observerFineResidualDetailLimit",
    "observerSheetFwhmWorld",
    "deterministicSeed",
  ]);
  for (const key of [
    "densityGain",
    "plasmaRadianceGain",
    "plasmaExtinctionCoefficient",
    "plasmaEmissionCoefficient",
    "plasmaContinuitySpineRadiancePerExtinctionLimit",
    "plasmaDetailSpineRadiancePerExtinctionLimit",
    "plasmaBodyRadiancePerExtinctionLimit",
    "observerFineApertureFwhmWorld",
    "observerTopologyApertureFwhmWorld",
    "observerFineResidualScaleWorld",
    "observerFineResidualDetailLimit",
    "observerSheetFwhmWorld",
  ]) {
    assertFinite(material[key], `material.${key}`, { min: 0 });
  }
  assertInteger(material.deterministicSeed, "material.deterministicSeed");
}

function validateOutput(output, checkpointMode) {
  assertExactKeys(output, "output", [
    "volumeKernelIdentity",
    "stepControllerIdentity",
    "attachmentFormat",
    "aovIdentities",
    "width",
    "height",
    "raymarchSteps",
  ]);
  assertString(output.volumeKernelIdentity, "output.volumeKernelIdentity");
  assertString(output.stepControllerIdentity, "output.stepControllerIdentity");
  assertString(output.attachmentFormat, "output.attachmentFormat");
  assert(
    Array.isArray(output.aovIdentities),
    "output.aovIdentities must be an array",
  );
  output.aovIdentities.forEach((value, index) =>
    assertString(value, `output.aovIdentities[${index}]`),
  );
  assert(
    new Set(output.aovIdentities).size === output.aovIdentities.length,
    "output.aovIdentities must be unique",
  );
  const requiredAovs =
    checkpointMode === "current" ? REQUIRED_CURRENT_AOVS : REQUIRED_BASE_AOVS;
  for (const identity of requiredAovs) {
    assert(
      output.aovIdentities.includes(identity),
      `${checkpointMode} output is missing ${identity}`,
    );
  }
  if (checkpointMode === "base") {
    assert(
      !output.aovIdentities.includes("accentRadiance"),
      "base output may not declare an accent attachment",
    );
  }
  assertInteger(output.width, "output.width", { min: 1 });
  assertInteger(output.height, "output.height", { min: 1 });
  assertInteger(output.raymarchSteps, "output.raymarchSteps", { min: 1 });
}

function validatePost(post, checkpointMode) {
  assertExactKeys(post, "post", [
    "toneMapping",
    "exposure",
    "bloomEnabled",
    "opticalPsfEnabled",
  ]);
  assertString(post.toneMapping, "post.toneMapping");
  assertFinite(post.exposure, "post.exposure", { min: 0 });
  assert(
    typeof post.bloomEnabled === "boolean",
    "post.bloomEnabled must be boolean",
  );
  assert(
    typeof post.opticalPsfEnabled === "boolean",
    "post.opticalPsfEnabled must be boolean",
  );
  if (checkpointMode === "base") {
    assert(post.bloomEnabled === false, "base bloom must be disabled");
  }
}

export async function validateRaymarchAuditFixtureDescriptor(descriptor) {
  assertExactKeys(descriptor, "descriptor", [
    "kind",
    "descriptorId",
    "checkpoint",
    "modal",
    "phase",
    "domain",
    "transport",
    "spectral",
    "camera",
    "material",
    "output",
    "post",
  ]);
  assert(descriptor.kind === FIXTURE_KIND, `kind must be ${FIXTURE_KIND}`);
  assertString(descriptor.descriptorId, "descriptorId");
  validateCheckpoint(descriptor.checkpoint);
  await validateModal(descriptor.modal);
  assertExactKeys(descriptor.phase, "phase", [
    "evaluationTimeSec",
    "authority",
  ]);
  assertFinite(descriptor.phase.evaluationTimeSec, "phase.evaluationTimeSec");
  assertFinite(descriptor.phase.authority, "phase.authority", {
    min: 0,
    max: 1,
  });
  validateDomain(descriptor.domain);
  validateTransport(descriptor.transport, descriptor.checkpoint.mode);
  validateSpectral(descriptor.spectral);
  await validateCamera(descriptor.camera);
  validateMaterial(descriptor.material);
  validateOutput(descriptor.output, descriptor.checkpoint.mode);
  validatePost(descriptor.post, descriptor.checkpoint.mode);
  const normalizedDescriptor = deepFreeze(cloneFixtureValue(descriptor));
  return {
    descriptor: normalizedDescriptor,
    descriptorHash:
      await hashRaymarchAuditFixtureDescriptor(normalizedDescriptor),
  };
}

function buildCheckpointAovIdentities(sourceIdentities, checkpointMode) {
  if (!Array.isArray(sourceIdentities)) {
    return sourceIdentities;
  }
  const identities = sourceIdentities.filter(
    (identity) => identity !== "accentRadiance",
  );
  if (checkpointMode === "current") {
    identities.push("accentRadiance");
  }
  return identities;
}

/**
 * Assembles and validates a frozen-field descriptor from plain runtime
 * sources (as returned by the runtime adapter's readFrozenDescriptorSources).
 * The sources carry no schema knowledge; the fixture kind, exact key sets,
 * and typed-array hashes are owned here so production code never embeds them.
 *
 * @param {any} sources
 * @param {{
 *   descriptorId?: string,
 *   viewPreset?: string,
 *   deterministicSeed?: number,
 *   checkpointMode?: string,
 *   decisionManifestSha256?: string | null,
 * }} [options]
 * @returns {Promise<{descriptor: any, descriptorHash: string}>}
 */
export async function buildRaymarchAuditFixtureDescriptorFromSources(
  sources,
  {
    descriptorId,
    viewPreset = "front",
    deterministicSeed = 0,
    checkpointMode = "base",
    decisionManifestSha256 = null,
  } = {},
) {
  assertPlainObject(sources, "sources");
  assertString(descriptorId, "descriptorId");
  assert(
    checkpointMode === "base" || checkpointMode === "current",
    "buildRaymarchAuditFixtureDescriptorFromSources supports base and current checkpoints only",
  );
  const numericArray = async (values, path) => {
    assert(
      Array.isArray(values) || ArrayBuffer.isView(values),
      `${path} must be an array of numbers`,
    );
    const plainValues = Array.from(values);
    return {
      values: plainValues,
      elementCount: plainValues.length,
      sha256: await hashRaymarchAuditNumericArray(plainValues),
    };
  };

  const modal = sources.modal ?? {};
  const descriptor = {
    kind: FIXTURE_KIND,
    descriptorId,
    checkpoint: { mode: checkpointMode, decisionManifestSha256 },
    modal: {
      fieldAuthority: "complete",
      activeModeCount: modal.activeModeCount,
      capacity: modal.capacity,
      identitySlots: await numericArray(
        modal.identitySlots,
        "sources.modal.identitySlots",
      ),
      coefficientSlots: await numericArray(
        modal.coefficientSlots,
        "sources.modal.coefficientSlots",
      ),
      phaseSlots: await numericArray(
        modal.phaseSlots,
        "sources.modal.phaseSlots",
      ),
      spectralMomentSlots: await numericArray(
        modal.spectralMomentSlots,
        "sources.modal.spectralMomentSlots",
      ),
      metadataSlots: await numericArray(
        modal.metadataSlots,
        "sources.modal.metadataSlots",
      ),
    },
    phase: {
      evaluationTimeSec: sources.phase?.evaluationTimeSec,
      authority: sources.phase?.authority,
    },
    domain: {
      radius: sources.domain?.radius,
      boundaryMode: sources.domain?.boundaryMode,
      cavityGeometry: sources.domain?.cavityGeometry,
      volumeShape: sources.domain?.volumeShape,
    },
    transport:
      checkpointMode === "current"
        ? {
            mode: "current",
            apparatusIdentity: sources.transport?.apparatusIdentity,
            cacheIdentity: sources.transport?.cacheIdentity,
            expectedDispatchCount: sources.transport?.expectedDispatchCount,
            prototype: null,
          }
        : {
            mode: "off",
            apparatusIdentity: null,
            cacheIdentity: null,
            expectedDispatchCount: 0,
            prototype: null,
          },
    spectral: {
      colorMode: sources.spectral?.colorMode,
      spectralChroma: sources.spectral?.spectralChroma,
    },
    camera: {
      viewPreset,
      viewMatrix: await numericArray(
        sources.camera?.viewMatrix,
        "sources.camera.viewMatrix",
      ),
      projectionMatrix: await numericArray(
        sources.camera?.projectionMatrix,
        "sources.camera.projectionMatrix",
      ),
      viewport: {
        width: sources.camera?.viewport?.width,
        height: sources.camera?.viewport?.height,
        dpr: sources.camera?.viewport?.dpr,
      },
    },
    material: {
      densityGain: sources.material?.densityGain,
      plasmaRadianceGain: sources.material?.plasmaRadianceGain,
      plasmaExtinctionCoefficient:
        sources.material?.plasmaExtinctionCoefficient,
      plasmaEmissionCoefficient: sources.material?.plasmaEmissionCoefficient,
      plasmaContinuitySpineRadiancePerExtinctionLimit:
        sources.material?.plasmaContinuitySpineRadiancePerExtinctionLimit,
      plasmaDetailSpineRadiancePerExtinctionLimit:
        sources.material?.plasmaDetailSpineRadiancePerExtinctionLimit,
      plasmaBodyRadiancePerExtinctionLimit:
        sources.material?.plasmaBodyRadiancePerExtinctionLimit,
      observerFineApertureFwhmWorld:
        sources.material?.observerFineApertureFwhmWorld,
      observerTopologyApertureFwhmWorld:
        sources.material?.observerTopologyApertureFwhmWorld,
      observerFineResidualScaleWorld:
        sources.material?.observerFineResidualScaleWorld,
      observerFineResidualDetailLimit:
        sources.material?.observerFineResidualDetailLimit,
      observerSheetFwhmWorld: sources.material?.observerSheetFwhmWorld,
      deterministicSeed,
    },
    output: {
      volumeKernelIdentity: sources.output?.volumeKernelIdentity,
      stepControllerIdentity: sources.output?.stepControllerIdentity,
      attachmentFormat: sources.output?.attachmentFormat,
      aovIdentities: buildCheckpointAovIdentities(
        sources.output?.aovIdentities,
        checkpointMode,
      ),
      width: sources.output?.width,
      height: sources.output?.height,
      raymarchSteps: sources.output?.raymarchSteps,
    },
    post: {
      toneMapping: sources.post?.toneMapping,
      exposure: sources.post?.exposure,
      bloomEnabled: sources.post?.bloomEnabled,
      opticalPsfEnabled: sources.post?.opticalPsfEnabled,
    },
  };
  return validateRaymarchAuditFixtureDescriptor(descriptor);
}

function validateAdapter(adapter) {
  assertPlainObject(adapter, "adapter");
  for (const method of [
    "snapshotCanonicalState",
    "suspendProducers",
    "installDescriptor",
    "awaitCheckpointReady",
    "readSeal",
    "readCurrentSeal",
    "exportBuffers",
    "clearFixtureState",
    "restoreCanonicalState",
    "awaitFreshAuthoritativePacket",
  ]) {
    assert(
      typeof adapter[method] === "function",
      `adapter.${method} is required`,
    );
  }
}

function normalizeSeal(seal, descriptorHash) {
  assertPlainObject(seal, "seal");
  assert(
    seal.descriptorHash === descriptorHash,
    "seal descriptor hash mismatch",
  );
  for (const key of [
    "modalGeneration",
    "fieldGeneration",
    "spectralGeneration",
    "aovGeneration",
    "transportDispatchCount",
    "producerEpoch",
  ]) {
    assertInteger(seal[key], `seal.${key}`);
  }
  assertFinite(seal.phaseEvaluationTimeSec, "seal.phaseEvaluationTimeSec");
  assertString(seal.kernelIdentity, "seal.kernelIdentity");
  if (seal.transportGeneration !== null) {
    assertInteger(seal.transportGeneration, "seal.transportGeneration");
  }
  return deepFreeze(cloneFixtureValue(seal));
}

/**
 * @typedef {object} RaymarchAuditFixtureAdapter
 * @property {(input?: any) => Promise<any>} snapshotCanonicalState
 * @property {(input?: any) => Promise<any>} suspendProducers
 * @property {(input?: any) => Promise<any>} installDescriptor
 * @property {(input?: any) => Promise<any>} awaitCheckpointReady
 * @property {(input?: any) => Promise<any>} readSeal
 * @property {(input?: any) => Promise<any>} readCurrentSeal
 * @property {(input?: any) => Promise<any>} exportBuffers
 * @property {(input?: any) => Promise<any>} clearFixtureState
 * @property {(input?: any) => Promise<any>} restoreCanonicalState
 * @property {(input?: any) => Promise<any>} awaitFreshAuthoritativePacket
 */

/**
 * @param {{
 *   adapter: RaymarchAuditFixtureAdapter,
 *   allowedCheckpointModes?: string[],
 *   authorizeIntegrated?: (input: {descriptor: any, descriptorHash: string}) => Promise<boolean>,
 * }} options
 */
export function createRaymarchAuditFixtureController({
  adapter,
  allowedCheckpointModes = ["base"],
  authorizeIntegrated = async () => false,
}) {
  validateAdapter(adapter);
  const allowedModes = new Set(allowedCheckpointModes);
  /** @type {string} */
  let phase = FIXTURE_PHASES.idle;
  /** @type {any} */
  let descriptor = null;
  /** @type {string | null} */
  let descriptorHash = null;
  /** @type {any} */
  let canonicalSnapshot = null;
  /** @type {any} */
  let installedSeal = null;
  /** @type {string | null} */
  let invalidReason = null;

  function status() {
    return Object.freeze({
      phase,
      descriptorId: descriptor?.descriptorId ?? null,
      checkpointMode: descriptor?.checkpoint?.mode ?? null,
      descriptorHash,
      captureAllowed:
        phase === FIXTURE_PHASES.installed && invalidReason === null,
      invalidReason,
      seal: installedSeal,
    });
  }

  async function rollbackInstall(error) {
    try {
      await adapter.clearFixtureState();
    } finally {
      if (canonicalSnapshot !== null) {
        await adapter.restoreCanonicalState(canonicalSnapshot);
        await adapter.awaitFreshAuthoritativePacket(canonicalSnapshot);
      }
      phase = FIXTURE_PHASES.idle;
      descriptor = null;
      descriptorHash = null;
      canonicalSnapshot = null;
      installedSeal = null;
      invalidReason = null;
    }
    throw error;
  }

  async function install(candidateDescriptor) {
    assert(phase === FIXTURE_PHASES.idle, "install is legal only while idle");
    const validated =
      await validateRaymarchAuditFixtureDescriptor(candidateDescriptor);
    const checkpointMode = validated.descriptor.checkpoint.mode;
    assert(
      allowedModes.has(checkpointMode),
      `${checkpointMode} checkpoint is not enabled`,
    );
    if (checkpointMode === "integrated") {
      const authorized = await authorizeIntegrated({
        descriptor: validated.descriptor,
        descriptorHash: validated.descriptorHash,
      });
      assert(
        authorized === true,
        "integrated checkpoint lacks proceed-integration authority",
      );
    }

    phase = FIXTURE_PHASES.installing;
    descriptor = validated.descriptor;
    descriptorHash = validated.descriptorHash;
    try {
      canonicalSnapshot = await adapter.snapshotCanonicalState();
      await adapter.suspendProducers({ descriptor, descriptorHash });
      await adapter.installDescriptor({ descriptor, descriptorHash });
      const readiness = await adapter.awaitCheckpointReady({
        descriptor,
        descriptorHash,
      });
      assert(readiness?.ready === true, "checkpoint did not become ready");
      installedSeal = normalizeSeal(
        await adapter.readSeal({ descriptor, descriptorHash }),
        descriptorHash,
      );
      phase = FIXTURE_PHASES.installed;
      return status();
    } catch (error) {
      return rollbackInstall(error);
    }
  }

  async function assertSealed() {
    assert(phase === FIXTURE_PHASES.installed, "fixture is not installed");
    if (invalidReason !== null) throw new Error(invalidReason);
    const currentSeal = normalizeSeal(
      await adapter.readCurrentSeal({ descriptor, descriptorHash }),
      descriptorHash,
    );
    if (canonicalJson(currentSeal) !== canonicalJson(installedSeal)) {
      invalidReason = "Installed raymarch audit fixture seal drifted";
      throw new Error(invalidReason);
    }
    return status();
  }

  async function exportBuffers() {
    await assertSealed();
    const exported = await adapter.exportBuffers({
      descriptor,
      descriptorHash,
      seal: installedSeal,
    });
    await assertSealed();
    return exported;
  }

  async function teardown() {
    assert(
      phase === FIXTURE_PHASES.installed,
      "teardown requires an installed fixture",
    );
    phase = FIXTURE_PHASES.tearingDown;
    invalidReason = invalidReason ?? "Fixture teardown in progress";
    try {
      await adapter.clearFixtureState();
      await adapter.restoreCanonicalState(canonicalSnapshot);
      await adapter.awaitFreshAuthoritativePacket(canonicalSnapshot);
    } finally {
      phase = FIXTURE_PHASES.idle;
      descriptor = null;
      descriptorHash = null;
      canonicalSnapshot = null;
      installedSeal = null;
      invalidReason = null;
    }
    return status();
  }

  return Object.freeze({
    install,
    status,
    assertSealed,
    exportBuffers,
    teardown,
  });
}
