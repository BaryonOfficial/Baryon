---
sidebar_position: 2
---

# Audio Analysis Pipeline

## Implementation Details

### Audio Processing Components

The audio pipeline consists of two main processing components:

1. **THREE.AudioAnalyser Integration**

```typescript
class AudioManager {
  private audioAnalysis(): AudioAnalysisResult {
    const inputFileData = {
      amplitude: analyser.getAverageFrequency(),
      freq: analyser.getFrequencyData(),
    };
    return {
      avgAmplitude: inputFileData.amplitude,
      freqData: inputFileData.freq,
    };
  }
}
```

2. **AudioWorklet Processing**

```typescript
class AudioDataProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    // Process audio data
    const pitchData = this._essentia.PredominantPitchMelodia(
      accumDataVector
      /* configuration parameters */
    );

    // Write to SharedArrayBuffer
    this._audio_writer.enqueue([meanPitch]);
    return true;
  }
}
```

### Buffer Management

1. **Ring Buffer Configuration**

```javascript
constructor(options) {
  this._bufferSize = options.processorOptions.bufferSize;
  this._frameSize = this._bufferSize / 2;
  this._hopSize = this._frameSize / 4;
}
```

2. **Data Transfer**

```typescript
// SharedArrayBuffer setup for real-time transfer
const sab = RingBuffer.getStorageForCapacity(capacity, Float32Array);
const rb = new RingBuffer(sab, Float32Array);
```

## Framework Migration Guide

### Current Implementation (THREE.js)

The system uses THREE.AudioAnalyser for two critical functions:

```typescript
// 1. Frequency Analysis
const frequencyData = analyser.getFrequencyData();
// Returns Uint8Array of frequency domain data
// Used for: Spectral analysis, visualization

// 2. Amplitude Analysis
const amplitude = analyser.getAverageFrequency();
// Returns average amplitude (0-255)
// Used for: Volume visualization, particle behavior
```

### JUCE/VST3 Migration

#### 1. Frequency Analysis Replacement

```cpp
class AudioProcessor : public juce::AudioProcessor {
    void processBlock(juce::AudioBuffer<float>& buffer,
                     juce::MidiBuffer& midiMessages) override {
        // Configure FFT
        juce::dsp::FFT fft(fftOrder);
        juce::dsp::WindowingFunction<float> window(fftSize,
            juce::dsp::WindowingFunction<float>::hann);

        // Process FFT
        fft.performFrequencyOnlyForwardTransform(fftData);

        // Match THREE.js output format
        for (int i = 0; i < fftSize/2; ++i) {
            uint8_t magnitude = juce::jlimit(0, 255,
                juce::jmap(fftData[i], 0.0f, 1.0f, 0.0f, 255.0f));
            // Store in format compatible with current system
        }
    }
};
```

#### 2. Amplitude Analysis Replacement

```cpp
float calculateAverageAmplitude(const juce::AudioBuffer<float>& buffer) {
    float sum = 0.0f;
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel) {
        const float* channelData = buffer.getReadPointer(channel);
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample) {
            sum += std::abs(channelData[sample]);
        }
    }
    // Scale to match THREE.js range (0-255)
    return (sum / (buffer.getNumSamples() * buffer.getNumChannels())) * 255.0f;
}
```

### Integration Requirements

1. **Data Format Compatibility**

   - FFT size must match (4096 samples)
   - Frequency data must be Uint8Array compatible
   - Amplitude range must be 0-255

2. **Real-time Processing**

   - Use JUCE's real-time thread
   - Implement lock-free data structures
   - Match current buffer sizes

3. **Parameter Updates**
   - Implement VST3 parameter interface
   - Use atomic operations for thread safety
   - Match current update rates
