import * as THREE from 'three'
import { XRButton } from "three/examples/jsm/Addons.js";

export const mrObject = {
    isActive: false,
    xr: null,
}

export function mrSetup(renderer) {

    if (navigator.xr === undefined) {
        console.log("navigator.xr is undefined webxr is not supported");
        return
    }

    document.body.appendChild(XRButton.createButton(renderer, {
        requiredFeatures: ['plane-detection']
    }));
}