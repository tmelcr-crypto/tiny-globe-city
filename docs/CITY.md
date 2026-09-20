# The city map

The town is authored, not generated fresh each run. `src/data/city-map.json`
describes it, `src/world/city-plan.js` turns that into coordinates, and
`src/world/spawner.js` builds it. Same map in, same town out, every time.

This file is how we talk about layout changes: describe the change as an edit to
the map, and it is unambiguous.

## The map

```
"rows": [
  ". h h .",
  "p h a h",
  "h @ a h",
  "c t t a"
]
```

One character per block. **Row 0 is the north edge, column 0 the west edge.**
The player faces south, so they look *down* the map from wherever `@` is.

Roads run between every pair of blocks, with sidewalks either side, so the road
grid follows from the shape of the map — you never place a road by hand.

## Legend

| Char | Zone | What goes there |
| --- | --- | --- |
| `.` | empty | grass and trees, no buildings |
| `h` | houses | suburb houses |
| `a` | apartments | apartment blocks, the odd house or tower |
| `t` | towers | downtown skyscrapers |
| `c` | church | the church |
| `p` | park | lawn with the lake in it, no buildings |
| `@` | houses | where the player starts; also holds the safehouse |

Each legend entry carries a `buildings` count — how many go in that block — so
density is authored too, not guessed.

## Making a change

Most layout changes are one character.

- **Move downtown** — put the `t`s where you want them. They are the tall ones,
  so keep them off the block the player starts in.
- **Move the player** — move `@`. The grid re-centres on it, so the player
  always starts on the grass verge just inside that block's north-east corner.
- **Move the park and lake** — move `p`. The lake follows it.
- **Grow the town** — add rows or columns. The map does not have to be square;
  a 5×4 map works, and the road grid grows with it.
- **Thin out or crowd a block** — change its `buildings` count in the legend.
- **Reshape the streets** — `street.block`, `street.road`, `street.sidewalk`.
- **Reshuffle the details** — change `seed`. Same layout, different pick of
  house sizes, colours and tree kinds.

Everything else — how much of each kind of scenery there is, the lake radius,
where the mountain ring sits — is under `scenery`.

## Which buildings a zone admits

`src/data/buildings.json` decides that. Each building lists the zones it may
appear in and how common it is in each:

```json
"zones": { "apartments": 10, "houses": 1, "towers": 2 }
```

So an apartment block is the usual thing in an `a` block, turns up occasionally
among the houses, and sometimes fills a gap downtown. A new kind of building is
a new entry here plus a weight in whichever zones should have it — no new code.

## Pointing at a plot: markers

Every block is split into four plots, and each plot has a code you can read off
the ground in game:

```
B3C
││└─ plot: quarters of the block — A B along the north side, C D the south
│└── row: 1 at the north edge of the map, counting south
└─── column: A at the west edge of the map, counting east
```

`B3` is literally row 3, column B of the `rows` block in `city-map.json`, so a
code and the map agree by construction.

In game, press **M** (or the **◻︎ Lot grid** button) to draw the grid: yellow
outlines the blocks, cyan splits each one into its four plots, and a label
stands in the middle of each. The HUD shows the plot you are standing in, so
walking around is enough to find the code for a spot.

## Placing a specific thing: `src/data/placements.json`

The spawner honours this list before it fills anything else in, so a placement
never gets shuffled by the seed and adding one does not move the rest of town.

```json
[
  { "at": "B3A", "place": "apartment", "roof": "#b03a2e" },
  { "at": "C4B", "place": "skyscraper", "walls": "#7e8f9c", "roof": "#2f3338" },
  { "at": "A3D", "place": "playground",
    "with": [ { "place": "pine", "count": 7 }, { "place": "bush", "count": 1 } ] }
]
```

- `at` — the marker code.
- `place` — any building (`house`, `apartment`, `church`, `skyscraper`,
  `safehouse`), any tree (`pine`, `oak`, `birch`, `shrub`, `bush`) or any prop
  from `src/data/props.json`.
- `walls` / `roof` — optional colour overrides, any CSS colour.
- `with` — extra things scattered around the main one inside the same plot.

So "on lot B3A place a children playground with 7 trees and 1 bush" is one
entry, and the change is reviewable as a diff.

## Props: `src/data/props.json`

Street furniture and small scenery are described as primitives, not code:

```json
{ "id": "bench", "footprint": 1.1,
  "parts": [ { "shape": "box", "size": [1.9, 0.09, 0.55], "at": [0, 0.45, 0], "color": "#8a5a2b" } ] }
```

`shape` is `box`, `cylinder`, `cone` or `sphere`; `at` positions it in metres
with the origin at ground level, `turn` rotates it in degrees. Parts sharing a
colour merge into one mesh, so a prop costs a draw call per colour. A new asset
is a new entry here — no new code, and it is immediately placeable by name.

## Getting around while you work

The **🌍 Spin globe** button (or **G**) pulls the camera off the surface and
lets you drag the planet round like a desk globe, with a flick carrying on and
settling. Whatever ends up at the top is where you are standing, so switching
back drops you there. Everything else — walking, driving, NPCs, shooting —
stops while the globe view is up, so nothing moves under you.

## What is still not authored

The map fixes the plan; the seed fixes everything below it. Individual plots,
building sizes, colours, tree kinds, parked cars and mountains are all drawn
from the seeded generator rather than listed by hand. They never change between
runs, but they are not something you can point at in the map. When a *specific*
thing has to sit in a *specific* spot, that is what `placements.json` is for:
everything listed there is placed exactly, and the seeded filler works around
it.
