uniform float uThreshold;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 scalarFieldValue = texture(uScalarField, uv);
    vec3 position = scalarFieldValue.rgb;
    float scalarValue = scalarFieldValue.a;

    if(abs(scalarValue) < uThreshold) {
        gl_FragColor = vec4(position, 0.0);
    } else {
        discard;
    }
}
