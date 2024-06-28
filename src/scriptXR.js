import * as THREE from 'three';
import Stats from 'stats.js';
import { XRButton } from 'three/examples/jsm/Addons.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import ThreeMeshUI from 'three-mesh-ui'
import VRControl from './mr/VRControl';
import MainUI from './mr/MainUI';
import { Baryon } from './Baryon';
import { Koch, Koch4D, DomainKoch } from './XRE/Koch';

const stats = new Stats();
stats.showPanel(0)
document.body.appendChild(stats.dom);

let container, xrSession, clock, listener;
let camera, scene, renderer;
let vrControl;

let mainUI, koch_1, koch_2, koch4D, domain_1, mandlebort, juila, baryon;

let controls, group;

const objsToTest = [];

const raycaster = new THREE.Raycaster();

const mouse = new THREE.Vector2();
mouse.x = mouse.y = null;

let selectState = false;
let activeController = 0;

init();

function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, -.5, 2);

    scene.add(new THREE.HemisphereLight(0xbcbcbc, 0xa5a5a5, 3));

    const ambientLight = new THREE.AmbientLight(new THREE.Color(0xfff2cf), 4)
    scene.add(ambientLight);

    // group = new THREE.Group();
    // scene.add(group);

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
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target = new THREE.Vector3(0, 0, 0);

    ////////////////
    // Controllers
    ////////////////

    vrControl = VRControl(renderer, camera, scene);

    scene.add(vrControl.controllerGrips[0], vrControl.controllers[0]);
    scene.add(vrControl.controllerGrips[1], vrControl.controllers[1]);

    vrControl.controllers[0].addEventListener('selectstart', () => {

        activeController = 0;
        selectState = true;

    });

    vrControl.controllers[0].addEventListener('selectend', () => {

        selectState = false;

    });

    vrControl.controllers[1].addEventListener('selectstart', () => {

        console.log("selectstart -> right controller");
        activeController = 1;
        selectState = true;

    });

    vrControl.controllers[1].addEventListener('selectend', () => {

        selectState = false;

    });

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
    mainUI = new MainUI();
    mainUI.scale.multiplyScalar(1 / 4);
    mainUI.position.set(-0.5, .8, -.4);

    // objsToTest.push(...baryonPlaylistUI.objsToTest);
    // scene.add(mainUI);

    var color_1 = new THREE.Color(Math.random(), Math.random(), Math.random())
    var color_2 = new THREE.Color(Math.random(), Math.random(), Math.random())

    // koch4D = new Koch4D(new THREE.Color("red"), new THREE.Color("black"));
    // koch4D = new Koch4D(color_1, color_2);
    // koch4D.scale.multiplyScalar(1 / 3);
    // koch4D.position.set(.2, .9, -.4)
    // scene.add(koch4D)

    // mandlebort = new MandlebrotCube();
    // mandlebort.scale.multiplyScalar(1 / 150);
    // mandlebort.position.set(0, 1.5, -1);
    // scene.add(mandlebort);


    // juila = new Juila3D();
    // scene.add(juila);

    baryon = new Baryon(renderer, camera);
    baryon.scale.multiplyScalar(1 / 6);
    baryon.position.set(0, 1.25, -1);
    scene.add(baryon);
    clock = new THREE.Clock();
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Game loop 

function animate() {
    stats.begin();
    const elapstedTime = clock.getElapsedTime();
    const deltaTime = clock.getDelta();
    ThreeMeshUI.update();
    baryon.update(elapstedTime, deltaTime);
    //mandlebort.update(elapstedTime);
    // juila.update();
    // koch4D.update(elapstedTime);
    controls.update();
    renderer.render(scene, camera);

    updateButtons(elapstedTime);
    stats.end();
}

function updateButtons() {

    // Find closest intersecting object

    let intersect

    if (renderer.xr.isPresenting) {

        vrControl.setFromController(activeController, raycaster.ray);

        intersect = raycast();

        // Position the little white dot at the end of the controller pointing ray
        if (intersect) vrControl.setPointerAt(activeController, intersect.point);


    } else if (mouse.x !== null && mouse.y !== null) {

        raycaster.setFromCamera(mouse, camera);

        intersect = raycast();

    }

    // Update targeted button state (if any)

    if (intersect && intersect.object.isUI) {

        if (selectState) {

            // Component.setState internally call component.set with the options you defined in component.setupState
            intersect.object.setState('selected');

        } else {

            // Component.setState internally call component.set with the options you defined in component.setupState
            intersect.object.setState('hovered')
        }
    }

    // Update non-targeted buttons state

    objsToTest.forEach((obj) => {

        if ((!intersect || obj !== intersect.object) && obj.isUI) {

            // Component.setState internally call component.set with the options you defined in component.setupState
            obj.setState('idle');
        }
    });

}

function raycast() {

    return objsToTest.reduce((closestIntersection, obj) => {

        const intersection = raycaster.intersectObject(obj, true);

        if (!intersection[0]) return closestIntersection;

        if (!closestIntersection || intersection[0].distance < closestIntersection.distance) {

            intersection[0].object = obj;

            return intersection[0];
        }

        return closestIntersection;

    }, null);

}
