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

    vec3 scaledPosition = position * 0.64;
    if(abs(scalarValue) < uThreshold) {
        if(abs(distance - uRadius) < uSurfaceThreshold && uSurfaceControl) {
            // ZeroPoints on the surface
            gl_FragColor = vec4(position, 1.0);
        } else if(abs(distance - uRadius) < uSurfaceThreshold && !uSurfaceControl) {
            // Turning off surface particles
            discard;
        } else {
            // ZeroPoint is in the volume
            gl_FragColor = vec4(position, 2.0);
        }
    } else {
        discard;
    }
}
