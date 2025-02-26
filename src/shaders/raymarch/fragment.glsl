#include ../includes/rot2D.glsl
#include ../includes/sdSphere.glsl
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
uniform float waveComponentsTarget[4 * MAX_N]; // Target wave components
uniform float uBlendFactor;                   // Blend factor between current and target (0.0 to 1.0)
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

out vec4 finalColor;

// Function to calculate the Chladni pattern displacement with visually pleasing transitions for music visualization
float chladni(vec3 position, float radius) {
    float scaleFactor = 1.0 / radius;
    float piScaled = PI * scaleFactor;

    // Precalculate scaled position components
    float px = position.x * piScaled;
    float py = position.y * piScaled;
    float pz = position.z * piScaled;

    // Calculate current pattern
    float currentSum = 0.0;
    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];

        float sinX = sin(ui * px);
        float sinY = sin(vi * py);
        float sinZ = sin(wi * pz);

        currentSum += Ai * sinX * sinY * sinZ;
    }

    // Calculate target pattern
    float targetSum = 0.0;
    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponentsTarget[index];
        float ui = waveComponentsTarget[index + 1];
        float vi = waveComponentsTarget[index + 2];
        float wi = waveComponentsTarget[index + 3];

        float sinX = sin(ui * px);
        float sinY = sin(vi * py);
        float sinZ = sin(wi * pz);

        targetSum += Ai * sinX * sinY * sinZ;
    }

    // Apply easing function to blend factor for more natural transition pacing
    // Using smoothstep for a subtle ease-in/ease-out effect
    float easedBlend = smoothstep(0.0, 1.0, uBlendFactor);

    // Add subtle turbulence during transition for visual interest
    // This creates a slight "energy" effect during transitions without being chaotic
    float turbulence = 0.0;
    if(uBlendFactor > 0.0 && uBlendFactor < 1.0) {
        // Simple turbulence effect that's strongest in the middle of the transition
        float turbAmt = sin(uBlendFactor * PI) * 0.33; // Max 33% turbulence

        // Use position and time to create subtle movement in the turbulence
        float turbNoise = sin(px * 2.0 + uTime) * sin(py * 2.0 + uTime) * sin(pz * 2.0 + uTime);
        turbulence = turbNoise * turbAmt;
    }

    // Blend between patterns with added turbulence
    return mix(currentSum, targetSum, easedBlend) + turbulence;
}

float scene(vec3 p) {
    float sphereDist = sdSphere(p, 2.0);
    float chladniValue = chladni(p, uRadius);

    // Only show pattern inside sphere
    if(sphereDist > 0.0)
        return sphereDist;

    // Create surfaces where chladni pattern crosses zero
    float pattern = abs(chladniValue) - uThreshold;

    // Blend the sphere and pattern
    return max(pattern, sphereDist);
}

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

