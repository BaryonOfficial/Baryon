import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const DEFAULT_LOGO_SPAN = 1.2;

function collectMeshGeometries(root) {
  const geometries = [];
  root?.updateMatrixWorld?.(true);
  root?.traverse?.((child) => {
    const sourcePosition = child?.geometry?.attributes?.position;
    if (!child?.isMesh || !sourcePosition?.count) {
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", sourcePosition.clone());
    if (child.geometry.index) {
      geometry.setIndex(child.geometry.index.clone());
    }
    const sourceNormal = child.geometry.attributes.normal;
    if (sourceNormal?.count === sourcePosition.count) {
      geometry.setAttribute("normal", sourceNormal.clone());
    } else {
      geometry.computeVertexNormals();
    }
    geometry.applyMatrix4(child.matrixWorld);
    geometries.push(geometry.toNonIndexed());
    geometry.dispose();
  });
  return geometries;
}

export function prepareBaryonGeometryFromScene(scene) {
  const geometries = collectMeshGeometries(scene);
  if (geometries.length === 0) {
    throw new Error("Logo scene does not contain mesh triangle geometry");
  }

  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((source) => source.dispose());
  if (!geometry?.attributes?.position?.count) {
    geometry?.dispose?.();
    throw new Error("Prepared logo geometry is missing position data");
  }

  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const sourceSpan = Math.max(size.x, size.y, size.z);
  if (!(sourceSpan > 0)) {
    geometry.dispose();
    throw new Error("Prepared logo geometry has no spatial extent");
  }

  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(
    DEFAULT_LOGO_SPAN / sourceSpan,
    DEFAULT_LOGO_SPAN / sourceSpan,
    DEFAULT_LOGO_SPAN / sourceSpan,
  );
  if (!geometry.attributes.normal?.count) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
