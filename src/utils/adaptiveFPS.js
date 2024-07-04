let targetFPS = 60; // Start with a high target
let frameInterval = 1000 / targetFPS;
const fpsHistory = [];
const FPS_SAMPLE_SIZE = 60; // Number of frames to average
const MIN_FPS = 30; // Minimum acceptable FPS
const MAX_FPS = 120; // Maximum target FPS

export function initAdaptiveFPS() {
  targetFPS = 60;
  frameInterval = 1000 / targetFPS;
  fpsHistory.length = 0;
}

export function shouldRenderFrame(currentTime, lastFrameTime) {
  return currentTime - lastFrameTime >= frameInterval;
}

export function updateFPSHistory(elapsed) {
  const currentFPS = 1000 / elapsed;
  fpsHistory.push(currentFPS);
  if (fpsHistory.length > FPS_SAMPLE_SIZE) {
    fpsHistory.shift();
  }
}

export function adjustTargetFPS() {
  if (fpsHistory.length < FPS_SAMPLE_SIZE) return;

  const avgFPS = fpsHistory.reduce((sum, fps) => sum + fps, 0) / FPS_SAMPLE_SIZE;

  if (avgFPS < targetFPS - 5) {
    // If we're consistently below target, reduce target FPS
    targetFPS = Math.max(MIN_FPS, targetFPS - 5);
  } else if (avgFPS > targetFPS + 5 && targetFPS < MAX_FPS) {
    // If we're consistently above target, increase target FPS
    targetFPS = Math.min(MAX_FPS, targetFPS + 5);
  }

  // Update frame interval
  frameInterval = 1000 / targetFPS;

  console.log(`Adjusted target FPS to: ${targetFPS}`);
}

export function getFrameInterval() {
  return frameInterval;
}
