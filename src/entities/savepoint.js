import * as THREE from 'three';
import { latLonToDirection } from '../world/geo.js';

// A safehouse marker on the globe surface. Manual saves happen here.
export function createSavepoint(def, globeRadius) {
  const dir = latLonToDirection(def.lat, def.lon);
  const height = 2.4;

  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, height, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x664400 })
  );
  beacon.position.copy(dir).multiplyScalar(globeRadius + height / 2);
  beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  beacon.userData.savepointId = def.id;
  beacon.userData.savepointName = def.name;
  return beacon;
}
