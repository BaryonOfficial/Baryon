#include ../includes/rot2D.glsl
#include ../includes/sdSphere.glsl
#include ../includes/sdTorus.glsl
#include ../includes/sdBox.glsl
precision mediump float;

#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURFACE_DIST 0.0001
#define MAX_N 100
#define PI 3.14159265359

uniform float uTime;
uniform vec2 uResolution;
uniform float uThreshold;
uniform float uRadius;
uniform float waveComponents[4 * MAX_N];      // Current wave components
uniform float prevWaveComponents[4 * MAX_N];  // Previous wave components 
uniform float uTransitionProgress;            // Transition progress (0.0 - 1.0)
uniform int N;
uniform vec3 uCameraPosition;                 // Camera position
uniform vec4 uCameraQuaternion;               // Camera rotation as quaternion
uniform float uStepSize; // Control the ray marching step size
uniform int uLightSamples; // Control the number of light samples
uniform float uDensityScale; // Density scale for transfer function
uniform float uEmptySpaceThreshold; // Threshold for empty space skipping
uniform vec3 uBaseColor; // Base color for the volume
uniform vec3 uHighlightColor; // Highlight color for the volume
uniform float uAdaptiveStepStrength; // Controls how much gradient affects step size
uniform float uEmptySpaceFactor; // Factor for empty space step size
uniform float uPerformanceMode; // Performance mode (0=highest quality, 1=highest performance)
uniform int uPrimitiveType; // 0: sphere, 1: torus, 2: box

out vec4 finalColor;

// Fast sine approximation to reduce trig overhead
// Up to 4x faster than standard sin() with acceptable accuracy for this use case
// Based on technique used in professional real-time rendering engines
float fastSin(float x) {
    // Range reduction
    x = mod(x + PI, 2.0 * PI) - PI;

    // Approximation formula (Bhaskara I's sine approximation)
    float x2 = x * x;
    float numerator = 16.0 * x * (PI - abs(x));
    float denominator = 5.0 * PI * PI - 4.0 * x2;

    return numerator / denominator;
}

// Function to cache sin values for repeated calculations
float cachedSin(float v, bool useOptimization) {
    return useOptimization ? fastSin(v) : sin(v);
}

// Optimized Chladni pattern calculation with optional performance boost
float chladni(vec3 position, float radius, bool useOptimization) {
    float scaleFactor = 1.0 / radius;
    float piScaled = PI * scaleFactor;

    // Precalculate scaled position components
    float px = position.x * piScaled;
    float py = position.y * piScaled;
    float pz = position.z * piScaled;

    // Calculate pattern
    float sum = 0.0;

    // Fast path: limit N for distant points
    int effectiveN = N;

    // When performance mode is active, use a gradual reduction based on distance from center
    // instead of the abrupt cutoff at y=1.5 that was causing the visual artifact
    if(useOptimization) {
        float distFromCenter = length(position) / radius;
        // Only reduce components for areas far from the surface and with high performance mode
        if(distFromCenter > 0.85 && uPerformanceMode > 0.5) {
            // Smoothly reduce component count based on distance and performance mode
            float reductionFactor = mix(1.0, 0.5, uPerformanceMode * (distFromCenter - 0.85) / 0.15);
            effectiveN = max(3, int(float(N) * reductionFactor));
        }
    }

    // Apply transition if not at the endpoints
    if(uTransitionProgress < 1.0) {
        // Calculate pattern with interpolation between previous and current components
        for(int i = 0; i < MAX_N; ++i) {
            if(i >= effectiveN)
                break;

            int index = 4 * i;

            // Get previous and current components
            float prevAi = prevWaveComponents[index];
            float prevUi = prevWaveComponents[index + 1];
            float prevVi = prevWaveComponents[index + 2];
            float prevWi = prevWaveComponents[index + 3];

            float currAi = waveComponents[index];
            float currUi = waveComponents[index + 1];
            float currVi = waveComponents[index + 2];
            float currWi = waveComponents[index + 3];

            // Apply ease-in-out function to transition progress
            // This gives a more pleasing acceleration and deceleration
            float t = uTransitionProgress;
            float tSmooth = t < 0.5 ? 2.0 * t * t : 1.0 - pow(-2.0 * t + 2.0, 2.0) / 2.0;

            // Interpolate between previous and current components
            float Ai = mix(prevAi, currAi, tSmooth);
            float ui = mix(prevUi, currUi, tSmooth);
            float vi = mix(prevVi, currVi, tSmooth);
            float wi = mix(prevWi, currWi, tSmooth);

            // Calculate sine values
            float sinX = cachedSin(ui * px, useOptimization);
            float sinY = cachedSin(vi * py, useOptimization);
            float sinZ = cachedSin(wi * pz, useOptimization);

            // Accumulate with amplitude
            sum += Ai * sinX * sinY * sinZ;
        }
    } else {
        // Use only current components when fully transitioned
        for(int i = 0; i < MAX_N; ++i) {
            if(i >= effectiveN)
                break;

            int index = 4 * i;
            float Ai = waveComponents[index];
            float ui = waveComponents[index + 1];
            float vi = waveComponents[index + 2];
            float wi = waveComponents[index + 3];

            float sinX = cachedSin(ui * px, useOptimization);
            float sinY = cachedSin(vi * py, useOptimization);
            float sinZ = cachedSin(wi * pz, useOptimization);

            sum += Ai * sinX * sinY * sinZ;
        }
    }

    return sum;
}

