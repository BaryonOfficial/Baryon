let essentia = new Essentia(Module);

class AudioDataProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.isPlaying = false;
    this.micActive = false;
    this._logCounter = 0; // Initialize a counter for logging
    this._frameCounter = 0; // Counter for determining pitch series, for frames per beat
    this.logFrequency = 500; // Log every 1000 frames
    this._bufferSize = options.processorOptions.bufferSize;
    this._sampleRate = options.processorOptions.sampleRate;
    this._capacity = options.processorOptions.capacity;
    this._essentia = essentia;
    this._frameSize = this._bufferSize / 2;
    this._hopSize = this._frameSize / 4;

    // this._lowestFreq = 440 * Math.pow(Math.pow(2, 1 / 12), -57); // lowest note = C0
    // this._lowestFreq = 440 * Math.pow(Math.pow(2, 1 / 12), -33); // lowest note = C2
    // this._highestFreq = 440 * Math.pow(Math.pow(2, 1 / 12), -57) * Math.pow(2, 8); // 8 octaves above C0, c*
    this._lowestFreq = 200;
    this._highestFreq = 440 * Math.pow(Math.pow(2, 1 / 12), -33 + 6 * 12 - 1); // 6 octaves above C2

    this._inputRingBuffer = null;
    this._outputRingBuffer = null;
    this._accumData = null;
    this._mixedDownData = null;
    this._channelCount = null;
    this._interleavedData = null;

    // this._meanPitchSeriesForBeat = [];

    // SAB config
    this.port.onmessage = (event) => {
      if (event.data.sab) {
        this._audio_writer = new AudioWriter(new RingBuffer(event.data.sab, Float32Array));
      }
      // Check if the message contains the isPlaying boolean
      if (event.data.isPlaying !== undefined) {
        this.isPlaying = event.data.isPlaying;
      }

      if (event.data.micActive !== undefined) {
        this.micActive = event.data.micActive;
        // console.log('micActive:', this.micActive);
      }
    };
    // console.log('Backend - essentia:' + this._essentia.version + '- http://essentia.upf.edu');
  }

  process(inputs, outputs, parameters) {
    this._logCounter++;

    // The input list and output list are each arrays of
    // Float32Array objects, each of which contains the
    // samples for one channel.

    let input = inputs[0];
    let output = outputs[0];

    // Check if channel count has changed or buffers are not initialized
    if (this._channelCount !== input.length || !this._inputRingBuffer) {
      this._initializeBuffers(input.length);
      this._channelCount = input.length; // Update the current channel count
    }

    if (!this.isPlaying && !this.micActive) {
      // Fill with 0s when no sound playing
      output.forEach((channel) => channel.fill(0));
      return true;
    }

    // Efficient check to see if the input buffer contains only zeros, not dependent on main thread
    // let isSilent = true;
    // for (let channel of input) {
    //   for (let value of channel) {
    //     if (value !== 0) {
    //       isSilent = false;
    //       break;
    //     }
    //   }
    //   if (!isSilent) break;
    // }

    try {
      this._inputRingBuffer.push(input);

      if (this._inputRingBuffer.framesAvailable >= this._bufferSize) {
        // console.log('this._accumData before pull:', this._accumData);

        this._inputRingBuffer.pull(this._accumData);

        for (let i = 0; i < this._bufferSize * this._channelCount; i++) {
          this._interleavedData[i] =
            this._accumData[i % this._channelCount][Math.floor(i / this._channelCount)];
        }

        const accumDataVector = this._essentia.arrayToVector(this._interleavedData);

        // console.log('accumDataVector:', accumDataVector);

        // Mix down the data to a single channel if necessary
        // for (let i = 0; i < this._bufferSize; ++i) {
        //   let sum = 0;
        //   for (let channel = 0; channel < this._channelCount; ++channel) {
        //     sum += this._accumData[channel][i];
        //   }
        //   this._mixedDownData[i] = sum / this._channelCount; // Average mix down
        // }

        // // Convert the mixed down data to an Essentia vector
        // const mixedDownDataVector = this._essentia.arrayToVector(this._mixedDownData);

        // Assuming dataVector is your VectorFloat instance
        // const dataVector = accumDataVector;
        // const vectorSize = dataVector.size();
        // console.log('Vector Size:', vectorSize);

        // if (vectorSize > 0) {
        //   let elements = [];
        //   for (let i = 0; i < vectorSize; i++) {
        //     elements.push(dataVector.get(i));
        //   }
        //   console.log('Vector Elements:', elements);
        // } else {
        //   console.log('Vector is empty');
        // }

        const algoOutput = this._essentia.PredominantPitchMelodia(
          accumDataVector,
          10,
          3,
          this._frameSize,
          false,
          0.8,
          this._hopSize,
          1,
          40,
          this._highestFreq,
          100,
          this._lowestFreq,
          20,
          0.9,
          0.9,
          27.5625,
          this._lowestFreq,
          this._sampleRate,
          100,
          true
        );

        // Pitch Calcs
        const pitchFrames = essentia.vectorToArray(algoOutput.pitch);
        // average frame-wise pitches in pitch before writing to SAB
        const numVoicedFrames = pitchFrames.filter((p) => p > 0).length;
        const meanPitch = pitchFrames.reduce((acc, curr) => acc + curr, 0) / numVoicedFrames;

        // let vectorVectorFloat = algoOutput2.pitch;
        // let pitchArrays = [];
        // for (let i = 0; i < vectorVectorFloat.size(); i++) {
        //   let innerVector = vectorVectorFloat.get(i);
        //   let pitchArray = [];
        //   for (let j = 0; j < innerVector.length; j++) {
        //     pitchArray.push(innerVector[j]);
        //   }
        //   pitchArrays.push(pitchArray);
        // }
        // console.log('Algo2 Pitch Arrays:', pitchArrays);

        // // Estimate the tempo using the PercivalBpmEstimator algorithm
        // let tempo = this._essentia.PercivalBpmEstimator(
        //   accumDataVector,
        //   1024,
        //   2048,
        //   128,
        //   128,
        //   210,
        //   50,
        //   this._sampleRate
        // ).bpm;

        // // // Tempo Calcs
        // const secondsPerBeat = 60 / tempo;
        // const framesPerBeat = Math.round(secondsPerBeat * this._sampleRate);
        // // console.log('framesPerBeat:', framesPerBeat);

        // Enqueue all pitch values from _meanPitchSeriesForBeat at once
        if (this._audio_writer.available_write() >= 1) {
          if (!isNaN(meanPitch)) {
            this._audio_writer.enqueue([meanPitch]);
          }
        }

        // Reset _accumData in-place
        for (let channel = 0; channel < this._channelCount; ++channel) {
          this._accumData[channel].fill(0);
        }
      }
    } catch (error) {
      console.error('AudioWorkletProcessor error:', error);
      // If there is no valid input or not enough frames, do nothing and let the output be silent
      output.forEach((channel) => channel.fill(0));
    }
    // Return - let the system know we're still active and ready to process audio.
    return true;
  }
  _initializeBuffers(channelCount) {
    this._inputRingBuffer = new ChromeLabsRingBuffer(this._bufferSize, channelCount);
    this._outputRingBuffer = new ChromeLabsRingBuffer(this._bufferSize, channelCount);
    this._accumData = new Array(channelCount)
      .fill(null)
      .map(() => new Float32Array(this._bufferSize));
    this._mixedDownData = new Float32Array(this._bufferSize);
    this._interleavedData = new Float32Array(this._bufferSize * channelCount);
    console.log(`Buffers initialized for ${channelCount} channels.`);
  }
}

