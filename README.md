# Baryon - Interactive 3D Chladni Pattern Visualizer

An interactive WebGL-based visualizer for 3D Chladni patterns using React Three Fiber and custom GLSL shaders.

## Features

- Real-time 3D visualization of Chladni patterns
- Interactive controls for pattern parameters
- Smooth GPU-accelerated transitions between patterns
- Volumetric rendering with customizable settings
- Auto-generation of new patterns

## Controls

### Mouse/Touch Controls

- **Drag**: Rotate the pattern
- **Scroll/Pinch**: Zoom in/out

### UI Controls

- **Volumetric Rendering**: Adjust rendering parameters like step size, density, and thresholds
- **Color Settings**: Change base and highlight colors
- **Wave Components**:
  - Adjust the radius of the sphere
  - Generate new patterns with the "Generate New" button
- **Auto Generate**:
  - Enable automatic generation of new patterns at specified intervals
  - Adjust the transition duration between patterns

## Wave Components

The patterns are generated using a combination of wave components, each with:

- Amplitude: Controls the strength of the wave
- Frequencies (u, v, w): Control the pattern's complexity in different dimensions

Transitions between patterns are handled directly by the GPU for smooth and efficient morphing effects.

## Technical Details

- Pattern transitions use GPU-based interpolation in the fragment shader
- All wave component interpolation happens in parallel on the GPU
- The blend factor between patterns is animated using React's animation frame

## Development

This project uses:

- React and React Three Fiber for 3D rendering
- Three.js for WebGL integration
- GLSL shaders for volumetric rendering
- Leva for the UI controls

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Open your browser to the local development URL (typically http://localhost:5173)

Enjoy exploring the beautiful world of 3D Chladni patterns!
