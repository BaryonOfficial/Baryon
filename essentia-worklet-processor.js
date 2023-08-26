// essentia-worklet-processor.js
class EssentiaWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.essentia = essentia;
    console.log('Backend - essentia:' + this.essentia.version + '- http://essentia.upf.edu');
  }

  //System-invoked process callback function.
  process(inputs, outputs, parameters) {
    let input = inputs[0];
    let output = outputs[0];
  
    // convert the input audio frame array from channel 0 to a std::vector<float> type for using it in essentia
    let vectorInput = this.essentia.arrayToVector(input[0]);
  
    // apply a window (hanning) to the signal using the default parameters
    let windowedInput = this.essentia.Windowing(vectorInput);
  
    // compute the Root Mean Square of the windowed input audio frame
    let rmsFrame = this.essentia.RMS(windowedInput.frame);
  
    output[0][0] = rmsFrame.rms;
  
    return true; // keep the process running
  }
}

// Inside the `process` method of EssentiaWorkletProcessor
output[0][0] = rmsFrame.rms;
this.port.postMessage(rmsFrame.rms);
registerProcessor('essentia-worklet-processor', AudioWorkletNode); // must use the same name we gave our processor in `createEssentiaNode`