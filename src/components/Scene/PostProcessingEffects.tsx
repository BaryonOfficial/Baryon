import { ToneMapping, EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useThree } from '@react-three/fiber';
import { useControls } from 'leva';
import { defaultBloomSettings } from '../../types/bloom.types';
import * as THREE from 'three';
export function PostProcessingEffects() {
  const { gl } = useThree();
  const isLowPerformance = gl.getPixelRatio() === 1 && !gl.capabilities.isWebGL2;

  const bloomSettings = useControls(
    'Bloom',
    {
      bloomStrength: {
        value: defaultBloomSettings.bloomStrength,
        min: 0,
        max: 2,
        step: 0.01,
      },
      bloomRadius: {
        value: defaultBloomSettings.bloomRadius,
        min: -5,
        max: 5,
        step: 0.1,
      },
      bloomThreshold: {
        value: defaultBloomSettings.bloomThreshold,
        min: 0,
        max: 1,
        step: 0.01,
      },
    },
    {
      collapsed: true,
    }
  );

  return (
    <EffectComposer
      multisampling={0}
      frameBufferType={gl.capabilities.isWebGL2 ? THREE.HalfFloatType : undefined}
    >
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Bloom
        intensity={bloomSettings.bloomStrength}
        radius={bloomSettings.bloomRadius}
        luminanceThreshold={bloomSettings.bloomThreshold}
      />
      {isLowPerformance ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