registerProcessor('audio-data-processor', AudioDataProcessor);

// helper classes from https://github.com/GoogleChromeLabs/web-audio-samples/blob/gh-pages/audio-worklet/design-pattern/lib/wasm-audio-helper.js#L170:

/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

// Basic byte unit of WASM heap. (16 bit = 2 bytes)
const BYTES_PER_UNIT = Uint16Array.BYTES_PER_ELEMENT;

// Byte per audio sample. (32 bit float)
const BYTES_PER_SAMPLE = Float32Array.BYTES_PER_ELEMENT;

// The max audio channel on Chrome is 32.
const MAX_CHANNEL_COUNT = 32;

// WebAudio's render quantum size.
const RENDER_QUANTUM_FRAMES = 128;

/**
 * A JS FIFO implementation for the AudioWorklet. 3 assumptions for the
 * simpler operation:
 *  1. the push and the pull operation are done by 128 frames. (Web Audio
 *    API's render quantum size in the speficiation)
 *  2. the channel count of input/output cannot be changed dynamically.
 *    The AudioWorkletNode should be configured with the `.channelCount = k`
 *    (where k is the channel count you want) and
 *    `.channelCountMode = explicit`.
 *  3. This is for the single-thread operation. (obviously)
 *
 * @class
 */
class ChromeLabsRingBuffer {
  /**
   * @constructor
   * @param  {number} length Buffer length in frames.
   * @param  {number} channelCount Buffer channel count.
   */
  constructor(length, channelCount) {
    this._readIndex = 0;
    this._writeIndex = 0;
    this._framesAvailable = 0;

    this._channelCount = channelCount;
    this._length = length;
    this._channelData = [];
    for (let i = 0; i < this._channelCount; ++i) {
      this._channelData[i] = new Float32Array(length);
    }
  }

