class AudioDataProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    try {
      const input = inputs[0];
      const output = outputs[0];

      if (input && input.length > 0) {
        const inputChannel = input[0];
        const outputChannel = output[0];

        if (inputChannel && outputChannel) {
          // Get the actual size of the input block
          const blockSize = inputChannel.length;

          // Resize the buffer if needed
          if (!this.buffer || this.buffer.length !== blockSize) {
            this.buffer = new Float32Array(blockSize);
            this.bufferIndex = 0;
          }

          for (let i = 0; i < blockSize; i++) {
            this.buffer[this.bufferIndex++] = inputChannel[i];
            outputChannel[i] = inputChannel[i];

            if (this.bufferIndex === blockSize) {
              this.port.postMessage({ type: 'audioData', data: this.buffer }, [this.buffer.buffer]);
              this.bufferIndex = 0;
            }
          }
        } else {
          console.warn('AudioDataProcessor: No input or output channel available.');
        }
      } else {
        console.warn('AudioDataProcessor: No input data available.');
      }
    } catch (error) {
      console.error('AudioDataProcessor: Error in process method:', error);
      // You can choose to return false to stop further processing if needed
      return false;
    }

    return true;
  }
}

registerProcessor('audio-data-processor', AudioDataProcessor);
