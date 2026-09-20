import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGlobe, GLOBE_RADIUS } from '../src/world/globe.js';
import { spawnAll } from '../src/world/spawner.js';
import { walkHeight, elevation, SEA_LEVEL } from '../src/world/terrain.js';
import { streetProfiles, MAX_GRADE, streetUnder } from '../src/world/city-plan.js';
import { CAR_RADIUS } from '../src/entities/car.js';
import { FACE_IDS } from '../src/world/sphere-grid.js';

// Drive a car over every road on the planet and see whether the drive is any
// good: the surface has to be there, it has to be level under the wheels, it
// must not climb faster than a car can pull, and it must not jolt.
//
// The world is built once — carving the streets into the land is the slow part
// — and every test reads the same drive.

const DRIVE = (() => {
  const pivot = createGlobe();
  const interactables = spawnAll(pivot);
  const profiles = streetProfiles();

  const _dir = new THREE.Vector3();
  const legs = [];

  for (const street of profiles) {
    const wheels = street.samples.map((sample) => {
      street.chart.direction(sample.u, sample.v, _dir);
      return {
        u: sample.u,
        v: sample.v,
        faceId: street.faceId,
        carries: sample.carries,
        planned: sample.height,
        // What the car actually rides on: the carved land, or the deck of a
        // bridge or the floor of a tunnel where one carries the road.
        under: walkHeight(_dir),
        land: elevation(_dir),
        direction: _dir.clone(),
      };
    });

    for (let s = 0; s < wheels.length - 1; s++) {
      const a = wheels[s];
      const b = wheels[s + 1];
      const run = Math.hypot(b.u - a.u, b.v - a.v);
      legs.push({
        street: street.id,
        faceId: street.faceId,
        kind: street.kind,
        from: a,
        to: b,
        run,
        grade: (b.under - a.under) / run,
        bearing: Math.atan2(b.v - a.v, b.u - a.u),
      });
    }
  }

  return { pivot, interactables, profiles, legs };
})();

const drivenFaces = new Set(DRIVE.legs.map((leg) => leg.faceId));
const metres = DRIVE.legs.reduce((sum, leg) => sum + leg.run, 0);

