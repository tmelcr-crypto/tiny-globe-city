// Generic, data-driven builders for interchangeable car parts.
// Adding a new wheel/spoiler/exhaust/hood variant is a data-only change in
// data/car-parts.json — these builders read shape from the part def, they
// never branch on a specific id.
import * as THREE from 'three';

const toColor = (value, fallback) => (value == null ? fallback : Number(value));

function standardMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true });
}

// Wheel axis runs along local X. A cylinder's default axis is Y, so it's
// rotated 90deg around Z to lie flat like a real wheel.
export function buildWheel(part) {
  const group = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(part.radius, part.radius, part.width, 12),
    standardMaterial(toColor(part.tireColor, 0x222222))
  );
  tire.rotation.z = Math.PI / 2;
  group.add(tire);

  if (part.hubRadius) {
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(part.hubRadius, part.hubRadius, part.width + 0.02, 8),
      standardMaterial(toColor(part.hubColor, 0x888888))
    );
    hub.rotation.z = Math.PI / 2;
    group.add(hub);
  }
  return group;
}

// Sits at the rear-top slot. A part with no `width` (e.g. spoiler_none)
// yields an empty group, so "no spoiler" is just another data entry.
export function buildSpoiler(part) {
  const group = new THREE.Group();
  if (!part.width) return group;

  const color = toColor(part.color, 0x111111);
  const material = standardMaterial(color);
  const riserDepth = part.depth * 0.5;
  const riserX = part.width / 2 - 0.08;

  for (const side of [-1, 1]) {
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.05, part.riserHeight, riserDepth), material);
    riser.position.set(side * riserX, part.riserHeight / 2, 0);
    group.add(riser);
  }

  const wing = new THREE.Mesh(new THREE.BoxGeometry(part.width, part.thickness, part.depth), material);
  wing.position.set(0, part.riserHeight + part.thickness / 2, 0);
  group.add(wing);
  return group;
}

// Sits at the rear-bottom slot. `pipes` count and `sideExit` are the only
// knobs a new exhaust type needs — everything else is dimensions/color.
export function buildExhaust(part, chassis) {
  const group = new THREE.Group();
  const material = standardMaterial(toColor(part.color, 0x999999));
  const count = part.pipes || 1;
  const spacing = part.sideExit ? chassis.width * 0.5 : Math.min(0.3, chassis.width * 0.25);

  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spacing;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(part.radius, part.radius, part.length, 8), material);
    if (part.sideExit) {
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(chassis.width / 2 + part.length / 2, part.radius, offset);
    } else {
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(offset, part.radius, -part.length / 2);
    }
    group.add(pipe);
  }
  return group;
}

// Sits at the front-top slot, flush with the body's top face.
// `color` overrides the body color when a part wants a contrast panel.
export function buildHood(part, chassis, bodyColor) {
  const group = new THREE.Group();
  const color = toColor(part.color, bodyColor);
  const material = standardMaterial(color);
  const hoodLength = chassis.length * 0.32;
  const hoodWidth = chassis.width * 0.85;

  const panel = new THREE.Mesh(new THREE.BoxGeometry(hoodWidth, 0.03, hoodLength), material);
  panel.position.set(0, 0.015, -hoodLength / 2);
  group.add(panel);

  if (part.scoopWidth) {
    const scoop = new THREE.Mesh(
      new THREE.BoxGeometry(part.scoopWidth, part.scoopHeight, part.scoopDepth),
      material
    );
    scoop.position.set(0, part.scoopHeight / 2, -hoodLength / 2);
    group.add(scoop);
  }

  if (part.vents) {
    const ventSpacing = hoodWidth / (part.vents + 1);
    for (let i = 0; i < part.vents; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(part.ventWidth, 0.02, part.ventDepth), material);
      vent.position.set(-hoodWidth / 2 + ventSpacing * (i + 1), 0.03, -hoodLength / 2);
      group.add(vent);
    }
  }
  return group;
}

export const PART_BUILDERS = {
  wheel: buildWheel,
  spoiler: buildSpoiler,
  exhaust: buildExhaust,
  hood: buildHood,
};
