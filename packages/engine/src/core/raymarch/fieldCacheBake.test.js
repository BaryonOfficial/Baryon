import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { float, uniform } from "three/tsl";
import { createModalFieldCache } from "./fieldCacheBake.js";
import { CYMATIC_OBSERVER_REFERENCE } from "./cymaticObserverReference.js";
import { FIELD_CACHE_DOMAINS } from "./fieldCacheGeometry.js";

function createCache(options = {}) {
  return createModalFieldCache({
    radius: uniform(3),
    evaluateAperture: () => ({
      finePotential: float(0),
      fineEnergy: float(0),
      fineSupport: float(0),
      topologyPotential: float(0),
      fineSpectralFirstMoment: null,
      fineSpectralSecondMoment: null,
    }),
    ...options,
  });
}

const renderer = {
  getRenderTarget: () => null,
  setRenderTarget: () => {},
  render: () => {},
};

const validBakeOptions = Object.freeze({
  boundaryMode: "neumann",
  volumeShape: "sphere",
  observationTimeSeconds: 0,
  observationAdvancing: false,
  geometryExposureSeconds: CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
  observationResetToken: "test-observer",
  observationCheckpointKey: null,
  modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
});

describe("modal field cache bake contract", () => {
  it("compiles the actual observer attachment variants without drawing or seeding history", async () => {
    const cache = createCache();
    let target = { initial: true };
    const initialMrt = { previous: true };
    let activeMrt = initialMrt;
    const initial = target,
      compile = vi.fn(async () => {
        expect(activeMrt).toBeNull();
      }),
      draw = vi.fn();
    const preparingRenderer = {
      initialized: true,
      getRenderTarget: () => target,
      setRenderTarget: (next) => {
        target = next;
      },
      getMRT: () => activeMrt,
      setMRT: (next) => {
        activeMrt = next;
      },
      compileAsync: compile,
      render: draw,
    };
    const before = cache.getObserverState();
    try {
      await cache.compile(preparingRenderer);
      expect(compile.mock.calls.length).toBeGreaterThan(5);
      expect(draw).not.toHaveBeenCalled();
      expect(cache.getObserverState()).toEqual(before);
      expect(cache.getObserverState().hasHistory).toBe(false);
      expect(target).toBe(initial);
      expect(activeMrt).toBe(initialMrt);
    } finally {
      cache.dispose();
    }
  });

  it("disposal stops shader preparation after the current compile settles", async () => {
    const cache = createCache();
    let finish;
    const compileAsync = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = cache.compile({
      ...renderer,
      initialized: true,
      compileAsync,
    });
    cache.dispose();
    finish();
    await pending;
    expect(compileAsync).toHaveBeenCalledOnce();
    expect(cache.getObserverState().hasHistory).toBe(false);
  });

  it("rebinds only replaced aperture resources and allocates no raw Float32 copy or blur targets", async () => {
    let revision = 0;
    const resolved = [],
      targets = new Set();
    const cache = createCache({ getApertureRevision: () => revision });
    const preparingRenderer = {
      ...renderer,
      initialized: true,
      setRenderTarget(target) {
        if (target) targets.add(target);
      },
      compileAsync: vi.fn(async (object) => {
        if (object.material.name === "BaryonFieldCacheResolveMaterial")
          resolved.push(object.material);
      }),
      render: vi.fn(),
    };
    try {
      const before = cache.getObserverState();
      await cache.compile(preparingRenderer);
      const dispose = vi.fn();
      resolved[0].addEventListener("dispose", dispose);
      await cache.compile(preparingRenderer);
      expect(resolved[1]).toBe(resolved[0]);
      expect(dispose).not.toHaveBeenCalled();
      revision++;
      await cache.compile(preparingRenderer);
      expect(resolved[2]).not.toBe(resolved[0]);
      expect(dispose).toHaveBeenCalledOnce();
      expect(
        [...targets]
          .flatMap((target) => target.textures)
          .some((texture) => texture.type === THREE.FloatType),
      ).toBe(false);
      expect(cache.getObserverState()).toEqual(before);
      expect(preparingRenderer.render).not.toHaveBeenCalled();
    } finally {
      cache.dispose();
    }
  });

  it("prepares derived source textures only when the observer accepts a new step or reset", () => {
    const work = [];
    const recordingRenderer = {
      ...renderer,
      render() {
        work.push("draw");
      },
    };
    const cache = createCache({
      prepareAperture(activeRenderer) {
        expect(activeRenderer).toBe(recordingRenderer);
        work.push("prepare");
      },
    });
    const options = { ...validBakeOptions, observationAdvancing: true };
    try {
      expect(cache.bake(recordingRenderer, options).baked).toBe(true);
      expect(work[0]).toBe("prepare");
      expect(work.filter((x) => x === "prepare")).toHaveLength(1);
      work.length = 0;
      for (const time of [0, 0.005, 0.01]) {
        expect(
          cache.bake(recordingRenderer, {
            ...options,
            observationTimeSeconds: time,
          }).baked,
        ).toBe(false);
      }
      expect(work).toEqual([]);
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationTimeSeconds: 1 / 60,
        }).baked,
      ).toBe(true);
      expect(work[0]).toBe("prepare");
      expect(work.filter((x) => x === "prepare")).toHaveLength(1);
      work.length = 0;
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationTimeSeconds: 1 / 60,
          observationResetToken: "replacement",
        }).reset,
      ).toBe(true);
      expect(work[0]).toBe("prepare");
      expect(work.filter((x) => x === "prepare")).toHaveLength(1);
    } finally {
      cache.dispose();
    }
  });

  it("always carries explicit geometry availability in the canonical observer layout", () => {
    const cache = createCache();
    const names = [];
    try {
      cache.bake(
        {
          ...renderer,
          setRenderTarget(target) {
            if (target?.textures?.[0]?.name === "geometry")
              names.push(target.textures.map((t) => t.name));
          },
        },
        validBakeOptions,
      );
      expect(names.length).toBeGreaterThan(0);
      for (const lanes of names)
        expect(lanes).toEqual([
          "geometry",
          "appearance",
          "organization",
          "availability",
        ]);
      expect(cache.geometryAvailabilityBytes).toBe(2 * 128 ** 3);
      expect(cache.observerGeometryAvailabilityTexture).not.toBeNull();
    } finally {
      cache.dispose();
    }
  });
  it("keeps availability with the same observer generation through checkpoint replay and reset", () => {
    const cache = createCache({});
    const targets = [];
    const recordingRenderer = {
      ...renderer,
      setRenderTarget(target) {
        if (target?.textures?.[0]?.name === "geometry") targets.push(target);
      },
    };
    const options = {
      ...validBakeOptions,
      observationCheckpointKey: "source-a",
    };
    try {
      expect(cache.geometryAvailabilityBytes).toBe(2 * 128 ** 3);
      expect(cache.bake(recordingRenderer, options)).toMatchObject({
        checkpointSaved: true,
        checkpointRestored: false,
      });
      expect(cache.geometryAvailabilityBytes).toBe(3 * 128 ** 3);
      for (const target of targets) {
        expect(target.textures[3]).toMatchObject({
          name: "availability",
          format: THREE.RedFormat,
          type: THREE.UnsignedByteType,
        });
      }
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationResetToken: "renderer-recovery",
        }),
      ).toMatchObject({ checkpointRestored: true });
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationResetToken: "source-b",
          observationCheckpointKey: "source-b",
        }),
      ).toMatchObject({ checkpointRestored: false, checkpointSaved: true });
      targets.length = 0;
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationResetToken: "source-b",
          observationCheckpointKey: "source-b",
        }),
      ).toMatchObject({ baked: false });
      expect(targets).toHaveLength(0);
    } finally {
      cache.dispose();
    }
  });
  it("bounds GPU work after a long observation gap without replay on the next frame", () => {
    const materials = [];
    const recordingRenderer = {
      ...renderer,
      render(scene) {
        materials.push(scene.children[0]?.material?.name);
      },
    };
    const cache = createCache();
    const options = { ...validBakeOptions, observationAdvancing: true };
    try {
      cache.bake(recordingRenderer, options);
      materials.length = 0;
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationTimeSeconds: 60,
        }),
      ).toMatchObject({ baked: true, reset: true, stepCount: 0 });
      expect(materials).toHaveLength(4);
      expect(materials).toContain("BaryonCymaticObserverSeedMaterial");
      materials.length = 0;
      expect(
        cache.bake(recordingRenderer, {
          ...options,
          observationTimeSeconds: 60,
        }),
      ).toMatchObject({ baked: false, stepCount: 0 });
      expect(materials).toHaveLength(0);
    } finally {
      cache.dispose();
    }
  });
  it("draws every expensive cache and observer pass sparsely before publishing a full observer", () => {
    const rendered = [];
    const recordingRenderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      render(scene) {
        const mesh = scene.children[0];
        rendered.push({
          autoClear: this.autoClear,
          domain: mesh?.geometry?.userData?.fieldCacheDomain,
          material: mesh?.material?.name,
        });
      },
    };
    const cache = createCache();
    try {
      cache.bake(recordingRenderer, validBakeOptions);
      expect(rendered.slice(0, 1)).toEqual([
        {
          autoClear: false,
          domain: FIELD_CACHE_DOMAINS.fundamentalXyz,
          material: "BaryonFieldCacheResolveMaterial",
        },
      ]);
      expect(rendered.slice(1)).toEqual([
        {
          autoClear: false,
          domain: FIELD_CACHE_DOMAINS.fundamentalXyz,
          material: "BaryonCymaticObserverSeedMaterial",
        },
        {
          autoClear: false,
          domain: FIELD_CACHE_DOMAINS.full,
          material: "BaryonObserverSparseExpansionMaterial",
        },
        {
          autoClear: true,
          domain: FIELD_CACHE_DOMAINS.full,
          material: "BaryonObserverOpticalPairMaterial",
        },
      ]);
      expect(recordingRenderer.autoClear).toBe(true);
    } finally {
      cache.dispose();
    }
  });

  it("reuses one sparse observer target and one full observer target for every substep", () => {
    const rendered = [];
    let activeTarget = null;
    const recordingRenderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget(target) {
        activeTarget = target;
      },
      render(scene) {
        const mesh = scene.children[0];
        rendered.push({
          autoClear: this.autoClear,
          domain: mesh?.geometry?.userData?.fieldCacheDomain,
          material: mesh?.material?.name,
          target: activeTarget,
        });
      },
    };
    const cache = createCache();
    const advancing = {
      ...validBakeOptions,
      observationAdvancing: true,
    };
    try {
      cache.bake(recordingRenderer, advancing);
      const seedPasses = rendered.filter(({ material }) =>
        material?.startsWith("BaryonCymaticObserver"),
      );
      expect(seedPasses.map(({ material }) => material)).toEqual([
        "BaryonCymaticObserverSeedMaterial",
      ]);
      const seedExpansion = rendered.find(
        ({ material }) => material === "BaryonObserverSparseExpansionMaterial",
      );

      rendered.length = 0;
      cache.bake(recordingRenderer, {
        ...advancing,
        observationTimeSeconds: 3 / 60,
      });
      const observerPasses = rendered.filter(({ material }) =>
        [
          "BaryonCymaticObserverEvolutionMaterial",
          "BaryonCymaticObserverFinalEvolutionMaterial",
          "BaryonObserverSparseExpansionMaterial",
        ].includes(material),
      );
      expect(
        observerPasses.map(({ material, domain, autoClear }) => ({
          material,
          domain,
          autoClear,
        })),
      ).toEqual([
        {
          material: "BaryonCymaticObserverEvolutionMaterial",
          domain: FIELD_CACHE_DOMAINS.fundamentalXyz,
          autoClear: false,
        },
        {
          material: "BaryonObserverSparseExpansionMaterial",
          domain: FIELD_CACHE_DOMAINS.full,
          autoClear: false,
        },
        {
          material: "BaryonCymaticObserverEvolutionMaterial",
          domain: FIELD_CACHE_DOMAINS.fundamentalXyz,
          autoClear: false,
        },
        {
          material: "BaryonObserverSparseExpansionMaterial",
          domain: FIELD_CACHE_DOMAINS.full,
          autoClear: false,
        },
        {
          material: "BaryonCymaticObserverFinalEvolutionMaterial",
          domain: FIELD_CACHE_DOMAINS.fundamentalXyz,
          autoClear: false,
        },
        {
          material: "BaryonObserverSparseExpansionMaterial",
          domain: FIELD_CACHE_DOMAINS.full,
          autoClear: false,
        },
      ]);

      const sparseTargets = observerPasses
        .filter(({ domain }) => domain === FIELD_CACHE_DOMAINS.fundamentalXyz)
        .map(({ target }) => target);
      const fullTargets = observerPasses
        .filter(
          ({ material }) =>
            material === "BaryonObserverSparseExpansionMaterial",
        )
        .map(({ target }) => target);
      expect(new Set(sparseTargets)).toHaveLength(1);
      expect(new Set(fullTargets)).toHaveLength(1);
      expect(sparseTargets[0]).not.toBe(fullTargets[0]);
      expect(seedPasses[0].target).toBe(sparseTargets[0]);
      expect(seedExpansion.target).toBe(fullTargets[0]);
      expect(recordingRenderer.autoClear).toBe(true);
    } finally {
      cache.dispose();
    }
  });

  it("restores renderer auto-clear and target state when a sparse pass throws", () => {
    const autoClearStates = [];
    const previousTarget = {};
    let activeTarget = previousTarget;
    let renderCount = 0;
    const throwingRenderer = {
      autoClear: true,
      getRenderTarget: () => activeTarget,
      setRenderTarget: (target) => {
        activeTarget = target;
      },
      render() {
        autoClearStates.push(this.autoClear);
        renderCount += 1;
        if (renderCount === 3) {
          throw new Error("synthetic sparse-pass failure");
        }
      },
    };
    const cache = createCache();
    try {
      expect(() => cache.bake(throwingRenderer, validBakeOptions)).toThrow(
        "synthetic sparse-pass failure",
      );
      expect(autoClearStates).toEqual([false, false, false]);
      expect(throwingRenderer.autoClear).toBe(true);
      expect(activeTarget).toBe(previousTarget);
    } finally {
      cache.dispose();
    }
  });

  it("omits prior source inputs from the final observer substep", () => {
    const bakeSource = readFileSync(
      new URL("./fieldCacheBake.js", import.meta.url),
      "utf8",
    );
    const observerSource = readFileSync(
      new URL("./cymaticObserverNode.js", import.meta.url),
      "utf8",
    );
    const finalEvolutionStart = bakeSource.indexOf(
      "const observerFinalEvolution = createCymaticObserverMaterial",
    );
    const checkpointCopyStart = bakeSource.indexOf(
      "const observerCheckpointCopy = createObserverCheckpointCopyMaterial",
    );
    const finalEvolutionConstruction = bakeSource.slice(
      finalEvolutionStart,
      checkpointCopyStart,
    );

    expect(finalEvolutionStart).toBeGreaterThan(-1);
    expect(checkpointCopyStart).toBeGreaterThan(finalEvolutionStart);
    expect(finalEvolutionConstruction).toContain("currentFieldEndpoint: true");
    expect(finalEvolutionConstruction).toContain("currentTopologyFieldTexture");
    expect(finalEvolutionConstruction).toContain(
      "previousTopologyFieldTexture",
    );
    expect(finalEvolutionConstruction).not.toContain("previousSourceTexture");
    expect(finalEvolutionConstruction).not.toContain(
      "previousOrganizationTexture",
    );
    expect(observerSource).toContain(
      "previousSourceTexture && !currentFieldEndpoint",
    );
    expect(observerSource).toContain(
      "previousOrganizationTexture && !currentFieldEndpoint",
    );
    expect(observerSource).toContain(
      "const currentSource = currentFieldEndpoint",
    );
    expect(observerSource).toContain(
      "const currentOrganization = currentFieldEndpoint",
    );

    const renderedMaterials = [];
    const recordingRenderer = {
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      render: (scene) => {
        renderedMaterials.push(scene.children[0]?.material?.name ?? null);
      },
    };
    const cache = createCache();
    const advancing = {
      ...validBakeOptions,
      observationAdvancing: true,
    };
    try {
      cache.bake(recordingRenderer, advancing);
      renderedMaterials.length = 0;
      cache.bake(recordingRenderer, {
        ...advancing,
        observationTimeSeconds: 1 / 60,
      });
      expect(renderedMaterials.slice(-3)).toEqual([
        "BaryonCymaticObserverFinalEvolutionMaterial",
        "BaryonObserverSparseExpansionMaterial",
        "BaryonObserverOpticalPairMaterial",
      ]);
      expect(
        renderedMaterials.filter(
          (name) => name === "BaryonObserverOpticalPairMaterial",
        ),
      ).toHaveLength(1);

      renderedMaterials.length = 0;
      cache.bake(recordingRenderer, {
        ...advancing,
        observationTimeSeconds: 3 / 60,
      });
      expect(renderedMaterials.slice(-5)).toEqual([
        "BaryonCymaticObserverEvolutionMaterial",
        "BaryonObserverSparseExpansionMaterial",
        "BaryonCymaticObserverFinalEvolutionMaterial",
        "BaryonObserverSparseExpansionMaterial",
        "BaryonObserverOpticalPairMaterial",
      ]);
      expect(
        renderedMaterials.filter(
          (name) => name === "BaryonObserverOpticalPairMaterial",
        ),
      ).toHaveLength(1);
    } finally {
      cache.dispose();
    }
  });

  it("packs additive moments and declares each derived cache target", () => {
    const source = readFileSync(
      new URL("./fieldCacheBake.js", import.meta.url),
      "utf8",
    );

    expect(source).toContain("evaluateAperture({ voxelIndex");
    expect(source).not.toContain("createFieldCacheApertureMaterial");
    expect(source).not.toContain("createFieldCacheBakeMaterial");
    expect(source).not.toContain("CYMATIC_OBSERVER_APERTURE_PASSES");
    expect(source).toContain(
      "const spectralFirstMoment = clampMomentToUnitDisk",
    );
    expect(source).toContain(
      "const spectralSecondMoment = clampMomentToUnitDisk",
    );
    expect(source).toContain("SPECTRAL_PHASE_FIELD_REFERENCE.supportEpsilon");
    expect(source).not.toContain("meanColor");
    expect(source).not.toContain("spectralAuthority");
    expect(source).toContain('names: ["topology", "source", "organization"]');
    expect(source).not.toContain('fine: payload.get("fine")');
    expect(source).toContain('names: ["opticalPair", "organization"]');
    expect(source).toContain(
      "return vec4(lowerAppearance.zw, upperAppearance.zw)",
    );
    expect(source).toMatch(
      /min\(\s*voxelIndex\.z\.add\(float\(1\)\),\s*float\(FIELD_CACHE_RESOLUTION - 1\)\s*\)/,
    );
    expect(source).toContain("observerOpticalPairTarget.dispose?.()");
    expect(source).toContain("let observerCheckpointTarget = null");
    expect(source).toContain("ensureObserverCheckpointTarget()");
    expect(source).toContain("observerCheckpointTarget?.dispose?.()");
  });

  it.each([
    ["boundaryMode", undefined],
    ["boundaryMode", "unsupported"],
    ["volumeShape", undefined],
    ["volumeShape", "unsupported"],
    ["observationTimeSeconds", undefined],
    ["observationTimeSeconds", Number.NaN],
    ["observationTimeSeconds", -1],
    ["observationAdvancing", undefined],
    ["observationAdvancing", "yes"],
    ["geometryExposureSeconds", undefined],
    ["geometryExposureSeconds", Number.NaN],
    ["geometryExposureSeconds", 0],
    ["observationResetToken", undefined],
    ["observationResetToken", ""],
    ["observationResetToken", "   "],
    ["observationCheckpointKey", undefined],
    ["observationCheckpointKey", 42],
    ["observationCheckpointKey", "   "],
    ["modalFieldSpectralSeedDirection", undefined],
    ["modalFieldSpectralSeedDirection", new Float32Array([1])],
    ["modalFieldSpectralSeedDirection", new Float32Array([1, Number.NaN])],
    ["modalFieldSpectralSeedDirection", new Float32Array([0, 0])],
  ])("rejects an invalid %s instead of applying a fallback", (key, value) => {
    const cache = createCache();
    try {
      expect(() =>
        cache.bake(renderer, { ...validBakeOptions, [key]: value }),
      ).toThrow(key);
    } finally {
      cache.dispose();
    }
  });

  it("accepts one complete deterministic bake request", () => {
    const cache = createCache();
    try {
      expect(cache.bake(renderer, validBakeOptions)).toMatchObject({
        baked: true,
        reset: true,
        advanced: false,
        stepIndex: 0,
      });
    } finally {
      cache.dispose();
    }
  });

  it("saves and restores a keyed observer checkpoint", () => {
    const cache = createCache();
    const rendered = [];
    let activeTarget = null;
    const recordingRenderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget(target) {
        activeTarget = target;
      },
      render(scene) {
        rendered.push({
          material: scene.children[0]?.material?.name,
          domain: scene.children[0]?.geometry?.userData?.fieldCacheDomain,
          target: activeTarget,
        });
      },
    };
    try {
      expect(
        cache.bake(recordingRenderer, {
          ...validBakeOptions,
          observationCheckpointKey: "file-session:fixture",
        }),
      ).toMatchObject({
        checkpointSaved: true,
        checkpointRestored: false,
      });
      const expansion = rendered.find(
        ({ material }) => material === "BaryonObserverSparseExpansionMaterial",
      );
      const savedCheckpoint = rendered.find(
        ({ material, target }) =>
          material === "BaryonObserverCheckpointCopyMaterial" &&
          target !== expansion.target,
      );
      expect(expansion).toMatchObject({
        domain: FIELD_CACHE_DOMAINS.full,
      });
      expect(savedCheckpoint?.target).not.toBe(expansion.target);

      rendered.length = 0;
      expect(
        cache.bake(recordingRenderer, {
          ...validBakeOptions,
          observationResetToken: "test-observer-reset",
          observationCheckpointKey: "file-session:fixture",
        }),
      ).toMatchObject({
        checkpointSaved: false,
        checkpointRestored: true,
      });
      const restoredObserverPasses = rendered.filter(({ material }) =>
        material?.startsWith("BaryonObserver"),
      );
      expect(
        restoredObserverPasses.map(({ material, domain }) => ({
          material,
          domain,
        })),
      ).toEqual([
        {
          material: "BaryonObserverCheckpointCopyMaterial",
          domain: FIELD_CACHE_DOMAINS.full,
        },
        {
          material: "BaryonObserverOpticalPairMaterial",
          domain: FIELD_CACHE_DOMAINS.full,
        },
      ]);
      expect(restoredObserverPasses[0].target).toBe(expansion.target);
    } finally {
      cache.dispose();
    }
  });

  it("filters presentation organization without changing observer history", () => {
    const cache = createCache();
    try {
      expect(cache.observerOrganizationTexture.value.minFilter).toBe(
        THREE.LinearFilter,
      );
      expect(cache.observerOrganizationTexture.value.magFilter).toBe(
        THREE.LinearFilter,
      );
      expect(cache.observerOpticalPairTexture.value.minFilter).toBe(
        THREE.LinearFilter,
      );
      expect(cache.observerOpticalPairTexture.value.magFilter).toBe(
        THREE.LinearFilter,
      );
      let target;
      const historyTargets = new Set();
      cache.bake(
        {
          ...renderer,
          setRenderTarget(next) {
            target = next;
          },
          render(scene) {
            if (
              scene.children[0].material.name ===
              "BaryonObserverSparseExpansionMaterial"
            ) {
              historyTargets.add(target);
            }
          },
        },
        validBakeOptions,
      );
      expect(historyTargets.size).toBe(1);
      for (const history of historyTargets) {
        expect(history.textures[2]).not.toBe(
          cache.observerOrganizationTexture.value,
        );
        expect(history.textures[2].minFilter).toBe(THREE.NearestFilter);
        expect(history.textures[2].magFilter).toBe(THREE.NearestFilter);
      }
    } finally {
      cache.dispose();
    }
  });

  it("preserves half-float trilinear radiance and support through z pairing", () => {
    const quantizeHalf = (value) =>
      THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(value));
    const bilinear = (values, xMix, yMix) => {
      const lower = values[0] * (1 - xMix) + values[1] * xMix;
      const upper = values[2] * (1 - xMix) + values[3] * xMix;
      return lower * (1 - yMix) + upper * yMix;
    };
    let state = 0x9e3779b9;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };

    for (let sample = 0; sample < 4096; sample += 1) {
      const lowerSlice = Array.from({ length: 4 }, () => [
        quantizeHalf(random() * 4),
        quantizeHalf(random()),
      ]);
      const upperSlice = Array.from({ length: 4 }, () => [
        quantizeHalf(random() * 4),
        quantizeHalf(random()),
      ]);
      const packedSlice = lowerSlice.map((lower, index) => [
        quantizeHalf(lower[0]),
        quantizeHalf(lower[1]),
        quantizeHalf(upperSlice[index][0]),
        quantizeHalf(upperSlice[index][1]),
      ]);
      const xMix = random();
      const yMix = random();
      const zMix = random();
      for (let lane = 0; lane < 2; lane += 1) {
        const conventional =
          bilinear(
            lowerSlice.map((value) => value[lane]),
            xMix,
            yMix,
          ) *
            (1 - zMix) +
          bilinear(
            upperSlice.map((value) => value[lane]),
            xMix,
            yMix,
          ) *
            zMix;
        const paired =
          bilinear(
            packedSlice.map((value) => value[lane]),
            xMix,
            yMix,
          ) *
            (1 - zMix) +
          bilinear(
            packedSlice.map((value) => value[lane + 2]),
            xMix,
            yMix,
          ) *
            zMix;

        expect(paired).toBe(conventional);
      }
    }
  });

  it("latches the spectral seed only when an authoritative observer step runs", () => {
    const cache = createCache();
    try {
      const advancing = {
        ...validBakeOptions,
        modalFieldSpectralSeedDirection: new Float32Array([0, 1]),
      };
      expect(cache.bake(renderer, advancing)).toMatchObject({ baked: true });
      expect(cache.spectralSeedDirectionNode.value.toArray()).toEqual([0, 1]);

      expect(
        cache.bake(renderer, {
          ...advancing,
          modalFieldSpectralSeedDirection: new Float32Array([-1, 0]),
        }),
      ).toMatchObject({ baked: false, stepCount: 0 });
      expect(cache.spectralSeedDirectionNode.value.toArray()).toEqual([0, 1]);
    } finally {
      cache.dispose();
    }
  });
});
