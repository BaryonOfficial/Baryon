uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;
uniform bool uSurfaceControl;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;
    float distance = length(position);
    // vec3 scaledPosition = position * 0.64;

    if(abs(scalarValue) >= uThreshold) {
        discard;
    }

    bool isOnSurface = abs(distance - uRadius) < uSurfaceThreshold;

    if(isOnSurface && uSurfaceControl) {
        gl_FragColor = vec4(position, 1.0); // ZeroPoints on the surface
    } else if(isOnSurface && !uSurfaceControl) {
        discard; // Turning off surface particles
    } else {
        gl_FragColor = vec4(position, 2.0); // ZeroPoint is in the volume
    }
}