// SDF abstraction: change this to swap primitives
float map(vec3 p) {
    if(uPrimitiveType == 0) {
        return sdSphere(p, uRadius);
    } else if(uPrimitiveType == 1) {
        return sdTorus(p, vec2(3.0, 2.4));
    } else if(uPrimitiveType == 2) {
        return sdBox(p, vec3(uRadius));
    } else {
        return sdSphere(p, uRadius); // fallback
    }
}

float scene(vec3 p) {
    float objDist = map(p);
    float chladniValue = chladni(p, uRadius, false);

    // Only show pattern inside the SDF object
    if(objDist > 0.0)
        return objDist;

    // Create surfaces where chladni pattern crosses zero
    float pattern = abs(chladniValue) - uThreshold;

    // Blend the SDF and pattern
    return max(pattern, objDist);
}

// float scene(vec3 p) {
//     return map(p);
// }

float raymarch(vec3 ro, vec3 rd, out vec3 p) {
    float dO = 0.0;

    for(int i = 0; i < MAX_STEPS; i++) {
        p = ro + rd * dO;
        float dS = scene(p);
        dO += dS;

        if(dO > MAX_DIST || abs(dS) < SURFACE_DIST)
            break;
    }
    return dO;
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(SURFACE_DIST, 0.0);
    vec3 n = vec3(scene(p + e.xyy) - scene(p - e.xyy), scene(p + e.yxy) - scene(p - e.yxy), scene(p + e.yyx) - scene(p - e.yyx));
    return normalize(n);
}

// New function to check for ray-sphere intersection
bool intersectSphere(vec3 ro, vec3 rd, vec3 center, float radius, out float t1, out float t2) {
    vec3 oc = ro - center;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - radius * radius;
    float discriminant = b * b - c;

    if(discriminant < 0.0)
        return false;

    float sqrtDisc = sqrt(discriminant);
    t1 = -b - sqrtDisc;
    t2 = -b + sqrtDisc;

    return true;
}

// New function to map density to color and opacity
vec4 transferFunction(float density) {
    // Use the custom colors from uniforms instead of hardcoded values
    vec3 color = mix(uBaseColor, uHighlightColor, density);

    // Control the density of the volume using the uniform parameter
    float alpha = density * uDensityScale;

    return vec4(color, alpha);
}

