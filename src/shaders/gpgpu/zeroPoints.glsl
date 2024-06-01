uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;
uniform float uAverageAmplitude;
uniform bool uSurfaceControl;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;
    float distance = length(position);
    // vec3 scaledPosition = position * 0.64;

    // Discard all positions if uAverageAmplitude is 0. This will be a feature to replace the logo with just a dot when there is no amplitude
    // if(uAverageAmplitude == 0.0) {
    //     discard;
    // }

    if(abs(scalarValue) >= uThreshold) {
        discard;
    }

    bool isOnSurface = abs(distance - uRadius) <= uSurfaceThreshold;

    if(isOnSurface && uSurfaceControl) {
        gl_FragColor = vec4(position, 1.0); // ZeroPoints on the surface
    } else if(isOnSurface && !uSurfaceControl) {
        discard; // Turning off surface particles
    } else {
        gl_FragColor = vec4(position, 2.0); // ZeroPoint is in the volume
    }
}
