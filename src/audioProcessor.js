import { EssentiaWASM } from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.es.js';
import Essentia from 'https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.es.js';

class AudioDataProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.essentia = new Essentia(EssentiaWASM);
    console.log('Backend - essentia:' + this.essentia.version + '- http://essentia.upf.edu');
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];

      if (inputChannel && outputChannel) {
        // // Convert the input audio data to a std::vector<float> type
        // const vectorInput = this.essentia.arrayToVector(inputChannel);

        // // Estimate the tempo using the PercivalBpmEstimator algorithm
        // const tempoResult = this.essentia.PercivalBpmEstimator(vectorInput);
        const tempo = 120.0;

        // Pass the input audio data to the output buffer
        outputChannel.set(inputChannel);

        // Post the tempo and input audio data to the main thread
        this.port.postMessage({ tempo, audioData: inputChannel }, [inputChannel.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('audio-data-processor', AudioDataProcessor);