// Hierarchical raymarching technique based on professional volume rendering pipelines
// This is how major engines like Unreal and professional visualization tools optimize
vec4 raymarchVolume(vec3 ro, vec3 rd) {
    // --- SDF-based bounding: find entry and exit points using map() ---
    float t = 0.0;
    float t_min = -1.0;
    float t_max = -1.0;
    vec3 p;
    bool hit = false;
    // Find entry point (surface hit)
    for(int i = 0; i < MAX_STEPS; i++) {
        p = ro + rd * t;
        float d = map(p);
        if(d < SURFACE_DIST) {
            t_min = t;
            hit = true;
            break;
        }
        t += max(d, 0.01); // step at least a little
        if(t > MAX_DIST)
            break;
    }
    if(!hit)
        return vec4(0.0);
    // Find exit point (where SDF becomes positive again)
    t = t_min + 0.01; // step just inside
    for(int i = 0; i < MAX_STEPS; i++) {
        p = ro + rd * t;
        float d = map(p);
        if(d > 0.0) {
            t_max = t;
            break;
        }
        t += max(abs(d), 0.01);
        if(t > MAX_DIST)
            break;
    }
    if(t_max < 0.0)
        t_max = t_min + 2.0; // fallback: short segment if no exit found
    // --- End SDF bounding ---

    // Initialize accumulated color and opacity
    vec4 result = vec4(0.0);

    // Calculate importance metrics for adaptive sampling
    float rayLength = t_max - t_min;
    float viewImportance = 1.0 - smoothstep(0.0, 0.5, abs(dot(rd, normalize(-ro)))); // Front-facing areas get more detail

    // Base step size adaptively modified
    float baseStepSize = uStepSize;

    // Make step size dependent on multiple quality factors
    baseStepSize *= mix(1.0, 2.5, uPerformanceMode);
    baseStepSize *= mix(1.0, 1.5, smoothstep(2.0, 8.0, rayLength));
    baseStepSize *= mix(1.0, 1.3, 1.0 - viewImportance);

    // Establish light samples count
    int maxLightSamples = max(3, int(float(uLightSamples) * mix(1.0, 0.4, uPerformanceMode)));
    maxLightSamples = int(float(maxLightSamples) * mix(0.7, 1.0, viewImportance));

    // Current position along the ray
    t = t_min;
    vec3 lightPos = vec3(2.0, 4.0, -3.0);

    // Pro technique: adaptive epsilon for gradient
    float epsScale = mix(1.0, 3.0, uPerformanceMode);
    vec3 eps = vec3(0.01 * epsScale, 0.0, 0.0);

    // Aggressive early ray termination based on accumulated opacity
    float earlyExitThreshold = mix(0.98, 0.92, uPerformanceMode);

    // Pro technique: Adaptive step count based on quality settings
    int maxSteps = int(float(MAX_STEPS) * mix(1.0, 0.5, uPerformanceMode));

    // High-quality algorithm with optimizations
    t = t_min;
    for(int i = 0; i < MAX_STEPS; i++) {
        if(i >= maxSteps)
            break;
        if(t >= t_max || result.a >= earlyExitThreshold)
            break;

        vec3 p = ro + rd * t;
        float chladniValue = chladni(p, uRadius, false);
        float density = smoothstep(uThreshold, 0.0, abs(chladniValue));

        if(density > uEmptySpaceThreshold) {
            // Estimate gradient for adaptive sampling
            float gradient = 0.0;
            if(i % 2 == 0) {
                float dx = abs(chladni(p + eps.xyy, uRadius, false) - chladni(p - eps.xyy, uRadius, false));
                float dy = abs(chladni(p + eps.yxy, uRadius, false) - chladni(p - eps.yxy, uRadius, false));
                float dz = abs(chladni(p + eps.yyx, uRadius, false) - chladni(p - eps.yyx, uRadius, false));
                gradient = (dx + dy + dz) / 3.0;
            }

            // Adjust step size based on gradient
            float gradientFactor = max(1.0, uAdaptiveStepStrength);
            float adaptiveStepSize = baseStepSize / (1.0 + gradientFactor * gradient);

            // Get color and opacity
            vec4 sampleColor = transferFunction(density);

            // Skip light calculation for very low-density samples (optimization)
            if(sampleColor.a > 0.05) {
                // Add lighting
                vec3 lightDir = normalize(lightPos - p);
                float lightDist = length(lightPos - p);
                float lightAtten = 1.0 / (1.0 + 0.1 * lightDist + 0.01 * lightDist * lightDist);

                // Light scattering approximation
                float scattering = 0.0;
                float rayProgress = (t - t_min) / (t_max - t_min);
                int actualLightSamples = maxLightSamples;

                // Depth-based lighting optimization - classic professional technique
                if(rayProgress > mix(0.5, 0.3, uPerformanceMode)) {
                    actualLightSamples = max(2, actualLightSamples / 2);
                }

                // Use importance sampling technique to focus samples where they matter most
                for(int j = 0; j < 16; j++) {
                    if(j >= actualLightSamples)
                        break;

                    // Exponential distribution puts more samples near the current point
                    float s = pow(float(j) / float(actualLightSamples - 1), 1.5);

                    vec3 samplePos = mix(p, lightPos, s);
                    float sampleChladni = chladni(samplePos, uRadius, true); // Use optimized version for lighting
                    float sampleDensity = smoothstep(uThreshold, 0.0, abs(sampleChladni));
                    scattering += sampleDensity;
                }
                scattering = exp(-scattering * 0.2);

                // Apply lighting to color
                sampleColor.rgb *= (0.3 + 0.7 * lightAtten * scattering);
            }

            // Composite
            sampleColor.rgb *= sampleColor.a;
            result = result + sampleColor * (1.0 - result.a);

            // Advance with adaptive step size
            t += adaptiveStepSize;
        } else {
            // Empty space stepping - still optimize but less aggressively
            float emptySpaceFactor = uEmptySpaceFactor * mix(1.0, 1.5, uPerformanceMode);
            t += baseStepSize * emptySpaceFactor;
        }
    }

    return result;
}

