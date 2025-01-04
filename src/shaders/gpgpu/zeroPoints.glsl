uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;
uniform float uAverageAmplitude;
uniform bool uSurfaceControl;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.xyz;
    float scalarValue = scalarFieldValue.w;
    float distance = length(position);

    // Early return for points outside threshold
    if(abs(scalarValue) >= uThreshold) {
        discard;
    }

    // Determine if point is on surface
    bool isOnSurface = abs(distance - uRadius) <= uSurfaceThreshold;

    // Output position with type flag (1.0 for surface, 2.0 for volume)
    if(isOnSurface && uSurfaceControl) {
        gl_FragColor = vec4(position, 1.0);
    } else if(isOnSurface && !uSurfaceControl) {
        discard;
    } else {
        gl_FragColor = vec4(position, 2.0);
    }
}
