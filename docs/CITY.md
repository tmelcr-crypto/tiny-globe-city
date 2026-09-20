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

## What is still not authored

The map fixes the plan; the seed fixes everything below it. Individual plots,
building sizes, colours, tree kinds, parked cars and mountains are all drawn
from the seeded generator rather than listed by hand. They never change between
runs, but they are not something you can point at in the map. If a *specific*
building needs to sit in a *specific* spot, that is the next thing to add —
an explicit list of placements the spawner honours before it fills the rest.
