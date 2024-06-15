import * as THREE from 'three';
import { XRButton } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import PlaylistUI from './mr/PlaylistUI';
import ThreeMeshUI from 'three-mesh-ui'
import VRControl from './mr/VRControl';

let container, xrSession, clock, listener;
let camera, scene, renderer;
let vrControl; 

let baryonPlaylistUI, noiseMesh; 

let controls, group;

const objsToTest = []; 

const raycaster = new THREE.Raycaster();

const mouse = new THREE.Vector2();
mouse.x = mouse.y = null;

let selectState = false;
let activeController = 0; 

const playlist = {
    title: "Baryon",
    public: true,
    owner: "liljGremlin",
    songs: [
        {
            name: "Mideo a Pensar",
            by: "NEOKIRA",
            time: 1.54,
            image: './images/Miedo_a_Pensar.jpg',
            audio: './music/Miedo a Pensar.mp3',
        },
        {
            name: "april",
            by: "808toofly",
            time: 1.40,
            image: './images/april.jpg',
            audio: './music/april.mp3',
        },
        {
            name: "Tacones",
            by: "No Me Toques",
            time: 2.24,
            image: './images/Tacones.jpg',
            audio: './music/Tacones.mp3',
        },
        {
            name: "La Risa Drilarisa",
            by: "Columpios AI Suelo",
            time: 4.41,
            image: './images/La_Risa_Drilarisa.jpg',
            audio: './music/La Risa Drilarisa.mp3',
        },
        {
            name: "Fondo",
            by: "Forma Norte",
            time: 1.31,
            image: './images/Fondo.jpg',
            audio: './music/Fondo.mp3',
        },
    ]
}


init();

function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10);
    camera.position.set(1, 1.6, 0);

    const floorGeometry = new THREE.PlaneGeometry(6, 6);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.25, blending: THREE.CustomBlending, transparent: false });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = - Math.PI / 2;

    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight(0xbcbcbc, 0xa5a5a5, 3));

    const ambientLight = new THREE.AmbientLight(new THREE.Color(0xfff2cf), 4)
    scene.add(ambientLight);

    group = new THREE.Group();
    scene.add(group);

    // Helper 
    scene.add(
        new THREE.AxesHelper(1)
    )
    // renderer

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animate);
    //renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    document.body.appendChild(XRButton.createButton(renderer));

    // controllers

    // Orbit controls for no-vr

	controls = new OrbitControls( camera, renderer.domElement );
	camera.position.set( 0, 1.6, 0 );
	controls.target = new THREE.Vector3( 0, 1, -1.8 );

    ////////////////
	// Controllers
	////////////////

	vrControl = VRControl( renderer, camera, scene );

	scene.add( vrControl.controllerGrips[ 0 ], vrControl.controllers[ 0 ] );
    scene.add( vrControl.controllerGrips[ 1 ], vrControl.controllers[ 1 ] );


	vrControl.controllers[ 0 ].addEventListener( 'selectstart', () => {

        activeController = 0;
		selectState = true;

	} );
	vrControl.controllers[ 0 ].addEventListener( 'selectend', () => {

		selectState = false;

	} );

    vrControl.controllers[ 1 ].addEventListener( 'selectstart', () => {

        console.log("selectstart -> right controller"); 
        activeController = 1;
		selectState = true;

	} );
	vrControl.controllers[ 1 ].addEventListener( 'selectend', () => {

		selectState = false;

	} );

    window.addEventListener('resize', onWindowResize);

    renderer.xr.addEventListener('sessionstart', (event) => {
        console.log('Entered VR mode');
        xrSession = true;
    });

    renderer.xr.addEventListener('sessionend', () => {
        console.log('Exited VR mode');
        xrSession = false;
    });

    // // Create an audio listener and add it to the camera
    listener = new THREE.AudioListener();
    camera.add(listener);

    // // Playlist
    baryonPlaylistUI = new PlaylistUI(listener, playlist);
    baryonPlaylistUI.scale.multiplyScalar(1/10);
    baryonPlaylistUI.position.set(0, 1, -.4);
    objsToTest.push(...baryonPlaylistUI.objsToTest); 
    scene.add(baryonPlaylistUI);

    clock = new THREE.Clock();
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

//

function animate() {
    const deltaTime = clock.getDelta();
    const elapstedTime = clock.elapstedTime; 
    ThreeMeshUI.update(); 

    controls.update();
    renderer.render(scene, camera);

    updateButtons();
}

function updateButtons() {

	// Find closest intersecting object

	let intersect

	if ( renderer.xr.isPresenting ) {

		vrControl.setFromController( activeController, raycaster.ray );

		intersect = raycast();

		// Position the little white dot at the end of the controller pointing ray
		if ( intersect ) vrControl.setPointerAt( activeController, intersect.point );


	} else if ( mouse.x !== null && mouse.y !== null ) {

		raycaster.setFromCamera( mouse, camera );

		intersect = raycast();

	}

	// Update targeted button state (if any)

	if ( intersect && intersect.object.isUI ) {

		if ( selectState ) {

			// Component.setState internally call component.set with the options you defined in component.setupState
			intersect.object.setState( 'selected' );

		} else {

			// Component.setState internally call component.set with the options you defined in component.setupState
			intersect.object.setState( 'hovered' );

		}

	}

	// Update non-targeted buttons state

	objsToTest.forEach( ( obj ) => {

		if ( ( !intersect || obj !== intersect.object ) && obj.isUI ) {

			// Component.setState internally call component.set with the options you defined in component.setupState
			obj.setState( 'idle' );

		}

	} );

}

function raycast() {

	return objsToTest.reduce( ( closestIntersection, obj ) => {

		const intersection = raycaster.intersectObject( obj, true );

		if ( !intersection[ 0 ] ) return closestIntersection;

		if ( !closestIntersection || intersection[ 0 ].distance < closestIntersection.distance ) {

			intersection[ 0 ].object = obj;

			return intersection[ 0 ];

		}

		return closestIntersection;

	}, null );

}

function loadTrack(index) {
    if (currentAudio) {
        currentAudio.stop();
        currentAudio = null;
    }

    currentAudio = new THREE.Audio(listener);
    audioLoader.load(tracks[index], function(buffer) {
        currentAudio.setBuffer(buffer);
        currentAudio.setLoop(false);
        currentAudio.setVolume(0.5);
        currentAudio.play();
    });
}