  /**
   * Getter for Available frames in buffer.
   *
   * @return {number} Available frames in buffer.
   */
  get framesAvailable() {
    return this._framesAvailable;
  }

  /**
   * Push a sequence of Float32Arrays to buffer.
   *
   * @param  {array} arraySequence A sequence of Float32Arrays.
   */
  push(arraySequence) {
    // The channel count of arraySequence and the length of each channel must
    // match with this buffer obejct.

    // Transfer data from the |arraySequence| storage to the internal buffer.
    let sourceLength = arraySequence[0].length;
    for (let i = 0; i < sourceLength; ++i) {
      let writeIndex = (this._writeIndex + i) % this._length;
      for (let channel = 0; channel < this._channelCount; ++channel) {
        this._channelData[channel][writeIndex] = arraySequence[channel][i];
      }
    }

    this._writeIndex += sourceLength;
    if (this._writeIndex >= this._length) {
      this._writeIndex = 0;
    }

    // For excessive frames, the buffer will be overwritten.
    this._framesAvailable += sourceLength;
    if (this._framesAvailable > this._length) {
      this._framesAvailable = this._length;
    }
  }

  /**
   * Pull data out of buffer and fill a given sequence of Float32Arrays.
   *
   * @param  {array} arraySequence An array of Float32Arrays.
   */
  pull(arraySequence) {
    // The channel count of arraySequence and the length of each channel must
    // match with this buffer obejct.

    // Validate arraySequence structure (this is custom code added to the module)
    if (!Array.isArray(arraySequence) || arraySequence.length !== this._channelCount) {
      throw new Error('Invalid arraySequence structure');
    }

    // Check dimensions
    let destinationLength = arraySequence[0].length;
    for (let channel = 0; channel < this._channelCount; ++channel) {
      if (
        !(arraySequence[channel] instanceof Float32Array) ||
        arraySequence[channel].length !== destinationLength
      ) {
        throw new Error('Invalid arraySequence dimensions');
      }
    }

    // If the FIFO is completely empty, do nothing.
    if (this._framesAvailable === 0) {
      return;
    }

    // let destinationLength = arraySequence[0].length;

    // Transfer data from the internal buffer to the |arraySequence| storage.
    for (let i = 0; i < destinationLength; ++i) {
      let readIndex = (this._readIndex + i) % this._length;
      for (let channel = 0; channel < this._channelCount; ++channel) {
        arraySequence[channel][i] = this._channelData[channel][readIndex];
      }
    }

    this._readIndex += destinationLength;
    if (this._readIndex >= this._length) {
      this._readIndex = 0;
    }

    this._framesAvailable -= destinationLength;
    if (this._framesAvailable < 0) {
      this._framesAvailable = 0;
    }
  }
} // class ChromeLabsRingBuffer
