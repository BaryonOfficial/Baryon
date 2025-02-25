import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useControls } from 'leva';
import PropTypes from 'prop-types';
import { useState } from 'react';

// Define presets for different bloom intensities
const PRESETS = {
  subtle: {
    bloomIntensity: 0.8,
    bloomThreshold: 0.7,
    bloomSmoothing: 0.7,
    bloomRadius: 0.5,
  },
  moderate: {
    bloomIntensity: 1.2,
    bloomThreshold: 0.6,
    bloomSmoothing: 0.8,
    bloomRadius: 0.6,
  },
  intense: {
    bloomIntensity: 1.5,
    bloomThreshold: 0.5,
    bloomSmoothing: 0.9,
    bloomRadius: 0.7,
  },
  extreme: {
    bloomIntensity: 3.0,
    bloomThreshold: 0.16,
    bloomSmoothing: 1.0,
    bloomRadius: 0.8,
  },
};

/**
 * PostProcessing component that adds effects to the scene
 * @param {Object} props - Component props
 * @param {boolean} [props.useLevaControls=true] - Whether to use Leva controls
 * @param {string} [props.preset='moderate'] - Initial preset to use
 * @param {Object} [props.initialValues] - Custom initial values to override preset (optional)
 * @returns {JSX.Element} PostProcessing component
 */
export const PostProcessing = ({
  useLevaControls = true,
  preset = 'moderate',
  initialValues = {},
}) => {
  // Track which preset is currently active
  const [activePreset, setActivePreset] = useState(preset);

  // Initialize with the selected preset values merged with initialValues
  const defaultValues = {
    enableBloom: true,
    ...PRESETS[activePreset],
    ...initialValues,
  };

  // Use Leva controls if enabled
  const [controls, set] = useControls('Post Processing', () => ({
    // Preset selector
    preset: {
      value: activePreset,
      options: Object.keys(PRESETS),
      label: 'Preset',
      onChange: (presetName) => {
        if (PRESETS[presetName]) {
          // Apply the preset values but keep the enableBloom setting
          setActivePreset(presetName);
          set({
            bloomIntensity: PRESETS[presetName].bloomIntensity,
            bloomThreshold: PRESETS[presetName].bloomThreshold,
            bloomSmoothing: PRESETS[presetName].bloomSmoothing,
            bloomRadius: PRESETS[presetName].bloomRadius,
          });
        }
      },
    },
    // Bloom controls
    enableBloom: {
      value: defaultValues.enableBloom,
      label: 'Enable Bloom',
    },
    bloomIntensity: {
      value: defaultValues.bloomIntensity,
      min: 0.0,
      max: 3.0,
      step: 0.1,
      label: 'Bloom Intensity',
    },
    bloomThreshold: {
      value: defaultValues.bloomThreshold,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Bloom Threshold',
    },
    bloomSmoothing: {
      value: defaultValues.bloomSmoothing,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      label: 'Bloom Smoothing',
    },
    bloomRadius: {
      value: defaultValues.bloomRadius,
      min: 0.0,
      max: 1.0,
      step: 0.05,
      label: 'Bloom Radius',
    },
  }));

  // Use either the controls values or the fixed values based on useLevaControls flag
  const effectValues = useLevaControls ? controls : defaultValues;

  // If bloom is disabled, return null
  if (!effectValues.enableBloom) return null;

  return (
    <EffectComposer>
      <Bloom
        intensity={effectValues.bloomIntensity}
        luminanceThreshold={effectValues.bloomThreshold}
        luminanceSmoothing={effectValues.bloomSmoothing}
        radius={effectValues.bloomRadius}
      />
    </EffectComposer>
  );
};

// Add prop types validation
PostProcessing.propTypes = {
  useLevaControls: PropTypes.bool,
  preset: PropTypes.oneOf(['subtle', 'moderate', 'intense', 'extreme']),
  initialValues: PropTypes.shape({
    enableBloom: PropTypes.bool,
    bloomIntensity: PropTypes.number,
    bloomThreshold: PropTypes.number,
    bloomSmoothing: PropTypes.number,
    bloomRadius: PropTypes.number,
  }),
};

export default PostProcessing;
