import { analyze } from 'web-audio-beat-detector';
import * as Pitchfinder from 'pitchfinder';

class PitchDetectionProcessor extends AudioWorkletProcessor {
  // constructor() {
  //   this.port.postMessage('Before super');
  //   super();
  //   this.port.postMessage('AudioWorklet processor constructor');
  // }
  // process(inputs, outputs, parameters) {
  //   return true;
  // }

  constructor() {
    super();

    this.detectPitch = Pitchfinder.YIN();
    this.quantization = 4;
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.frequencyData = new Uint8Array(this.bufferSize / 2);
    this.isAudioPlaying = false;
  }

  // REMINDER: These need to be parameters controlled from the main thread ^

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0 && input[0].length > 0) {
      this.isAudioPlaying = true;
    } else {
      this.isAudioPlaying = false;
    }

    if (this.isAudioPlaying) {
      // Process audio data when audio is playing
      for (let channel = 0; channel < input.length; channel++) {
        const inputChannel = input[channel];
        const outputChannel = output[channel];

        for (let i = 0; i < inputChannel.length; i++) {
          this.buffer[this.bufferIndex++] = inputChannel[i];
          if (this.bufferIndex === this.bufferSize) {
            const tempo = this.estimateTempo(this.buffer);
            const frequencies = Pitchfinder.frequencies(this.detectPitch, this.buffer, {
              tempo: tempo,
              quantization: this.quantization,
            });

            frequencies.forEach((pitch, index) => {
              console.log(`Pitch at interval ${index}:`, pitch);
            });

            this.analyzeFrequencyData(this.buffer);

            this.port.postMessage({
              type: 'frequencies',
              data: frequencies,
              size: frequencies.length,
            });
            this.port.postMessage(this.frequencyData, [this.frequencyData.buffer]);
            this.port.postMessage({ type: 'averageAmplitude', data: this.getAverageAmplitude() });
            this.port.postMessage({ type: 'tempo', data: tempo });

            this.bufferIndex = 0;
          }
        }

        outputChannel.set(inputChannel);
      }
    } else {
      // Send default values when no audio is playing
      this.port.postMessage({
        type: 'processedData',
        data: {
          frequencies: [],
          frequencyData: Array(this.bufferSize / 2).fill(0),
          averageAmplitude: 0,
          tempo: 0,
        },
      });
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

  analyzeFrequencyData(audioData) {
    const audioBuffer = this.context.createBuffer(1, this.bufferSize, this.context.sampleRate);
    audioBuffer.copyToChannel(audioData, 0);
    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;

    const analyser = this.context.createAnalyser();
    analyser.fftSize = this.bufferSize;
    source.connect(analyser);

    analyser.getByteFrequencyData(this.frequencyData);
  }

  getAverageAmplitude() {
    const sum = this.frequencyData.reduce((acc, val) => acc + val, 0);
    return sum / this.frequencyData.length;
  }
}

registerProcessor('pitch-detection-processor', PitchDetectionProcessor);