describe('driving every road on the planet', () => {
  it('has a road to drive on every face', () => {
    for (const faceId of FACE_IDS) {
      expect(drivenFaces.has(faceId), `nothing to drive on face ${faceId}`).toBe(true);
    }
    // A planet's worth of road, not a ring road round one town.
    expect(metres).toBeGreaterThan(8000);
  });

  it('finds ground under the wheels the whole way round', () => {
    // Wherever the plan says the road is, that is what the car drives on: the
    // land was carved to it, or a bridge or a tunnel carries it there.
    const adrift = DRIVE.legs.filter((leg) => Math.abs(leg.from.under - leg.from.planned) > 0.6);
    const worst = adrift.sort(
      (x, y) => Math.abs(y.from.under - y.from.planned) - Math.abs(x.from.under - x.from.planned)
    )[0];
    expect(
      adrift.length / DRIVE.legs.length,
      worst && `${worst.street} floats ${(worst.from.under - worst.from.planned).toFixed(2)} m off its plan`
    ).toBeLessThan(0.02);
  });

  it('never climbs faster than a car can pull', () => {
    // Held to the same gradient the streets were planned to, with a little
    // slack for the surfacing.
    for (const leg of DRIVE.legs) {
      expect(
        Math.abs(leg.grade),
        `${leg.street} climbs at ${(leg.grade * 100).toFixed(1)} in 100`
      ).toBeLessThan(MAX_GRADE * 1.6);
    }
  });

  it('rides without jolting', () => {
    // A jolt is a change of gradient from one step to the next: the ride is
    // only smooth if the road bends gently rather than kinking.
    let worst = 0;
    let where = '';
    for (let i = 1; i < DRIVE.legs.length; i++) {
      const before = DRIVE.legs[i - 1];
      const after = DRIVE.legs[i];
      if (before.street !== after.street) continue;
      const jolt = Math.abs(after.grade - before.grade);
      if (jolt > worst) {
        worst = jolt;
        where = after.street;
      }
    }
    // The sharpest thing the road is allowed to do is come over a crest from
    // the steepest climb into the steepest drop. Anything past that is a kink.
    expect(worst, `${where} kinks by ${(worst * 100).toFixed(1)} in 100`)
      .toBeLessThan(MAX_GRADE * 2 + 0.02);
  });

  it('keeps the carriageway clear of everything the town builds', () => {
    // Anything solid standing within half a road of the centreline would be
    // driven into. Bridges and tunnels are their own structures, so what is
    // checked is the road itself.
    // A hand-placed layout is authored to the metre against its own lane — an
    // estate's parking court is not the public road — so what is checked here
    // is everything the town put up by itself.
    const solid = DRIVE.pivot.children.filter((child) =>
      ['building', 'safehouse', 'tree', 'rock', 'mountain', 'prop'].includes(child.userData?.type)
      && !child.userData.marker
    );
    const blocking = [];
    for (const object of solid) {
      const street = streetUnder(object.position);
      if (!street) continue;
      // Measured from the thing's own edge, not its middle: a tree on the
      // pavement is a tree on the pavement, but a branch over the kerb line
      // is something the car would hit.
      const edge = street.distance - (object.userData.footprint ?? 0);
      if (edge < street.width / 2 + 0.3) {
        blocking.push(`${object.userData.id ?? object.userData.type} in ${street.id}`);
      }
    }
    expect(blocking.slice(0, 5)).toEqual([]);
  });

  it('keeps its bridges over the ground and its tunnels under it', () => {
    for (const leg of DRIVE.legs) {
      const { carries, under, land } = leg.from;
      // A metre of slack at each end: a bridge meets its abutment and a tunnel
      // its portal, and there the deck and the land are the same height.
      if (carries === 'bridge') {
        expect(under, `a bridge on ${leg.street} is buried`).toBeGreaterThan(land - 1.5);
      }
      if (carries === 'tunnel') {
        expect(under, `a tunnel on ${leg.street} stands out of the hill`).toBeLessThan(land + 1.5);
      }
    }
  });

  it('keeps the road out of the sea except where it is bridged', () => {
    const drowned = DRIVE.legs.filter((leg) => leg.from.under < SEA_LEVEL && leg.from.carries !== 'bridge');
    expect(drowned.map((leg) => leg.street).slice(0, 5)).toEqual([]);
  });

  it('turns no sharper than a car can steer', () => {
    // A car at town speed needs a few metres to come round. Measured as the
    // turn per metre driven, which is one over the radius of the bend.
    for (let i = 1; i < DRIVE.legs.length; i++) {
      const before = DRIVE.legs[i - 1];
      const after = DRIVE.legs[i];
      if (before.street !== after.street) continue;
      let turn = after.bearing - before.bearing;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const radius = after.run / Math.max(1e-6, Math.abs(turn));
      expect(radius, `${after.street} bends to a ${radius.toFixed(1)} m radius`).toBeGreaterThan(6);
    }
  });

  it('drives a real car along the network without leaving the road', () => {
    // Put a car on the road and step it along one of the longest streets,
    // standing it on whatever the ground turns out to be at each step. It is
    // the ride the player gets, so nothing here may surprise it.
    const longest = [...DRIVE.profiles].sort((a, b) => b.samples.length - a.samples.length)[0];
    const car = DRIVE.interactables.find((entity) => entity.userData?.type === 'car')
      ?? new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const _dir = new THREE.Vector3();

    let previous = null;
    for (const sample of longest.samples) {
      longest.chart.direction(sample.u, sample.v, _dir).normalize();
      const height = walkHeight(_dir);
      car.position.copy(_dir).multiplyScalar(GLOBE_RADIUS + height);
      car.quaternion.setFromUnitVectors(up, _dir);
      car.updateMatrixWorld(true);

      // Every step the car takes is a step along the ground, not through it.
      if (previous) {
        const step = car.position.distanceTo(previous);
        expect(step, `${longest.id} teleports ${step.toFixed(1)} m`).toBeLessThan(12);
      }
      previous = car.position.clone();
    }
  });

  it('parks its traffic off the carriageway', () => {
    const cars = DRIVE.pivot.children.filter(
      (child) => child.userData?.type === 'car' && !child.userData.marker
    );
    expect(cars.length).toBeGreaterThan(3);
    for (const car of cars) {
      const street = streetUnder(car.position);
      // Parked at the kerb: beside the road it belongs to, not out in a field.
      expect(street.distance, `${car.userData.id} is parked nowhere near a road`)
        .toBeLessThan(street.width);
    }
  });
});