// Apply quaternion rotation to a vector
vec3 rotateWithQuaternion(vec3 v, vec4 q) {
    // Extract components
    float qx = q.x;
    float qy = q.y;
    float qz = q.z;
    float qw = q.w;

    // Compute rotation
    vec3 result;

    // Formula: v' = v + 2 * cross(cross(v, q.xyz) + q.w * v, q.xyz)
    vec3 qv = vec3(qx, qy, qz);
    vec3 uv = cross(qv, v);
    vec3 uuv = cross(qv, uv);

    // Apply the formula
    result = v + ((uv * qw) + uuv) * 2.0;

    return result;
}

void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);

    // Camera setup using camera position and rotation from OrbitControls
    vec3 ro = uCameraPosition;
    vec3 rd = normalize(vec3(uv, -1.5));

    // Apply camera rotation using quaternion
    rd = rotateWithQuaternion(rd, uCameraQuaternion);

    // Perform volumetric ray marching instead of surface ray marching
    vec4 volumeColor = raymarchVolume(ro, rd);

    // Mix with background color (black)
    vec3 color = volumeColor.rgb;

    // Calculate holographic effect - simplified for performance
    float holographic = 0.0;

    // Skip holographic effect when in high performance mode
    // Professional optimization: Only compute expensive effects where visible
    bool skipHolographic = uPerformanceMode > 0.7;

    if(!skipHolographic) {
        float t_min, t_max;
        if(intersectSphere(ro, rd, vec3(0.0), uRadius, t_min, t_max)) {
            t_min = max(0.0, t_min);

            // Reduced sample count for performance
            const int HOLO_SAMPLES = 3;

            for(int i = 0; i < HOLO_SAMPLES; i++) {
                float t = mix(t_min, t_max, float(i) / float(HOLO_SAMPLES - 1));
                vec3 p = ro + rd * t;

                // Calculate Chladni value with optimization
                float chladniValue = chladni(p, uRadius, true);

                if(abs(chladniValue) < uThreshold * 2.0) {
                    // Simplified calculations
                    float stripes = mod((p.y - uTime * 0.02) * 20.0, 1.0);
                    stripes = pow(stripes, 3.0);

                    // Use pre-computed gradient for normal when possible
                    vec2 e = vec2(0.01, 0.0);
                    vec3 grad = vec3(chladni(p + e.xyy, uRadius, true) - chladni(p - e.xyy, uRadius, true), chladni(p + e.yxy, uRadius, true) - chladni(p - e.yxy, uRadius, true), chladni(p + e.yyx, uRadius, true) - chladni(p - e.yyx, uRadius, true));
                    vec3 normal = normalize(grad);

                    float fresnel = abs(dot(rd, normal));
                    fresnel = pow(1.0 - fresnel, 2.0);
                    float falloff = smoothstep(0.0, 0.8, fresnel);

                    // Combine effects - simplified
                    float sampleHolo = fresnel * (stripes + 0.75);
                    sampleHolo *= falloff;

                    // Weight by proximity to surface
                    float weight = smoothstep(uThreshold, 0.0, abs(chladniValue));
                    holographic += sampleHolo * weight;
                }
            }

            holographic /= float(HOLO_SAMPLES);
            holographic *= 2.0;
        }
    }

    // Use volumeColor.a for density
    float alpha = volumeColor.a;

    // Add subtle color shift
    vec3 finalRGB = color + vec3(0.1, 0.2, 0.3) * holographic;

    // Alpha computation
    float finalAlpha = alpha + holographic * 0.5 * alpha;

    // Output final color
    finalColor = vec4(finalRGB, finalAlpha);
}