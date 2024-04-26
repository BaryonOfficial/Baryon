function animatePitch(timestamp) {
  // if (animationStart === undefined)

  animationId = requestAnimationFrame(animatePitch);
  /* SAB method */
  let pitchBuffer = new Float32Array(3);
  if (audioReader.available_read() >= 1) {
    let read = audioReader.dequeue(pitchBuffer);
    if (read !== 0) {
      // console.info("main: ", pitchBuffer[0], pitchBuffer[1], pitchBuffer[2]);
      // elapsed = timestamp - animationStart;
      // animationStart = timestamp;
      // console.info(elapsed);
      CONFIDENCE_ARRAY.push(pitchBuffer[1]);
      CONFIDENCE_ARRAY.shift();
      const logRMS = 1 + Math.log10(pitchBuffer[2] + Number.MIN_VALUE) * 0.5;
      rmsAccum.push(logRMS);
      RMS_ARRAY.push(logRMS);
      RMS_ARRAY.shift();
      pitchAccum.push(pitchBuffer[0]);
      pitchChart.data.datasets[0].data.push(pitchBuffer[0]);
      pitchChart.data.datasets[0].data.shift();

      // console.info("before chart update");
      pitchChart.update();
      // console.info("AFTER chart update");
    }
  }
}

function drawFullPitchContour() {
  rms_pointer = rmsAccum;
  pitchChart.data.datasets[0].data = pitchAccum;
  pitchChart.data.datasets[1].data = Array(pitchAccum.length).fill(AXES_PITCHES[0]);
  pitchChart.data.datasets[2].data = Array(pitchAccum.length).fill(AXES_PITCHES.slice(-1)[0]);
  pitchChart.data.labels = getTimeLabels(pitchAccum.length);
  pitchChart.update();
  pitchAccum = [];
  rmsAccum = [];
  console.info('Full pitch contour should be displaying');
}
