---
sidebar_position: 1
---

# System Architecture

## Overview

The Baryon system implements a sophisticated real-time audio analysis and visualization pipeline that leverages GPU computation for efficient processing. The system consists of three main components:

1. Audio Processing Pipeline
2. GPU Compute Pipeline
3. Visualization Layer

## Audio Processing Pipeline

The audio system is built on the Web Audio API and uses an AudioWorklet for real-time audio processing. Key components include:

### Audio Manager (`AudioManager` class)

- Handles audio file playback and microphone input
- Manages the Web Audio API context and nodes
- Processes real-time audio data through FFT analysis
- Supports multi-source mixing (file + microphone)

### Audio Worklet Processor

- Implements real-time audio processing using the Essentia.js library
- Performs pitch detection using the PredominantPitchMelodia algorithm
- Processes audio in configurable buffer sizes
- Communicates with the main thread using SharedArrayBuffer

## GPU Compute Pipeline

The GPU computation is handled through a GPGPU (General-Purpose computing on Graphics Processing Units) system:

### Audio Data Processing

- Converts audio frequency data into GPU-compatible formats
- Processes pitch and amplitude information
- Calculates normal modes for acoustic modeling

### GPGPU Shader Implementation

- Uses custom GLSL shaders for parallel computation
- Implements acoustic physics calculations
- Processes audio data in real-time for visualization

## Data Flow

1. **Audio Input**

   - Audio data is captured from either file playback or microphone
   - Processed through the AudioWorklet in real-time
   - FFT analysis provides frequency domain data

2. **Audio Analysis**

   - PredominantPitchMelodia algorithm extracts pitch information
   - Amplitude data is calculated from frequency analysis
   - Data is stored in SharedArrayBuffer for efficient, real-time cyclic transfer

3. **GPU Processing**

   - Pitch and amplitude data is transferred to GPU
   - GLSL shaders process the data in parallel
   - Normal modes are calculated for acoustic visualization

4. **Visualization**
   - Processed data drives particle system behavior
   - Real-time updates reflect audio characteristics
   - GPU-accelerated rendering ensures smooth performance

## System Requirements

### Audio Processing

- Sample Rate: 44.1kHz (default)
- FFT Size: 4096 samples
- Buffer Size: Configurable (determines the size of the audio data that is processed in each step)
- Hop Size: Frame Size / 4

### Pitch Detection

- Frequency Range: 200Hz - ~2.5kHz
- Algorithm: PredominantPitchMelodia
- Frame-wise processing with averaging

### Hardware Requirements

- WebGL 2.0 support
- Audio input/output capability
- Sufficient GPU memory for real-time processing

## Framework Dependencies

The system relies on several key frameworks:

1. **Web Audio API & THREE.js**

   - Core audio processing and analysis
   - See [Audio Analysis Pipeline](./audio-analysis.md) for details

2. **WebGL & GLSL**

   - GPU computation and visualization
   - See [GPU Compute Pipeline](./gpu-compute.md) for details

3. **Essentia.js**
   - Advanced audio feature extraction
   - Real-time pitch detection

## Framework Migration Points

### Current Web Implementation

The system currently relies on THREE.js for audio analysis:

```typescript
// Key audio analysis methods (THREE.AudioAnalyser)
getAverageFrequency(); // Used for amplitude data
getFrequencyData(); // Used for frequency spectrum data
```

These methods are used in the following critical paths:

1. **Audio Analysis Pipeline**

   - `AudioManager.audioAnalysis()` method
   - Real-time frequency data processing
   - Amplitude calculation for visualization

2. **Data Flow Integration Points**
   - Audio input processing
   - FFT analysis results
   - GPU texture updates

### Framework Migration (e.g., JUCE/VST3)

When migrating to a different audio framework:

1. **Core Components to Replace**

   - THREE.AudioAnalyser methods
   - Web Audio API nodes
   - SharedArrayBuffer communication

2. **Data Format Compatibility**

   - Maintain FFT size (4096 samples)
   - Match frequency data format (Uint8Array)
   - Preserve amplitude scaling

3. **Integration Considerations**
   - Real-time processing requirements
   - Buffer size compatibility
   - Thread-safe data transfer

For detailed migration instructions, see the [Audio Analysis Pipeline](./audio-analysis.md#framework-migration-considerations) documentation.
