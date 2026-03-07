/**
 * Creates a frame timing handler that synchronises simulation time with the Web Audio clock.
 *
 * @param {function} getState - Returns the live audio state object (from createAudioContext().getState)
 */
export function createTimeHandler(getState) {
  let previousTime = 0;
  let lastKnownTime = 0;

  return function timeHandler(elapsedTime) {
    const s = getState();
    let time, deltaTime;

    if (s.gumStream?.active) {
      deltaTime = elapsedTime - previousTime;
      previousTime = elapsedTime;
      time = elapsedTime;
    } else if (s.sound?.isPlaying && s.sound.started) {
      deltaTime = s.sound.listener.timeDelta;
      time = s.sound.context.currentTime;
      lastKnownTime = time;
    } else if (!s.sound?.isPlaying && s.sound?.started) {
      time = lastKnownTime;
      deltaTime = 0;
    } else {
      deltaTime = elapsedTime - previousTime;
      previousTime = elapsedTime;
      time = elapsedTime;
    }

    return { time, deltaTime };
  };
}
