import { analyze } from 'web-audio-beat-detector';
import * as Pitchfinder from 'pitchfinder';

class AudioDataProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.audioContext = new AudioContext();
    this.quantization = options.processorOptions.quantization;
    this.bufferSize = options.processorOptions.bufferSize;
    this.bufferIndex = 0;
    this.buffer = new Float32Array(this.bufferSize);
    this.detectPitch = Pitchfinder.YIN();
    this.analyser = new AnalyserNode(this.audioContext, { fftSize: this.bufferSize });
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.bufferSize);
    this.isAudioPlaying = false;
  }

  // REMINDER: These need to be parameters controlled from the main thread ^

  process(inputs, outputs, parameters) {
    console.log('AudioWorkletProcessor process start');

    try {
      const input = inputs[0];
      const output = outputs[0];

      if (input.length > 0 && input[0].length > 0) {
        console.log('Processing audio data');

        this.isAudioPlaying = true;
      } else {
        console.log('Sending default values');

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

              this.analyser.getByteFrequencyData(this.frequencyData);
              this.analyser.getByteTimeDomainData(this.timeDomainData);

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
            averageAmplitude: 1,
            tempo: 0,
          },
        });
      }
    } catch (error) {
      console.error('Error in AudioWorkletProcessor process:', error);
      this.port.postMessage({ type: 'error', data: error.message });
    }
    console.log('AudioWorkletProcessor process end');

    return true;
  }

  async estimateTempo(audioData) {
    try {
      const tempo = await analyze(audioData);
      return tempo;
    } catch (err) {
      throw err;
    }
  }

  getAverageAmplitude() {
    const sum = this.timeDomainData.reduce((acc, val) => acc + Math.abs(val - 128), 0);
    return sum / this.timeDomainData.length;
  }
}

registerProcessor('audio-data-processor', AudioDataProcessor);
