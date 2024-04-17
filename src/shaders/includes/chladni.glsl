// Function to calculate the Chladni pattern displacement
float chladni1(vec3 position) {
    float sum = 0.0;
    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];
        sum += Ai * sin(ui * PI * position.x) * sin(vi * PI * position.y) * sin(wi * PI * position.z);
    }
    return sum;
}

// Function to calculate the Chladni pattern displacement w/ radius
float chladni2(vec3 position, float radius) {
    float sum = 0.0;
    float scaleFactor = 1.0 / radius;

    for(int i = 0; i < N; ++i) {
        int index = 4 * i;
        float Ai = waveComponents[index];
        float ui = waveComponents[index + 1];
        float vi = waveComponents[index + 2];
        float wi = waveComponents[index + 3];

        sum += Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    }

    return sum;
}

// // // Function to calculate the Chladni pattern displacement using wave data from texture
float chladni3(vec3 position, float radius, vec4 waveData) {
    float scaleFactor = 1.0 / radius;
    float Ai = waveData.a;
    float ui = waveData.b;
    float vi = waveData.c;
    float wi = waveData.d;
    float sum = Ai * sin(ui * PI * position.x * scaleFactor) * sin(vi * PI * position.y * scaleFactor) * sin(wi * PI * position.z * scaleFactor);
    return sum;
}