// three-utils/timeHandler.js
export function createTimeHandler(audioObject) {
  let previousTime = 0;
  let lastKnownTime = 0;

  return function timeHandler(elapsedTime) {
    let time, deltaTime;

    if (audioObject.gumStream?.active) {
      deltaTime = elapsedTime - previousTime;
      previousTime = elapsedTime;
      time = elapsedTime;
    } else if (audioObject.sound?.isPlaying && audioObject.sound.started) {
      deltaTime = audioObject.sound.listener.timeDelta;
      time = audioObject.sound.context.currentTime;
      lastKnownTime = time;
    } else if (!audioObject.sound?.isPlaying && audioObject.sound?.started) {
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
