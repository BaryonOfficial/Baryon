import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
const rootDirectory = fileURLToPath(new URL("../../../", import.meta.url));
const outputFile = path.resolve(
  process.argv[2] ?? "/tmp/baryon-session-ownership-report.json",
);
const stallMs = 500;
const sourcePaths = [
  "packages/engine/src/core/audio/audioSetup.js",
  "packages/engine/src/core/audio/audioPcmCapture.js",
  "packages/engine/src/core/audio/audioPcmCapture.worklet.js",
  "packages/engine/src/utils/audio/audioFeatureEngine.js",
  "packages/engine/src/utils/audio/audioFeatureEngine.worker.js",
  "packages/engine/src/utils/audio/audioFeaturePackets.js",
  "packages/app-shell/src/components/hooks/useAudioFeatureOwner.js",
  "packages/app-shell/src/components/hooks/useVisualizationRuntimeLifecycle.js",
  "packages/app-shell/src/components/RendererCanvas.jsx",
  "packages/app-shell/src/components/rendererDiagnostics.js",
  "packages/engine/src/core/raymarchSetup.js",
  "packages/engine/src/core/raymarch/runtime.js",
  "packages/engine/src/core/raymarch/compileRenderPass.js",
  "packages/engine/src/core/raymarch/broadbandFieldSource.js",
  "packages/engine/src/core/raymarch/broadbandMomentField.js",
  "packages/engine/src/core/raymarch/broadbandSpectralExpansion.js",
  "packages/engine/src/core/raymarch/broadbandSpectralProjection.js",
  "packages/engine/src/core/raymarch/fieldCacheBake.js",
  "apps/web/scripts/verifyBroadbandSessionOwnership.mjs",
];
const hashes = Object.fromEntries(
  await Promise.all(
    sourcePaths.map(async (p) => [
      p,
      createHash("sha256")
        .update(await readFile(path.join(rootDirectory, p)))
        .digest("hex"),
    ]),
  ),
);

