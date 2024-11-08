import { useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { useFrame, useThree, extend, type Object3DNode } from '@react-three/fiber'
import { Points, shaderMaterial } from '@react-three/drei'
import * as THREE from 'three'
import { useControls } from 'leva'
import { useAudioStore } from '@/store/audioStore'

// Shaders
import vertexShader from '@/shaders/particles/vertex.glsl'
import fragmentShader from '@/shaders/particles/fragment.glsl'

import type { 
  ParticlesMaterialImpl, 
  ParticlesMaterialProps, 
  ParticlesProps,
  ParticlesRef 
} from '@/types/particles'

const ParticlesMaterial = shaderMaterial(
  {
    uSize: 0.03,
    uTime: 0,
    uDeltaTime: 0,
    uResolution: new THREE.Vector2(),
    uParticlesTexture: null,
    uColor: new THREE.Color('#0586ff'),
    uSurfaceColor: new THREE.Color('#DEF0FA'),
    uRadius: 1.0,
    uAverageAmplitude: 0.0,
    uRotation: 2.5,
    uSoundPlaying: false
  },
  vertexShader,
  fragmentShader
) as unknown as new () => ParticlesMaterialImpl

extend({ ParticlesMaterial })

declare module '@react-three/fiber' {
    interface ThreeElements {
      particlesMaterial: Object3DNode<ParticlesMaterialImpl, ParticlesMaterialProps> & ParticlesMaterialProps
    }
}

const Particles = forwardRef<ParticlesRef, ParticlesProps>(
  function Particles({ gpgpu, geometries, parameters }, ref) {
    const { size, viewport } = useThree()
    const pointsRef = useRef<THREE.Points>(null)
    const materialRef = useRef<ParticlesMaterialImpl>(null)
    const { isPlaying, averageAmplitude } = useAudioStore()
    
    const materialParams = useControls('Particle Colors', {
      color: '#0586ff',
      surfaceColor: '#DEF0FA',
    })

    useImperativeHandle(ref, () => ({
      updateUniforms: ({ uAverageAmplitude }: { uAverageAmplitude: number }) => {
        if (!materialRef.current) return
        materialRef.current.uniforms.uAverageAmplitude.value = uAverageAmplitude
      }
    }))

    const [uvArray, sizesArray] = useMemo(() => {
      const uvArray = new Float32Array(geometries.base.count * 2)
      const sizesArray = new Float32Array(geometries.base.count)

      for (let y = 0; y < gpgpu.size; y++) {
        for (let x = 0; x < gpgpu.size; x++) {
          const i = y * gpgpu.size + x
          const i2 = i * 2

          const uvX = (x + 0.5) / gpgpu.size
          const uvY = (y + 0.5) / gpgpu.size

          uvArray[i2 + 0] = uvX
          uvArray[i2 + 1] = uvY
          
          sizesArray[i] = Math.random()
        }
      }

      return [uvArray, sizesArray]
    }, [gpgpu.size, geometries.base.count])

    useFrame((state, delta) => {
      if (!materialRef.current) return
      
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.uDeltaTime.value = delta
      materialRef.current.uniforms.uAverageAmplitude.value = averageAmplitude
      materialRef.current.uniforms.uSoundPlaying.value = isPlaying
      materialRef.current.uniforms.uColor.value.set(materialParams.color)
      materialRef.current.uniforms.uSurfaceColor.value.set(materialParams.surfaceColor)
    })

    return (
      <Points 
        ref={pointsRef}
        limit={geometries.base.count}
        range={geometries.base.count}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-aParticlesUv"
            count={uvArray.length / 2}
            array={uvArray}
            itemSize={2}
          />
          <bufferAttribute
            attach="attributes-aSize"
            count={sizesArray.length}
            array={sizesArray}
            itemSize={1}
          />
        </bufferGeometry>
        <particlesMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uResolution={new THREE.Vector2(
              size.width * viewport.dpr, 
              size.height * viewport.dpr
            )}
          uParticlesTexture={gpgpu.particlesVariable?.renderTargets[0].texture}
        />
      </Points>
    )
  }
)

export default Particles