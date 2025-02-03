---
sidebar_position: 3
---

# GPU Compute Pipeline

## Overview

The GPU compute pipeline in Baryon implements a sophisticated GPGPU (General-Purpose computing on Graphics Processing Units) system for processing audio data and calculating acoustic physics in real-time. This pipeline is crucial for achieving high-performance visualization of audio characteristics.

## Architecture

### GPGPU Computation System

The system uses WebGL for general-purpose computation, implementing:

- Texture-based data storage
- GLSL shader computations
- Real-time data processing
- Parallel acoustic calculations

## Audio Data Processing

### Data Input

The GPU pipeline processes audio data through the audioData.glsl shader, which receives:

```glsl
uniform sampler2D tPitches;    // Pitch frequencies from Essentia (Float32Array)
uniform sampler2D tDataArray;  // Frequency bin amplitudes (Uint8Array)
```

### Audio Data Flow

1. **Pitch Processing**

   - Receives pitch frequencies detected by Essentia
   - Each pitch is used to calculate acoustic normal modes
   - Pitch data stored in texture with length of `capacity`

2. **Amplitude Mapping**

   ```glsl
   float frequencyToIndex(float pitch) {
       float nyquist = sampleRate / 2.0;
       return (pitch / nyquist) * (bufferSize / 2.0);
   }
   ```

   - Maps each pitch to its corresponding frequency bin
   - Samples amplitude from frequency data texture
   - Normalizes amplitude values for visualization

3. **Output Format**
   ```glsl
   gl_FragColor = vec4(vec3(modeNumbers), amplitude);
   ```
   - x, y, z: Normal mode numbers for each dimension
   - w: Corresponding amplitude for the pitch

### Configuration Parameters

```glsl
uniform float sampleRate;      // Audio sample rate (default 44.1kHz)
uniform float bufferSize;      // FFT size (4096 samples)
uniform int capacity;          // Number of pitches to process (default 5)
uniform float uRadius;         // Acoustic space radius
```

## Acoustic Physics Computation

### Normal Mode Calculation

The system implements multiple methods for calculating acoustic normal modes:

1. **Secant Method**

```glsl
ivec3 findNormalModesSecant(float pitch) {
    float c = SOUND_SPEED_AIR;
    float l = uRadius;
    float invL2 = 1.0 / (l * l);

    ivec3 n0 = ivec3(1);
    ivec3 n1 = ivec3(2);

    // Iterative calculation
    for(int i = 0; i < MAX_ITERATIONS; i++) {
        // ... mode calculation logic
    }

    return n1;
}
```

2. **Bisection Method (Fallback)**

```glsl
float bisection(float lower, float upper, float pitch) {
    for(int i = 0; i < MAX_ITERATIONS; i++) {
        float midpoint = (lower + upper) / 2.0;
        float fMid = objectiveFunction(midpoint, pitch);

        // ... convergence logic
    }
    return (lower + upper) / 2.0;
}
```

### Physical Constants

```glsl
const float SOUND_SPEED_AIR = 340.0;  // Speed of sound in air (m/s)
const float TOLERANCE = 1.0;          // Calculation tolerance
const int MAX_ITERATIONS = 200;       // Maximum iteration count
```

## Data Processing Pipeline

### 1. Frequency Analysis

- Conversion of pitch to frequency index
- Amplitude sampling from frequency data
- Normalization of values

```glsl
float frequencyToIndex(float pitch) {
    float nyquist = sampleRate / 2.0;
    return (pitch / nyquist) * (bufferSize / 2.0);
}
```

### 2. Mode Calculation

1. **Input Processing**

   - Pitch extraction from texture
   - Amplitude sampling
   - Parameter normalization

2. **Normal Mode Computation**

   - Primary calculation using secant method
   - Fallback to bisection method if needed
   - Validation of results

3. **Output Generation**
   - Mode number packaging
   - Amplitude integration
   - Result formatting

## Optimization Techniques

### Performance Optimization

1. **Computational Efficiency**

   - Early termination conditions
   - Optimized iteration counts
   - Efficient mathematical operations

2. **Memory Management**

   - Texture-based data storage
   - Efficient data packing
   - Minimal temporary variable usage

3. **Parallel Processing**
   - GPU-parallel execution
   - Batch data processing
   - Efficient workload distribution

### Numerical Stability

1. **Error Handling**

   - Fallback computation methods
   - Boundary condition checking
   - Result validation

2. **Precision Management**
   - Appropriate data type usage
   - Numerical stability checks
   - Error tolerance control

## Integration Points

### Audio Pipeline Integration

1. **Data Reception**

   - Real-time audio data input
   - Texture updates
   - Parameter synchronization

2. **Processing Coordination**
   - Synchronized computation timing
   - Buffer management
   - State coordination

### Visualization Integration

1. **Output Format**

   - Vec4 output packaging
   - Normal mode vector components
   - Amplitude integration

2. **Rendering Pipeline Connection**
   - Particle system updates
   - Visual parameter mapping
   - Real-time state updates

## Technical Specifications

### Hardware Requirements

- WebGL 2.0 support
- Floating-point texture support
- Sufficient GPU memory

### Performance Metrics

- Real-time processing capability
- Sub-frame computation time
- Minimal latency overhead

### Limitations

- Maximum iteration constraints
- Precision limitations
- Hardware dependencies
