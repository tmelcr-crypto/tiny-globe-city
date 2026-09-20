import * as THREE from 'three';
import { GLOBE_RADIUS } from './planet.js';
import { grid } from './grid.js';

// A flat map of one face of the planet.
//
// Everything laid out on the ground — streets, blocks, plots — is easier to
// think about on a flat map than in three dimensions, but no one flat map
// covers a globe. So each face of the cubed sphere gets its own: u runs east
// across the face, v runs north up it, both in metres, with the face's centre
// at the origin.
//
// The useful part is that a straight line on one of these maps is a great
// circle on the globe — dead straight over the ground — because the map is the
// cube face the sphere was blown out of. Streets are straight lines here.

const HALF_FACE = (GLOBE_RADIUS * Math.PI) / 4;

const charts = new Map();

export function chartFor(faceId) {
  let chart = charts.get(faceId);
  if (chart) return chart;

  chart = {
    faceId,
    // How far the map reaches from the middle of the face to its edge.
    span: HALF_FACE,

    direction(u, v, target = new THREE.Vector3()) {
      return grid.direction(faceId, u / GLOBE_RADIUS, v / GLOBE_RADIUS, target);
    },

    // Where a direction lands on this map. `onFace` is false when it is really
    // on one of the other five, in which case the numbers still make sense but
    // stretch away fast.
    local(direction) {
      const { faceId: found, a, b } = grid.locate(direction);
      return { u: a * GLOBE_RADIUS, v: b * GLOBE_RADIUS, onFace: found === faceId };
    },

    holds(u, v) {
      return Math.abs(u) <= HALF_FACE && Math.abs(v) <= HALF_FACE;
    },
  };
  charts.set(faceId, chart);
  return chart;
}

// Which face a direction belongs to, and its map there.
export function chartUnder(direction) {
  return chartFor(grid.locate(direction).faceId);
}