const entry = String.raw`
import React,{useMemo,useRef,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {useFrame,useThree} from '@react-three/fiber';
import {RendererCanvas} from '/packages/app-shell/src/components/RendererCanvas.jsx';
import {createBaryonRenderer} from '/packages/app-shell/src/components/rendererDiagnostics.js';
import * as THREE from 'three';
import {getDefaultAudioSession} from '/packages/engine/src/core/audio/audioSetup.js';
import {createRendererFeatureView} from '/packages/engine/src/utils/audioFeatures.js';
import {createControlState} from '/packages/engine/src/controls/schema.js';
import {useAudioFeatureOwner} from '/packages/app-shell/src/components/hooks/useAudioFeatureOwner.js';
import {useVisualizationRuntimeLifecycle} from '/packages/app-shell/src/components/hooks/useVisualizationRuntimeLifecycle.js';
const session=getDefaultAudioSession(),audioRef={current:session},controlsRef={current:createControlState()};
const stats={renderers:0,frames:0,registrations:0,disposals:0,tickMaxMs:0,renderMaxMs:0};
window.longTasks=[];
new PerformanceObserver(list=>{for(const e of list.getEntries())if(window.longTasks.length<64)window.longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});
let reader=null;const register=(next)=>{reader=next;stats.registrations++;};
const noop=()=>{};
function Scene(){
 const geometry=useMemo(()=>new THREE.SphereGeometry(.2,8,8),[]),pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;geometry.dispose();};},[geometry]);
 const lifecycle=useVisualizationRuntimeLifecycle({audioRef,controlsRef,baryonGeometry:geometry,setIsEngineReady:noop,setLiveInputRuntimeStatus:noop});
 const {gl,scene,camera}=useThree();
 useFrame((_state,dt)=>{
  if(pending.current||!lifecycle.runtimeStateRef.current)return;
  const model=session.featureRuntime.readLatestFeatureModel();if(!model)return;
  pending.current=true;
  try{
   let start=performance.now();
   lifecycle.runtimeRef.current.prepare({runtimeState:lifecycle.runtimeStateRef.current,featureFrame:model,renderer:gl,scene,camera});
   lifecycle.runtimeRef.current.tick({runtimeState:lifecycle.runtimeStateRef.current,featureFrame:createRendererFeatureView(model),time:model.observation.endSample/model.topology.sampleRate,deltaTime:dt,renderer:gl});
   stats.tickMaxMs=Math.max(stats.tickMaxMs,performance.now()-start);start=performance.now();
   gl.render(scene,camera);stats.renderMaxMs=Math.max(stats.renderMaxMs,performance.now()-start);stats.frames++;
   window.lastCanvasState=lifecycle.runtimeStateRef.current.debugSnapshot;
  }catch(error){window.nativeFailure=String(error);}
  void gl.backend.device.queue.onSubmittedWorkDone().then(()=>pending.current=false,error=>{if(mounted.current)window.nativeFailure=String(error);});
 },1);
 return lifecycle.points ? React.createElement('primitive',{object:lifecycle.points}) : null;
}
async function renderer(options){
 const gl=await createBaryonRenderer(options,false,{alpha:false,initialPixelRatio:1});
 if(!gl.backend.isWebGPUBackend)throw Error('Native WebGPU required');stats.renderers++;
 const dispose=gl.dispose.bind(gl);gl.dispose=()=>{stats.disposals++;dispose();};
 return gl;
}
function Host({visible,generation}){
 useAudioFeatureOwner({controlsRef,registerStructureExportSampleReader:register});
 return visible ? React.createElement(RendererCanvas,{key:generation,gl:renderer,camera:{position:[0,0,10],near:.1,far:100}},React.createElement(Scene)) : null;
}
const root=createRoot(document.getElementById('root'));
window.ownerProbe={session,stats,readExport:()=>reader?.(),show:(visible,generation=0)=>root.render(React.createElement(Host,{visible,generation})),stop:()=>root.unmount()};
window.ownerProbe.show(false);
`;
const server = await createServer({
  configFile: false,
  root: rootDirectory,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "session-owner-smoke",
      resolveId(id) {
        if (id === "/entry.jsx") return "\0entry.jsx";
      },
      load(id) {
        if (id === "\0entry.jsx") return entry;
      },
      configureServer(v) {
        v.middlewares.use((req, res, next) => {
          if (req.url != "/smoke") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            '<!doctype html><div id="root" style="width:128px;height:128px"></div><script type="module" src="/entry.jsx"></script>',
          );
        });
      },
    },
  ],
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-webgpu",
      "--use-angle=metal",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("BROWSER PAGEERROR", e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.log("BROWSER CONSOLE", m.text());
    }
  });
  await page.goto(server.resolvedUrls.local[0] + "smoke");
  await page
    .waitForFunction(() => window.ownerProbe?.stats.registrations > 0, null, {
      timeout: 10000,
    })
    .catch(async (error) => {
      console.log(
        "MOUNT STATE",
        await page.evaluate(() => ({
          ready: !!window.ownerProbe,
          html: document.body.innerHTML,
        })),
      );
      throw error;
    });
  const result = await page.evaluate(async () => {
    const p = window.ownerProbe,
      runtime = p.session.featureRuntime;
    const wait = async (test, label) => {
      const deadline = performance.now() + 20000;
      while (!test()) {
        if (window.nativeFailure) throw Error(window.nativeFailure);
        if (runtime.getStatus().state === "failed")
          throw Error(
            "source failed " +
              JSON.stringify({
                stats: p.stats,
                status: runtime.getStatus(),
                longTasks: window.longTasks,
              }),
          );
        if (performance.now() > deadline)
          throw Error(
            "timeout " +
              label +
              " " +
              JSON.stringify({
                stats: p.stats,
                status: runtime.getStatus(),
                state: window.lastCanvasState,
              }),
          );
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    const fs = 48000,
      n = fs * 20,
      bytes = new ArrayBuffer(44 + n * 8),
      v = new DataView(bytes),
      text = (off, s) =>
        [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
    text(0, "RIFF");
    v.setUint32(4, bytes.byteLength - 8, true);
    text(8, "WAVE");
    text(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 3, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, fs, true);
    v.setUint32(28, fs * 8, true);
    v.setUint16(32, 8, true);
    v.setUint16(34, 32, true);
    text(36, "data");
    v.setUint32(40, bytes.byteLength - 44, true);
    for (let i = 0; i < n; i++) {
      v.setFloat32(44 + 8 * i, 0.2 * Math.sin(i * 0.017), true);
      v.setFloat32(48 + 8 * i, 0.2 * Math.sin(i * 0.031), true);
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    try {
      await p.session.loadAudio(url);
      p.session.setMuted(true);
      await p.session.playPauseAudio();
      await wait(
        () => p.readExport()?.featureFrame.observation.endSample >= 8192,
        "headless export",
      );
      if (p.stats.renderers !== 0)
        throw Error("headless producer created GPU renderer");
      const initial = runtime.getStatus();
      const endpoints = [p.readExport().featureFrame.observation.endSample];
      const stallStart = performance.now();
      while (performance.now() - stallStart < 500) {
        /* Deliberate bounded host stall. */
      }
      await new Promise((r) => setTimeout(r, 100));
      await wait(
        () => p.readExport()?.featureFrame.observation.endSample > endpoints[0],
        "source progress after main-thread stall",
      );
      for (let generation = 0; generation < 2; generation++) {
        const before = p.stats.frames;
        p.show(true, generation);
        await wait(
          () =>
            p.stats.frames >= before + 3 &&
            window.lastCanvasState?.presentationReady === true &&
            window.lastCanvasState?.volumeVisible === true,
          "active Canvas " + generation,
        );
        p.show(false, generation);
        await wait(
          () => p.stats.disposals === generation + 1,
          "renderer release " + generation,
        );
        await new Promise((r) => setTimeout(r, 120));
        const first = p.readExport().featureFrame.observation.endSample;
        await wait(
          () => p.readExport()?.featureFrame.observation.endSample > first,
          "hidden producer progress",
        );
        endpoints.push(p.readExport().featureFrame.observation.endSample);
        if (
          runtime !== p.session.featureRuntime ||
          runtime.getStatus().workerGeneration !== initial.workerGeneration ||
          runtime.getStatus().sourceBootstrapCount !== 1
        )
          throw Error("Canvas restarted the audio owner");
      }
      const revocations = [];
      const unsubscribe = runtime.subscribeObservations(
        () => {},
        undefined,
        (event) => revocations.push(event),
      );
      p.session.stopAudio();
      if (
        revocations.length !== 1 ||
        runtime.readLatestFeatureModel() !== null ||
        p.readExport() !== null
      )
        throw Error(
          "Stop did not revoke source and headless export exactly once",
        );
      const bootstrapCount = runtime.getStatus().sourceBootstrapCount;
      await new Promise((r) => setTimeout(r, 100));
      if (
        runtime.readLatestFeatureModel() !== null ||
        runtime.getStatus().sourceBootstrapCount !== bootstrapCount
      )
        throw Error("Stopped source recovered from a read or late callback");
      unsubscribe();
      return {
        passed: true,
        stats: { ...p.stats },
        endpoints,
        workerGeneration: initial.workerGeneration,
        sourceBootstrapCount: runtime.getStatus().sourceBootstrapCount,
        observer: window.lastCanvasState,
        stopRevocations: revocations,
        stoppedSourceBootstrapCount: bootstrapCount,
        scope:
          "actual audio session/PCM/worker + React Canvas lifecycle + native GPU field; excludes full BaryonScene postprocessing and physical latency",
      };
    } catch (error) {
      return {
        passed: false,
        failure: String(error),
        stats: { ...p.stats },
        status: runtime.getStatus(),
        longTasks: window.longTasks,
        observer: window.lastCanvasState ?? null,
      };
    } finally {
      p.stop();
      await p.session.dispose();
      URL.revokeObjectURL(url);
    }
  });
  const report = {
    ...result,
    passed: result.passed && errors.length === 0,
    errors,
    stallMs,
    sourceHashes: hashes,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    scope:
      "actual session/PCM/worker, headless export, React Canvas lifecycle and native GPU field; excludes full BaryonScene postprocessing, sustained-load resource and physical latency qualification",
  };
  await writeFile(outputFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  console.error(String(error));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
