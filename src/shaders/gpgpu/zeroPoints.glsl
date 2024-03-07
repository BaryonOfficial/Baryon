uniform float uThreshold;
uniform vec2 scalarFieldResolution;
uniform float uDepth;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;

    if(abs(scalarValue) < uThreshold) {
        gl_FragColor = vec4(position, 1.0);
    } else {
        gl_FragColor = vec4(0.0);
    }
}