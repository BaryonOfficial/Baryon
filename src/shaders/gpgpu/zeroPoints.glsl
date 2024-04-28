uniform float uThreshold;
uniform float uRadius;
uniform float uSurfaceThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;
    float distance = length(position);

    vec3 scaledPosition = position * 0.64;
    if(abs(scalarValue) < uThreshold) {
        if(abs(distance - uRadius) < uSurfaceThreshold) {
            // ZeroPoint is on the surface
            gl_FragColor = vec4(position, 1.0);
        } else {
            // ZeroPoint is in the volume
            gl_FragColor = vec4(position, 2.0);
            // discard;
        }
    } else {
        discard;
    }
}
