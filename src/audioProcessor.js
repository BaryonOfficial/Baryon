class AudioDataProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = options.processorOptions.bufferSize;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        outputChannel[i] = inputChannel[i];

        if (this.bufferIndex === this.bufferSize) {
          this.port.postMessage({ type: 'audioData', data: this.buffer }, [this.buffer.buffer]);
          this.bufferIndex = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor('audio-data-processor', AudioDataProcessor);
