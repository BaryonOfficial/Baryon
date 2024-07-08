import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GPUComputationRenderer } from 'three/examples/jsm/Addons.js';

// gpgpu shaders
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl';
import scalarFieldShader from './shaders/gpgpu/scalarField.glsl';
import zeroPointsShader from './shaders/gpgpu/zeroPoints.glsl';
import audioDataShader from './shaders/gpgpu/audioData.glsl';

// particle shaders
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';

// Idea here is to have a single baryon object that can be placed into different three.js projects 

// How to use make a single baryon obj and call its methods, you can scale and move this obj like a three.js 
// To play music loadAudio with audio url then call the play method

// Right now the notion is to run at 30-26fps on mobile and 60 for desktop.   

function initializeParticlesInSphereVolumeAndSurface(count, radius, surfaceRatio) {
    const positions = new Float32Array(count * 3);
    const surfaceCount = Math.floor(count * surfaceRatio);
    // const volumeCount = count - surfaceCount;

    // Generate points on the surface
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const angleIncrement = Math.PI * 2 * goldenRatio;
    for (let i = 0; i < surfaceCount; i++) {
        const t = i / surfaceCount;
        const inclination = Math.acos(1 - 2 * t);
        const azimuth = angleIncrement * i;
        const x = radius * Math.sin(inclination) * Math.cos(azimuth);
        const y = radius * Math.sin(inclination) * Math.sin(azimuth);
        const z = radius * Math.cos(inclination);
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }

    // Generate points within the volume
    for (let i = surfaceCount; i < count; i++) {
        const r = Math.pow(Math.random(), 1 / 3) * radius;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }

    return positions;
}

function initializeParticlesInSphere(count, radius) {
    // Scale down the radius to 1/10th
    const scaledRadius = radius / 2;

    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        // Use the scaled radius in the calculation
        const r = Math.pow(Math.random(), 1 / 3) * scaledRadius; // Adjust the power to 1/3 for uniform distribution within the sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
    }

    return positions;
}

function generateRandomPitches(capacity) {
    const pitches = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) {
        // Generate a random pitch, for example between 200 Hz and 2000 Hz
        pitches[i] = 200 + Math.random() * 2000;
    }
    return pitches;
}

function combineFrequencyData(freqData1, freqData2) {
    // Placeholder for a more complex frequency data combining logic
    return freqData1.map((value, index) =>
        Math.sqrt(value * value + freqData2[index] * freqData2[index])
    );
}

export class Baryon extends THREE.Object3D {

    constructor(renderer, camera, params = {
        count: 100000,
        size: .0125,
        radius: 2,
        threshold: 0.6,
        surfaceRatio: 0.33,
        surfaceThreshold: 0.01,
        color: new THREE.Color('black'),
    }) { // idealy we should create a type that defines a baryon obj 
        super();

        this.renderer = renderer;
        this.camera = camera;

        this.debugMode = false;

        // Audio Object 
        this.audioObject = {
            fftSize: 4096,
            audioReader: null,
            gain: null,
            essentiaNode: null,
            soundGainNode: null,
            sound: null,
            micSound: null,
            capacity: 5,
            micAnalyser: null,
            micNode: null,
            gumStream: null,
            isAudioLoaded: false,
            audioLoader: null,
            audioListener: null,
            sound: null,
            audioCtx: null,
            analyser: null,
            essentiaData: null,
        }

        this.#audioObjSetup();

        // Particle Object
        this.particleObject = {
            parameters: params,
            positions: null,
            colors: null,
        }

        this.#particleObjSetup();

        // For our simple event system
        this.eventSystem = {
            events: [],
            areResourcesLoaded: false, // we ask a questions so the name pattern should follow
            isAudioLoaded: false, // this variable is used to handle our play method 
            isAudioLoading: false,
        }

        this.timeSystem = {
            // Time stuff
            previousTime: 0,
            lastKnownTime: 0, // used to resume to the right time 
            interval: 1 / 30,
        }

        this.#setupUIInteractions();

        // This calles the rest of the build async, onces all resources are loaded areResourcesLoaded = true 
        this.#loadModel();
    }