// Replace the existing raymarch function with this volumetric version
vec4 raymarchVolume(vec3 ro, vec3 rd) {
    // Find intersection with bounding sphere
    float t_min, t_max;
    if(!intersectSphere(ro, rd, vec3(0.0), 2.0, t_min, t_max))
        return vec4(0.0);

    // Start from camera if we're inside the sphere
    t_min = max(0.0, t_min);

    // Initialize accumulated color and opacity
    vec4 result = vec4(0.0);

    // Base step size from uniform - affected by performance mode
    float baseStepSize = uStepSize * mix(1.0, 2.0, uPerformanceMode);

    // Calculate distance from camera to sphere center (but don't use for LOD)
    float distanceToCenter = length(ro);

    // Calculate step size based on ray length instead of camera distance
    // This keeps step size relative to volume size, not camera position
    float rayLength = t_max - t_min;
    float stepSizeFactor = mix(1.0, 1.5, smoothstep(2.0, 8.0, rayLength));
    baseStepSize *= stepSizeFactor;

    // Use consistent light samples regardless of distance
    int maxLightSamples = max(4, int(float(uLightSamples) * (1.0 - uPerformanceMode * 0.5)));

    // Current position along the ray
    float t = t_min;

    // Number of light samples for scattering effects
    vec3 lightPos = vec3(2.0, 4.0, -3.0);

    // Adaptive epsilon for gradient calculation based on performance mode only
    float epsScale = mix(1.0, 2.0, uPerformanceMode);
    vec3 eps = vec3(0.01 * epsScale, 0.0, 0.0);

    // Early ray termination threshold - more aggressive in performance mode
    float earlyExitThreshold = 0.95 - 0.1 * uPerformanceMode;

    // March through the volume with adaptive step size
    int maxSteps = int(float(MAX_STEPS) * mix(1.0, 0.6, uPerformanceMode));
    for(int i = 0; i < MAX_STEPS; i++) {
        if(i >= maxSteps)
            break;

        // Exit the loop if we've reached the end of the volume or maximum opacity
        if(t >= t_max || result.a >= earlyExitThreshold)
            break;

        vec3 p = ro + rd * t;

        // Get Chladni value at this point
        float chladniValue = chladni(p, uRadius);

        // Convert to density - higher density where Chladni value is closer to zero
        float density = smoothstep(uThreshold, 0.0, abs(chladniValue));

        // In high performance mode, use a higher empty space threshold to skip more samples
        float effectiveEmptyThreshold = uEmptySpaceThreshold * mix(1.0, 2.0, uPerformanceMode);

        // Skip empty space regions for performance
        if(density > effectiveEmptyThreshold) {
            // Estimate detail level by computing local gradient for adaptive sampling
            float gradient = 0.0;
            if(uPerformanceMode < 0.5 || i % 4 == 0) {
                float dx = abs(chladni(p + eps.xyy, uRadius) - chladni(p - eps.xyy, uRadius));
                float dy = abs(chladni(p + eps.yxy, uRadius) - chladni(p - eps.yxy, uRadius));
                float dz = abs(chladni(p + eps.yyx, uRadius) - chladni(p - eps.yyx, uRadius));
                gradient = (dx + dy + dz) / 3.0;
            }

            // Adjust step size based on gradient (higher gradient = smaller steps)
            // FIXED - Remove distance scaling to maintain consistent sampling
            float gradientFactor = max(1.0, uAdaptiveStepStrength * mix(1.0, 0.5, uPerformanceMode));
            float adaptiveStepSize = baseStepSize / (1.0 + gradientFactor * gradient);

            // Get color and alpha from transfer function
            vec4 sampleColor = transferFunction(density);

            // Add volumetric lighting
            vec3 lightDir = normalize(lightPos - p);
            float lightDist = length(lightPos - p);
            float lightAtten = 1.0 / (1.0 + 0.1 * lightDist + 0.01 * lightDist * lightDist);

            // Light scattering approximation with consistent sample count
            float scattering = 0.0;
            float rayProgress = (t - t_min) / (t_max - t_min);

            // Use the maxLightSamples as starting point
            int actualLightSamples = maxLightSamples;

            // FIXED - Only reduce samples based on ray progress, not distance
            float progressThreshold = mix(0.5, 0.3, uPerformanceMode);
            if(rayProgress > progressThreshold) {
                // Reduce samples in the back half of the volume
                actualLightSamples = max(2, actualLightSamples / 2);
            }

            // Always use proper light sampling
            for(int i = 0; i < 16; i++) {
                if(i >= actualLightSamples)
                    break;
                float s = float(i) / float(actualLightSamples - 1);
                vec3 samplePos = mix(p, lightPos, s);
                float sampleChladni = chladni(samplePos, uRadius);
                float sampleDensity = smoothstep(uThreshold, 0.0, abs(sampleChladni));
                scattering += sampleDensity;
            }
            scattering = exp(-scattering * 0.2); // Adjust extinction coefficient

            // Apply lighting to sample color
            sampleColor.rgb *= (0.3 + 0.7 * lightAtten * scattering);

            // Front-to-back compositing
            sampleColor.rgb *= sampleColor.a;
            result = result + sampleColor * (1.0 - result.a);

            // Advance with adaptive step size
            t += adaptiveStepSize;
        } else {
            // Use larger steps in empty space for efficiency
            // FIXED - Don't use distance for empty space step size
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

    // Calculate holographic effect - we'll enhance the existing pattern, not replace it
    float holographic = 0.0;

    // Get the first intersection with the bounding sphere for holographic effect
    float t_min, t_max;
    if(intersectSphere(ro, rd, vec3(0.0), 2.0, t_min, t_max)) {
        // Start from camera if we're inside the sphere
        t_min = max(0.0, t_min);

        // Sample a few points along the ray for holographic effect
        const int HOLO_SAMPLES = 5;
        for(int i = 0; i < HOLO_SAMPLES; i++) {
            float t = mix(t_min, t_max, float(i) / float(HOLO_SAMPLES - 1));
            vec3 p = ro + rd * t;

            // Calculate the Chladni value at this point
            float chladniValue = chladni(p, uRadius);

            // Only contribute to holographic effect near the Chladni pattern surface
            if(abs(chladniValue) < uThreshold * 2.0) {
                // Stripes based on position and time
                float stripes = mod((p.y - uTime * 0.02) * 20.0, 1.0);
                stripes = pow(stripes, 3.0);

                // Fresnel-like effect based on view direction and normal approximation
                // Since we don't have a true normal in the volume, use gradient of Chladni field
                vec2 e = vec2(0.01, 0.0);
                vec3 grad = vec3(chladni(p + e.xyy, uRadius) - chladni(p - e.xyy, uRadius), chladni(p + e.yxy, uRadius) - chladni(p - e.yxy, uRadius), chladni(p + e.yyx, uRadius) - chladni(p - e.yyx, uRadius));
                vec3 normal = normalize(grad);

                float fresnel = abs(dot(rd, normal));
                fresnel = 1.0 - fresnel; // Invert for edge glow
                fresnel = pow(fresnel, 2.0);

                // Falloff
                float falloff = smoothstep(0.0, 0.8, fresnel);

                // Combine effects
                float sampleHolo = fresnel * stripes;
                sampleHolo += fresnel * 0.75; // Reduced to prevent over-brightening
                sampleHolo *= falloff;

                // Weight by proximity to Chladni surface
                float weight = smoothstep(uThreshold, 0.0, abs(chladniValue));
                holographic += sampleHolo * weight;
            }
        }

        // Normalize based on samples
        holographic /= float(HOLO_SAMPLES);

        // Boost the holographic effect for better visibility
        holographic *= 2.0;
    }

    // For additive/transparent blending:
    // 1. Keep original color but potentially enhance it slightly with holographic effect
    // 2. Use a proper alpha value that works well with Three.js blending modes

    // Use volumeColor.a for the pattern's actual density
    float alpha = volumeColor.a;

    // Add a subtle color shift based on holographic effect (optional)
    vec3 finalRGB = color + vec3(0.1, 0.2, 0.3) * holographic;

    // When used with THREE.AdditiveBlending, the alpha controls the intensity
    // For adding glow only where patterns exist
    float finalAlpha = alpha + holographic * 0.5 * alpha;

    // Output the final color
    finalColor = vec4(finalRGB, finalAlpha);
}