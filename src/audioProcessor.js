const Pitchfinder = require('pitchfinder');
import { analyze } from 'web-audio-beat-detector';

class PitchDetectionProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detectPitch = Pitchfinder.YIN();
    this.quantization = 4; // Default quantization value
    this.bufferSize = 4096; // Adjust the buffer size as needed
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      // Append the input samples to the buffer
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        if (this.bufferIndex === this.bufferSize) {
          // Buffer is full, perform pitch detection
          const frequencies = Pitchfinder.frequencies(this.detectPitch, this.buffer, {
            tempo: 120, // Provide a default tempo value
            quantization: this.quantization,
          });

          // Process the detected frequencies
          frequencies.forEach((pitch, index) => {
            console.log(`Pitch at interval ${index}:`, pitch);
          });

          // Send the audio data to the main thread for further analysis
          this.port.postMessage({ type: 'audioData', data: this.buffer });

          // Reset the buffer index
          this.bufferIndex = 0;
        }
      }

      // Copy the input to the output
      outputChannel.set(inputChannel);
    }

    return true;
  }
}

registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