    #audioObjSetup() {
        // Audio setup
        this.audioObject.audioLoader = new THREE.AudioLoader();
        this.audioObject.audioListener = new THREE.AudioListener();
        this.audioObject.sound = new THREE.Audio(this.audioObject.audioListener);
        this.audioObject.audioCtx = this.audioObject.audioListener.context;
        this.audioObject.analyser = new THREE.AudioAnalyser(this.audioObject.sound, this.audioObject.fftSize);
        this.audioObject.essentiaData = new Float32Array(this.audioObject.capacity);
    }

    #particleObjSetup() {

        this.particleObject.positions = initializeParticlesInSphereVolumeAndSurface( // x, y, z for each particle
            this.particleObject.parameters.count,
            this.particleObject.parameters.radius,
            this.particleObject.parameters.surfaceRatio
        )
        this.particleObject.colors = new Float32Array(this.particleObject.parameters.count * 3); // r, g, b for each particle

        console.log("params", this.particleObject);
    }

    async #loadModel() {
        const gltfLoader = new GLTFLoader();
        try {
            const gltf = await gltfLoader.loadAsync('./glb/Baryon_v2.glb');
            this.baryonLogo = gltf.scene.children[0];
            // Apply scaling to the object
            this.baryonLogo.scale.set(0.2, 0.2, 0.2); // Adjust scale factors as needed

            // Update the geometry to apply the transformation
            this.baryonLogo.updateMatrix();
            this.baryonLogo.geometry.applyMatrix4(this.baryonLogo.matrix);

            // Reset the matrix to avoid further unintended transformations
            this.baryonLogo.matrix.identity();
            this.baryonLogo.matrix.decompose(
                this.baryonLogo.position,
                this.baryonLogo.quaternion,
                this.baryonLogo.scale
            );


            this.#gpgpuSetup();
            this.#particlesSetup();
            this.#startAudioProcessing();
        } catch (error) {
            console.error('An error occurred while loading the model:', error);
        }
    }

    // baseGeomtry are particles & baseGeomtry2 are the vertices of the gltf logo 
    #gpgpuSetup() {
        // Setup
        const size = Math.ceil(Math.sqrt(this.baryonLogo.geometry.attributes.position.count));
        this.gpgpu = {
            size: size,
            computation: new GPUComputationRenderer(size, size, this.renderer),
        };

        // Model setup
        const baryonLogoTexture = this.gpgpu.computation.createTexture();

        for (let i = 0; i < this.baryonLogo.geometry.attributes.position.count; i++) {
            const i3 = i * 3;
            const i4 = i * 4;

            // Position based on geometry
            baryonLogoTexture.image.data[i4 + 0] = this.baryonLogo.geometry.attributes.position.array[i3 + 0];
            baryonLogoTexture.image.data[i4 + 1] = this.baryonLogo.geometry.attributes.position.array[i3 + 1];
            baryonLogoTexture.image.data[i4 + 2] = this.baryonLogo.geometry.attributes.position.array[i3 + 2];
            baryonLogoTexture.image.data[i4 + 3] = Math.random();
        }

        // Particles setup w/ positions only for computation + Initalization of particles for movement
        const baseParticlesTexture = this.gpgpu.computation.createTexture();
        const initialParticlesTexture = this.gpgpu.computation.createTexture();
        const initialPositions = initializeParticlesInSphere(this.particleObject.parameters.count, this.particleObject.parameters.radius);

        for (let i = 0; i < this.particleObject.parameters.count; i++) {
            const i3 = i * 3;
            const i4 = i * 4;

            // Position based on Geometry
            baseParticlesTexture.image.data[i4 + 0] = this.particleObject.positions[i3 + 0];
            baseParticlesTexture.image.data[i4 + 1] = this.particleObject.positions[i3 + 1];
            baseParticlesTexture.image.data[i4 + 2] = this.particleObject.positions[i3 + 2];
            baseParticlesTexture.image.data[i4 + 3] = 1.0;

            initialParticlesTexture.image.data[i4 + 0] = initialPositions[i3 + 0];
            initialParticlesTexture.image.data[i4 + 1] = initialPositions[i3 + 1];
            initialParticlesTexture.image.data[i4 + 2] = initialPositions[i3 + 2];
            initialParticlesTexture.image.data[i4 + 3] = 1.0;
        }

        /**
         * AudioData Variable
         */
        const audioDataTexture = this.gpgpu.computation.createTexture();
        this.gpgpu.audioDataVariable = this.gpgpu.computation.addVariable(
            'uAudioData',
            audioDataShader,
            audioDataTexture
        );

        // Audio Data & Uniforms
        const format = this.renderer.capabilities.isWebGL2 ? THREE.RedFormat : THREE.LuminanceFormat;

        this.gpgpu.audioDataVariable.material.uniforms.tPitches = {
            value: new THREE.DataTexture(
                this.audioObject.essentiaData,
                this.audioObject.capacity,
                1,
                THREE.RedFormat,
                THREE.FloatType
            ),
        };
        this.gpgpu.audioDataVariable.material.uniforms.tDataArray = {
            value: new THREE.DataTexture(
                this.audioObject.analyser.data, // Initial empty data
                this.audioObject.fftSize / 2,
                1,
                format
            ),
        };

        const randomPitches = generateRandomPitches(this.audioObject.capacity);

        this.gpgpu.audioDataVariable.material.uniforms.uRadius = new THREE.Uniform(this.particleObject.parameters.radius);
        this.gpgpu.audioDataVariable.material.uniforms.sampleRate = new THREE.Uniform(this.audioObject.audioCtx.sampleRate);
        this.gpgpu.audioDataVariable.material.uniforms.bufferSize = new THREE.Uniform(this.audioObject.fftSize);
        this.gpgpu.audioDataVariable.material.uniforms.capacity = new THREE.Uniform(this.audioObject.capacity);
        this.gpgpu.audioDataVariable.material.uniforms.uRandomPitches = new THREE.Uniform(randomPitches);

        // Dependencies
        this.gpgpu.computation.setVariableDependencies(this.gpgpu.audioDataVariable, []);

        /**
         * ScalarField Variable
         */
        const scalarTexture = this.gpgpu.computation.createTexture();
        this.gpgpu.scalarFieldVariable = this.gpgpu.computation.addVariable(
            'uScalarField',
            scalarFieldShader,
            scalarTexture
        );

        this.gpgpu.scalarFieldVariable.material.uniforms.uRadius = new THREE.Uniform(this.particleObject.parameters.radius);
        this.gpgpu.scalarFieldVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
        this.gpgpu.scalarFieldVariable.material.uniforms.capacity = new THREE.Uniform(this.audioObject.capacity);

        // Dependencies
        this.gpgpu.computation.setVariableDependencies(this.gpgpu.scalarFieldVariable, [this.gpgpu.audioDataVariable]);

        /**
         * ZeroPoints Variable
         */
        this.gpgpu.zeroPointsVariable = this.gpgpu.computation.addVariable(
            'uZeroPoints',
            zeroPointsShader,
            this.gpgpu.computation.createTexture()
        );

        this.gpgpu.zeroPointsVariable.material.uniforms.uThreshold = new THREE.Uniform(this.particleObject.parameters.threshold);
        this.gpgpu.zeroPointsVariable.material.uniforms.uRadius = new THREE.Uniform(this.particleObject.parameters.radius);
        this.gpgpu.zeroPointsVariable.material.uniforms.uSurfaceThreshold = new THREE.Uniform(this.particleObject.parameters.surfaceThreshold);
        this.gpgpu.zeroPointsVariable.material.uniforms.uSurfaceControl = new THREE.Uniform(true);
        this.gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);

        // Dependencies
        this.gpgpu.computation.setVariableDependencies(this.gpgpu.zeroPointsVariable, [this.gpgpu.scalarFieldVariable]);

        /**
         * Particles Variable
         */
        this.gpgpu.particlesVariable = this.gpgpu.computation.addVariable(
            'uParticles',
            gpgpuParticlesShader,
            baseParticlesTexture
        );

        // Uniforms
        this.gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
        this.gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
        this.gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(1.0);
        this.gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(3.6);
        this.gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(0.64);
        this.gpgpu.particlesVariable.material.uniforms.uThreshold = new THREE.Uniform(this.particleObject.parameters.threshold);
        this.gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baryonLogoTexture);
        this.gpgpu.particlesVariable.material.uniforms.uAverageAmplitude = new THREE.Uniform(0.0);
        this.gpgpu.particlesVariable.material.uniforms.uParticleSpeed = new THREE.Uniform(32);
        this.gpgpu.particlesVariable.material.uniforms.uStarted = new THREE.Uniform(this.audioObject.sound.started);
        this.gpgpu.particlesVariable.material.uniforms.uParticleMovementType = new THREE.Uniform(1);
        this.gpgpu.particlesVariable.material.uniforms.uRadius = new THREE.Uniform(this.particleObject.parameters.radius);
        this.gpgpu.particlesVariable.material.uniforms.uDistanceThreshold = new THREE.Uniform(0.5);
        this.gpgpu.particlesVariable.material.uniforms.uMicActive = new THREE.Uniform(
            this.audioObject.gumStream && this.audioObject.gumStream.active
        );

        // Dependencies
        this.gpgpu.computation.setVariableDependencies(this.gpgpu.particlesVariable, [
            this.gpgpu.zeroPointsVariable,
            this.gpgpu.particlesVariable,
        ]);

        //******************************************************* GPGPU INITIALIZATION *******************************************************//

        this.gpgpu.computation.init();

        // Debug Planes
        this.gpgpu.audioDebug = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({
                map: this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.audioDataVariable).texture,
            })
        );
        this.gpgpu.audioDebug.visible = this.debugMode;
        this.gpgpu.audioDebug.position.x = -5;
        this.gpgpu.audioDebug.position.y = 2.1;

        this.gpgpu.scalarFieldDebug = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({
                map: this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.scalarFieldVariable).texture,
            })
        );

        this.gpgpu.scalarFieldDebug.visible = this.debugMode;
        this.gpgpu.scalarFieldDebug.position.x = -5;
        this.gpgpu.scalarFieldDebug.position.y = 0;

        this.gpgpu.zeroPointsDebug = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2), // The size of the plane can be adjusted as needed
            new THREE.MeshBasicMaterial({
                map: this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.zeroPointsVariable).texture,
            })
        );

        this.gpgpu.zeroPointsDebug.visible = this.debugMode;
        this.gpgpu.zeroPointsDebug.position.x = -5;
        this.gpgpu.zeroPointsDebug.position.y = -2.1;

        this.gpgpu.particlesDebug = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({
                map: this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.particlesVariable).texture,
            })
        );
        this.gpgpu.particlesDebug.visible = this.debugMode;
        this.gpgpu.particlesDebug.position.x = -5;
        this.gpgpu.particlesDebug.position.y = -4.2;

        if (this.debugMode) {
            this.add(this.gpgpu.audioDebug);
            this.add(this.gpgpu.scalarFieldDebug);
            this.add(this.gpgpu.zeroPointsDebug);
            this.add(this.gpgpu.particlesDebug);
        }

        window.addEventListener('beforeunload', () => {
            this.#disposeGPGPUResources();
        });
    }

    #disposeGPGPUResources() { // when you don't need baryon anymore 

        this.gpgpu.computation.dispose();
        this.gpgpu.particlesVariable.material.dispose();
        this.gpgpu.audioDataVariable.material.dispose();
        this.gpgpu.scalarFieldVariable.material.dispose();
        this.gpgpu.zeroPointsVariable.material.dispose();
        this.gpgpu.particlesDebug.material.dispose();
        this.gpgpu.audioDebug.material.dispose();
        this.gpgpu.scalarFieldDebug.material.dispose();
        this.gpgpu.zeroPointsDebug.material.dispose();
    }

    #particlesSetup() {

        const pixelRatio = Math.min(window.devicePixelRatio, 2);

        const material = new THREE.ShaderMaterial({
            // transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            // vertexColors: true,
            vertexShader: particlesVertexShader,
            fragmentShader: particlesFragmentShader,
            uniforms: {
                uSize: new THREE.Uniform(this.particleObject.parameters.size),
                uResolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
                uParticlesTexture: { value: this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.particlesVariable).texture },
                uTime: new THREE.Uniform(0),
                uColor: new THREE.Uniform(this.particleObject.parameters.color),
                uRadius: new THREE.Uniform(this.particleObject.parameters.radius),
                uAverageAmplitude: new THREE.Uniform(0.0),
                uRotation: new THREE.Uniform(2.5),
                uDeltaTime: new THREE.Uniform(0),
                uSoundPlaying: new THREE.Uniform(this.audioObject.sound.isPlaying),
            },
        });

        // Geometry
        const particlesUvArray = new Float32Array(this.particleObject.parameters.count * 2);

        // Sizes
        const sizesArray = new Float32Array(this.particleObject.parameters.count);

        for (let y = 0; y < this.gpgpu.size; y++) {
            for (let x = 0; x < this.gpgpu.size; x++) {
                const i = y * this.gpgpu.size + x;
                const i2 = i * 2;

                const uvX = (x + 0.5) / this.gpgpu.size;
                const uvY = (y + 0.5) / this.gpgpu.size;

                particlesUvArray[i2 + 0] = uvX;
                particlesUvArray[i2 + 1] = uvY;

                // Sizes
                sizesArray[i] = Math.random();
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setDrawRange(0, this.particleObject.parameters.count);
        geometry.setAttribute('aParticlesUv', new THREE.BufferAttribute(particlesUvArray, 2));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(this.particleObject.colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1));

        // Points
        this.particles = new THREE.Points(geometry, material);
        this.add(this.particles);
    }

    #setupAudioGraph() {
        if (!window.SharedArrayBuffer) {
            console.error('SharedArrayBuffer is not supported in this browser.');
            alert('SharedArrayBuffer is not supported in this browser. Please use a compatible browser.');
            return;
        }

        let sab = exports.RingBuffer.getStorageForCapacity(this.audioObject.capacity, Float32Array); // capacity: three float32 values [pitch, confidence, rms]
        let rb = new exports.RingBuffer(sab, Float32Array);
        this.audioObject.audioReader = new exports.AudioReader(rb);

        this.audioObject.essentiaNode = new AudioWorkletNode(this.audioObject.audioCtx, 'audio-data-processor', {
            processorOptions: {
                bufferSize: this.audioObject.fftSize,
                sampleRate: this.audioObject.audioCtx.sampleRate,
                capacity: this.audioObject.capacity,
            },
        });
        // Add the onmessageerror event listener
        this.audioObject.essentiaNode.port.onmessageerror = (event) => {
            console.error('AudioWorkletNode message error:', event);
        };

        try {
            this.audioObject.essentiaNode.port.postMessage({
                sab: sab,
                isPlaying: this.audioObject.sound.isPlaying,
                micActive: this.audioObject.gumStream && this.audioObject.gumStream.active,
            });
        } catch (_) {
            alert('No SharedArrayBuffer tranfer support, try another browser.');
            // $("#recordButton").off('click', onRecordClickHandler);
            // $("#recordButton").prop("disabled", true);
            return;
        }

        //Input File Sound Path
        this.audioObject.sound.getOutput().connect(this.audioObject.essentiaNode);
        console.log('inputFile Sound Gain Node --> Essentia Node');

        // This will be used for overall volume
        this.audioObject.gain = this.audioObject.audioCtx.createGain();

        // Connection to destination
        this.audioObject.essentiaNode.connect(this.audioObject.gain);
        console.log('Essentia Node --> Gain');

        this.audioObject.gain.connect(this.audioObject.audioCtx.destination);
        console.log('Gain --> Destination');
    }

    async #URLFromFiles(files) {
        const promises = files.map(async (file) => {
            const response = await fetch(file);
            return response.text();
        });

        const texts = await Promise.all(promises);
        texts.unshift('var exports = {};'); // hack to make injected umd modules work
        const text = texts.join('');
        const blob = new Blob([text], { type: 'application/javascript' });

        return URL.createObjectURL(blob);
    }

    async #loadAudioWorklet() {
        const workletProcessorCode = [
            'worklet/essentia-wasm.umd.js',
            'worklet/essentia.js-core.umd.js',
            'worklet/audio-data-processor.js',
            'worklet/ringbuf.js',
        ];

        return this.#URLFromFiles(workletProcessorCode)
            .then((concatenatedCode) => {
                return this.audioObject.audioCtx.audioWorklet.addModule(concatenatedCode);
            })
            .catch((msg) => {
                console.log(`There was a problem retrieving the AudioWorklet module code: \n ${msg}`);
                throw new Error(msg);
            });
    }

    async #startAudioProcessing() {
        try {
            await this.#loadAudioWorklet();
            await this.#setupAudioGraph();
            this.eventSystem.areResourcesLoaded = true;
        } catch (error) {
            console.error(`There was a problem loading the AudioWorklet module code: \n ${error}`);
        }
    }

    #setupUIInteractions() { // This should be implemented by the user with the baryon api but for debuging ma just put it here. 
        const audioInput = document.getElementById('audioInput');
        const fileName = document.getElementById('fileName');
        const playPauseButton = document.getElementById('playPauseButton');
        const stopButton = document.getElementById('stopButton');
        const micButton = document.getElementById('micMode');

        // audioInput.addEventListener('change', (event) => {
        //     if (event.target.files.length > 0) {
        //         const file = event.target.files[0];
        //         fileName.textContent = file.name;
        //         const fileURL = URL.createObjectURL(file);
        //         this.loadAudio(fileURL);
        //     } else {
        //         fileName.textContent = 'Choose File';
        //     }
        //     audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
        // });

        // micButton.addEventListener('click', () => {
        //     if (!audioObject.gumStream || !audioObject.gumStream.active) {
        //         startMicRecordStream();
        //         micButton.textContent = 'Stop Mic';
        //     } else {
        //         stopMicRecordStream();
        //         micButton.textContent = 'Mic';
        //     }
        // });

        playPauseButton.addEventListener('click', async () => {
            this.play();
        });


        stopButton.addEventListener('click', () => {
            this.pause();
        });

        // audioObject.sound.onEnded = function () {
        //     audioObject.sound.stop();
        //     console.log('Audio ended');
        //     audioObject.sound.started = false;
        //     playPauseButton.textContent = 'Replay';
        //     audioObject.essentiaNode.port.postMessage({ isPlaying: audioObject.sound.isPlaying });
        // };
    }

    #loadAudio(url) {

        this.eventSystem.isAudioLoaded = false;
        this.eventSystem.isAudioLoading = true;

        // Stop the current audio if it is playing and reset its buffer
        if (this.audioObject.sound.isPlaying) {
            this.audioObject.sound.stop();
            this.audioObject.sound.setBuffer(null);
            console.log('Audio stopped on change');
        } else if (!this.audioObject.sound.isPlaying) {
            this.audioObject.sound.setBuffer(null);
            console.log('Audio ended & reset w/ new file or URL');
        }

        var sound = this.audioObject.sound;
        var eventSystem = this.eventSystem;

        this.audioObject.audioLoader.load(
            url,
            function (buffer) {
                sound.setBuffer(buffer);
                sound.setLoop(false);
                sound.setVolume(0.5);

                eventSystem.isAudioLoaded = true;
                eventSystem.isAudioLoading = false;

                console.log("hi from call back ")
            },
            undefined,
            (err) => {
                console.error('Error loading audio file:', err);
            }
        );
    }

    #play() {
        try {

            if (this.audioObject.audioCtx.state === 'suspended') {
                this.audioObject.audioCtx.resume();
            }

            this.audioObject.sound.play();
            this.audioObject.essentiaNode.port.postMessage({ isPlaying: this.audioObject.sound.isPlaying });
            console.log("Audio Playing");
        } catch (error) {
            console.error('Error in play method:', error);
        }
    }

    #pause() {
        try {
            if (this.audioObject.sound.isPlaying) {
                this.audioObject.sound.pause();
                this.audioObject.essentiaNode.port.postMessage({ isPlaying: this.audioObject.sound.isPlaying });
                console.log("Audio Paused");
            } // else do nun
        } catch (error) {
            console.log('Error in pause method:', error);
        }
    }

    // I need this becuase the user can call the play method before the audio worklet is done and load audio is an async function. 
    // Its also standared way to help deal with communication between the client. Abstraction is fine just make sure to use mono functions 
    loadAudio(url) {
        this.eventSystem.events.push({ type: 'loadAudio', url: url });
    }

    play() {
        this.eventSystem.events.push({ type: 'play' });
    }

    pause() {
        this.eventSystem.events.push({ type: 'pause' });
    }

    startMicRecordStream() {

    }

    stopMicRecordStream() {

    }

    checkMicInputLevels() {

        if (this.audioObject.micAnalyser) {
            const data = this.audioObject.micAnalyser.getFrequencyData();
            const isMicWorking = data.some((value) => value > 0);

            if (isMicWorking) {
                console.log('Microphone is working');
            } else {
                console.log('Microphone is not picking up any sound');
            }
        } else {
            console.log('Microphone analyser is not initialized');
        }
    }

    #audioAnalysis() {

        let avgAmplitude = 0;
        let freqData = [];

        let inputFileAmplitude = 0;
        let micAmplitude = 0;
        let inputFileFreqData = [];
        let micFreqData = [];

        const soundIsActive = this.audioObject.sound.isPlaying;
        const micIsActive = this.audioObject.gumStream && this.audioObject.gumStream.active;

        if (soundIsActive) {
            inputFileAmplitude = this.audioObject.analyser.getAverageFrequency();
            inputFileFreqData = this.audioObject.analyser.getFrequencyData();
        }

        if (micIsActive) {
            micAmplitude = this.audioObject.micAnalyser.getAverageFrequency();
            micFreqData = this.audioObject.micAnalyser.getFrequencyData();
        }

        if (soundIsActive && micIsActive) {
            // Combine amplitudes more realistically based on energy
            avgAmplitude = Math.sqrt(inputFileAmplitude * inputFileAmplitude + micAmplitude * micAmplitude);

            // Combine frequency data considering phase and magnitude
            freqData = combineFrequencyData(inputFileFreqData, micFreqData);
        } else if (soundIsActive) {
            avgAmplitude = inputFileAmplitude;
            freqData = Array.from(inputFileFreqData); // Clone to prevent mutability issues
        } else if (micIsActive) {
            avgAmplitude = micAmplitude;
            freqData = Array.from(micFreqData); // Clone to prevent mutability issues
        }

        // console.log('Input File Data - Amplitude:', inputFileAmplitude);
        // console.log('Input File Data - Frequency Data:', inputFileFreqData);
        // console.log('Mic Data - Amplitude:', micAmplitude);
        // console.log('Mic Data - Frequency Data:', micFreqData);
        // console.log('Final Avg Amplitude:', avgAmplitude);
        // console.log('Final Frequency Data:', freqData);

        return { avgAmplitude, freqData };
    }

    #processAudioData() {

        if (this.audioObject.audioReader.available_read() >= 1) {
            let read = this.audioObject.audioReader.dequeue(this.audioObject.essentiaData);
            if (read !== 0) {
                this.gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
            }
        }

        const soundIsActive = this.audioObject.sound.isPlaying;
        const micIsActive = this.audioObject.gumStream && this.audioObject.gumStream.active;

        if (soundIsActive || micIsActive) {
            const { avgAmplitude, freqData } = this.#audioAnalysis();
            this.gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
            this.gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
            this.particles.material.uniforms.uAverageAmplitude.value = avgAmplitude;
            this.gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
            this.gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
        } else if (!soundIsActive && !micIsActive && !this.audioObject.sound.started) {
            this.gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = 0;
            this.gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
            this.particles.material.uniforms.uAverageAmplitude.value = 0;
            this.gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(0);
            this.gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
        }
    }

    #updateGPGPU(time, deltaTime) {

        // GPGPU Updates
        this.gpgpu.particlesVariable.material.uniforms.uTime.value = time;
        this.gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
        this.gpgpu.particlesVariable.material.uniforms.uStarted.value = this.audioObject.sound.started;
        this.gpgpu.particlesVariable.material.uniforms.uMicActive.value = this.audioObject.gumStream && this.audioObject.gumStream.active;

        this.particles.material.uniforms.uSoundPlaying.value = this.audioObject.sound.isPlaying;
        this.particles.material.uniforms.uTime.value = time;
        this.particles.material.uniforms.uDeltaTime.value = deltaTime;
    }

    #computeGPGU() {
        this.gpgpu.computation.compute();

        // Update audioData texture
        this.gpgpu.scalarFieldVariable.material.uniforms.uAudioData.value =
            this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.audioDataVariable).texture;

        // Update scalarfield texture
        this.gpgpu.zeroPointsVariable.material.uniforms.uScalarField.value =
            this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.scalarFieldVariable).texture;

        // Update zeropoints texture
        this.gpgpu.particlesVariable.material.uniforms.uZeroPoints.value =
            this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.zeroPointsVariable).texture;

        // Update particles texture
        this.particles.material.uniforms.uParticlesTexture.value =
            this.gpgpu.computation.getCurrentRenderTarget(this.gpgpu.particlesVariable).texture;
    }

    // This handles events called to the baryon object from client
    #processEvents() {

        if (this.eventSystem.events.length > 0) {
            let event = this.eventSystem.events[0]
            let clearEvent = true;
            console.log('event', event);
            switch (event.type) { // switch statments are fine now the V8 engine likes them 
                case 'loadAudio':
                    this.#loadAudio(event.url);
                    break;
                case 'play':
                    if (this.eventSystem.isAudioLoaded) {
                        this.#play();
                    } else if (this.eventSystem.isAudioLoading) {
                        //console.log("audio is loading")
                        clearEvent = false; // we have to wait
                    }
                    break;
                case 'pause':
                    if (this.eventSystem.isAudioLoading) {
                        clearEvent = false; // we have to wait
                    } else {
                        this.#pause();
                    }
            }

            if (clearEvent) this.eventSystem.events.shift();
        }
    }

    #timeHandler(elapsedTime) {

        let deltaTime;
        let time;

        if (this.audioObject.gumStream && this.audioObject.gumStream.active) {
            deltaTime = elapsedTime - this.timeSystem.previousTime;
            this.timeSystem.previousTime = elapsedTime;
            time = elapsedTime;
        } else if (this.audioObject.sound.isPlaying && this.audioObject.sound.started) {
            deltaTime = this.audioObject.sound.listener.timeDelta;
            time = this.audioObject.sound.context.currentTime;
            this.timeSystem.lastKnownTime = time;
        } else if (!this.audioObject.sound.isPlaying && this.audioObject.sound.started) {
            time = this.timeSystem.lastKnownTime;
            deltaTime = 0;
        } else {
            deltaTime = elapsedTime - this.timeSystem.previousTime;
            this.timeSystem.previousTime = elapsedTime;
            time = elapsedTime;
        }

        return { time, deltaTime };
    }

    update(elapsedTime) {

        if (elapsedTime - this.timeSystem.previousTime >= this.timeSystem.interval) { // ok so we can just do this to handle internal 30 fps 
            if (this.eventSystem.areResourcesLoaded) {

                const { time, deltaTime } = this.#timeHandler(elapsedTime);

                //console.log(time, deltaTime, elapsedTime)

                this.#processEvents();
                this.#updateGPGPU(time, deltaTime);
                this.#processAudioData();
                this.#computeGPGU();

                this.particles.rotation.y = Math.sin(elapsedTime) / 20;
                this.particles.rotation.x = Math.cos(elapsedTime) / 10;
            }
        }
    }
}