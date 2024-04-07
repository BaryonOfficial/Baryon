const Pitchfinder = require('pitchfinder');
const { analyze } = require('web-audio-beat-detector');
const THREE = require('three');

class PitchDetectionProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detectPitch = Pitchfinder.YIN();
    this.quantization = 4; // Default quantization value
    this.bufferSize = 4096; // Adjust the buffer size as needed
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.analyser = new THREE.AudioAnalyser(null, this.bufferSize);
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
          // Buffer is full, estimate the tempo and perform pitch detection
          this.estimateTempo(this.buffer)
            .then((tempo) => {
              const frequencies = Pitchfinder.frequencies(this.detectPitch, this.buffer, {
                tempo: tempo,
                quantization: this.quantization,
              });

              // Process the detected frequencies
              frequencies.forEach((pitch, index) => {
                console.log(`Pitch at interval ${index}:`, pitch);
              });

              // Get the amplitude for different frequency bins
              this.analyser.getByteFrequencyData();
              const frequencyData = this.analyser.data;
              console.log('Frequency data:', frequencyData);

              // Get the average amplitude of the frequencies
              const averageAmplitude = this.analyser.getAverageFrequency();
              console.log('Average amplitude:', averageAmplitude);

              // Reset the buffer index
              this.bufferIndex = 0;
            })
            .catch((err) => {
              console.error('Error estimating tempo:', err);
            });
        }
      }

      // Copy the input to the output
      outputChannel.set(inputChannel);
    }

    return true;
  }

  async estimateTempo(audioData) {
    try {
      const audioBuffer = await this.context.decodeAudioData(audioData.buffer);
      const tempo = await analyze(audioBuffer);
      return tempo;
    } catch (err) {
      throw err;
    }
  }
}

registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
