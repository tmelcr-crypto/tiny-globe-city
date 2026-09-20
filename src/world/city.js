import * as THREE from 'three';
import world from '../data/world.json';

// Districts are hand-authored in src/data/world.json (lat/lon center + a
// street grid). Buildings and roads are laid out on a flat local tangent
// plane at each district's center, then projected onto the globe surface.

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);
const GROUND_OFFSET = 0.03; // lifts streets/building bases off the sphere to avoid z-fighting
const ROAD_THICKNESS = 0.05;

function dirFromLatLon(lat, lon) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

// East/north/normal basis tangent to the sphere at `point`.
function surfaceBasis(point) {
  const normal = point.clone().normalize();
  const up = Math.abs(normal.dot(WORLD_UP)) > 0.999 ? FALLBACK_UP : WORLD_UP;
  const east = new THREE.Vector3().crossVectors(up, normal).normalize();
  const north = new THREE.Vector3().crossVectors(normal, east);
  return { normal, east, north };
}

function basisQuaternion(east, normal, north) {
  const m = new THREE.Matrix4().makeBasis(east, normal, north);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

// Projects a local tangent-plane offset (east, north) from a district's
// center onto the sphere surface, at the given radial height above it.
function projectToSphere(center, east, north, localX, localZ, radius, height) {
  const flat = center.clone()
    .add(east.clone().multiplyScalar(localX))
    .add(north.clone().multiplyScalar(localZ));
  return flat.normalize().multiplyScalar(radius + height);
}

export function buildCity(pivot, radius) {
  for (const district of world.districts) {
    pivot.add(buildDistrict(district, radius));
  }
}

function buildDistrict(district, radius) {
  const group = new THREE.Group();
  group.name = district.id;

  const { blocksX, blocksZ, blockSize, streetWidth } = district;
  const center = dirFromLatLon(district.lat, district.lon).multiplyScalar(radius);
  const { east, north } = surfaceBasis(center);
  const gridW = blocksX * blockSize + (blocksX - 1) * streetWidth;
  const gridD = blocksZ * blockSize + (blocksZ - 1) * streetWidth;

  group.add(buildBlocks(district, center, east, north, radius, gridW, gridD));
  group.add(buildRoads(district, center, east, north, radius, gridW, gridD));

  return group;
}

function buildBlocks(district, center, east, north, radius, gridW, gridD) {
  const { blocksX, blocksZ, blockSize, streetWidth, density, buildingHeight, buildingFootprint } = district;
  const count = blocksX * blocksZ;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: district.color, flatShading: true }),
    count
  );
  const dummy = new THREE.Object3D();
  const [minH, maxH] = buildingHeight;
  const [minF, maxF] = buildingFootprint;
  let i = 0;

  for (let x = 0; x < blocksX; x++) {
    for (let z = 0; z < blocksZ; z++) {
      const occupied = Math.random() < density;
      const localX = -gridW / 2 + blockSize / 2 + x * (blockSize + streetWidth);
      const localZ = -gridD / 2 + blockSize / 2 + z * (blockSize + streetWidth);
      const h = occupied ? THREE.MathUtils.randFloat(minH, maxH) : 0;
      const fw = occupied ? THREE.MathUtils.randFloat(minF, maxF) : 0;
      const fd = occupied ? THREE.MathUtils.randFloat(minF, maxF) : 0;

      const base = projectToSphere(center, east, north, localX, localZ, radius, GROUND_OFFSET);
      const { normal, east: e, north: n } = surfaceBasis(base);

      dummy.position.copy(base).add(normal.clone().multiplyScalar(h / 2));
      dummy.quaternion.copy(basisQuaternion(e, normal, n));
      dummy.scale.set(fw, h, fd);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildRoads(district, center, east, north, radius, gridW, gridD) {
  const { blocksX, blocksZ, blockSize, streetWidth, roadColor } = district;
  const lineCount = (blocksX + 1) + (blocksZ + 1);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: roadColor, flatShading: true }),
    lineCount
  );
  const dummy = new THREE.Object3D();
  let i = 0;

  const place = (localX, localZ, scaleX, scaleZ) => {
    const base = projectToSphere(center, east, north, localX, localZ, radius, GROUND_OFFSET);
    const { normal, east: e, north: n } = surfaceBasis(base);
    dummy.position.copy(base);
    dummy.quaternion.copy(basisQuaternion(e, normal, n));
    dummy.scale.set(scaleX, ROAD_THICKNESS, scaleZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(i++, dummy.matrix);
  };

  // North-south lines, one before/after/between each column of blocks.
  for (let x = 0; x <= blocksX; x++) {
    const localX = -gridW / 2 - streetWidth / 2 + x * (blockSize + streetWidth);
    place(localX, 0, streetWidth, gridD + streetWidth);
  }
  // East-west lines, one before/after/between each row of blocks.
  for (let z = 0; z <= blocksZ; z++) {
    const localZ = -gridD / 2 - streetWidth / 2 + z * (blockSize + streetWidth);
    place(0, localZ, gridW + streetWidth, streetWidth);
  }

  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
