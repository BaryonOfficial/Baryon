import { ToneMapping, EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

import { useThree } from '@react-three/fiber';

interface EffectsProps {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
}

export function PostProcessingEffects({
  bloomStrength = 0.36,
  bloomRadius = -2.0,
  bloomThreshold = 0.4,
}: EffectsProps) {
  const { gl } = useThree();
  const isLowPerformance = gl.getPixelRatio() === 1 && !gl.capabilities.isWebGL2;

  return (
    <EffectComposer>
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Bloom intensity={bloomStrength} radius={bloomRadius} luminanceThreshold={bloomThreshold} />
      {isLowPerformance ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
