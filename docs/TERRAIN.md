# The land

The globe used to be a sphere with a green paint job. It now carries a height
field: `src/world/terrain.js` says how high the ground is at any direction, and
everything else asks it — the land mesh, every model the spawner stands up, the
streets, and the player, who rides up and down as the world turns under them.

Heights are metres above the sphere of `GLOBE_RADIUS`. Sea level is a little
below it, so anywhere the land dips far enough fills with water. That is where
the ponds, the lakes and the rivers come from: one shell of water at sea level,
and hollows in the land.

## What shapes it: `src/data/terrain.json`

```json
{
  "seed": 6172025,
  "seaLevel": -7,
  "hills":  [ { "frequency": 1.7, "amplitude": 16 }, … ],
  "ridge":  { "frequency": 2.3, "amplitude": 26, "base": -6 },
  "settled": [ { "at": [0, 1, 0], "calm": 130, "fades": 300, "damp": 0.38, "level": 9 } ],
  "rivers":  [ { "from": […], "to": […], "width": 14, "depth": 22, "bank": 28, "wander": 16 } ]
}
```

- **hills** — octaves of smooth noise: the first is the shape of the land, the
  rest is the detail on it. Amplitudes are metres.
- **ridge** — ridged noise, which folds instead of rolling: that is what reads
  as a mountain range rather than another round hill. `base` sinks the whole
  planet, and so decides how much of it is sea.
- **settled** — where the towns are, the land is calmer. Each entry damps the
  relief within `calm` metres, fading out by `fades`, and pulls the ground to
  `level` — a shelf above the water. It is not flattened: the streets still run
  up and down, they just do not start halfway up a cliff.
- **rivers** — a line drawn on the globe (`from` and `to` are directions) and a
  valley cut along it, `depth` metres deep and `bank` metres wide, wandering by
  `wander` so it is not ruler-straight. Anything the cut takes below sea level
  fills with water on its own.

Everything here is seeded, so the same numbers always give the same planet.

## What the streets do to it

A road is not draped over every bump. Each street gets a **profile**
(`streetProfiles()` in `city-plan.js`): the natural ground along it, smoothed,
then held to a gradient of `MAX_GRADE`, lifted clear of the water, and finally
reconciled with every street it crosses so that a junction is one height rather
than two. The land is then **carved** to that profile (`carveStreets()` in
`terrain.js`), which is what makes the cuttings and embankments — and why there
is no seam between road and ground: they are the same surface.

Where earthworks cannot do it, structures do:

| | when | what gets built |
| --- | --- | --- |
| **bridge** | the road stands more than `BRIDGE_CLEAR` above the ground | deck, parapets and piers every 14 m |
| **tunnel** | the ground stands more than `TUNNEL_COVER` above the road | a bore through the hill with a portal at each end |

Both are settled twice: after the first carve each street can see what its
neighbours did to the ground, and a hill that the road alongside has cut away
is not worth tunnelling through any more.

`walkHeight()` is what the player rides — the land, unless a street is carrying
them over it on a deck or through it in a bore. Which is to say you can drive
over the bridges.

## Working on it

- Sizes are in metres; one world unit is one metre.
- `elevation()` is called a great many times when the land mesh is built, so
  keep it cheap and keep it **smooth** — `tests/terrain.test.js` checks that a
  half-metre step never changes the height by a cliff's worth, because anything
  standing on a discontinuity jitters.
- Nothing is built below `SEA_LEVEL + 1.5` or on a slope steeper than 0.38
  (`isBuildable()`), so moving a river can quietly empty a block of houses.
