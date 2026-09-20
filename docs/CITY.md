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
grid follows from the shape of the map — you never place a road by hand. Every
junction is rounded off by `street.corner` metres, so the kerb sweeps around
the corner rather than meeting at a right angle.

A block is one cell of the grid the whole planet is divided by (below), so its
size is not authored: `street.road` sets the road width, and what is left of
the cell is the block. On a 160 m globe cut four cells to a face that comes out
at a 62.8 m pitch with 53.8 m blocks.

## The grid the planet is divided by

Lines of latitude and longitude are not squares — they pinch to nothing at the
poles. So the planet is divided the way a cube is: six square faces, each cut
into the same N×N grid, then blown out onto the sphere (`src/world/sphere-grid.js`).

- Every cell is a four-sided near-square. Across the whole planet the sides are
  within 1.38 of each other and the areas within 1.20 — and you cannot do
  better than that, because a sphere cannot be tiled with exact squares.
- There is no pole anywhere. The only unusual points are the eight cube
  corners, where three cells meet instead of four.
- A cell edge is a great circle, so a street along one runs dead straight over
  the globe and comes back to where it started. On the flat map the town is
  planned on, that reads as a very slight bow — which is why streets are
  carried as polylines rather than ruled lines.

The town takes the top face, and the face is cut as finely as the map is long:
`N = max(rows, columns)`, so a 4×4 map fills its face exactly. The grid is then
turned so the player's spawn lands under them.

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
- **Reshape the streets** — `street.road`, `street.sidewalk`, `street.corner`.
  The block size follows from the grid, so it is not yours to set: cut the map
  into more rows and columns and every block gets smaller.
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

## Streets that leave the grid: avenues

A grid alone reads as a suburb. Prague's streets bend with the river and cut
across the blocks at whatever angle gets them where they are going, so the map
also carries avenues — streets that ignore the grid:

```json
"avenues": [
  { "id": "narodni", "width": 11,
    "through": [[0.35, 4.0], [1.3, 3.8], [2.2, 3.75], [3.1, 3.6], [4.0, 3.25]] }
]
```

`through` is a handful of points the street passes through, smoothed into a
curve. The points are in **grid coordinates**: the first number is the column
line counting from the west edge, the second the row line counting from the
north, and fractions land in between. So `[0, 0]` is the north-west corner of
the map, `[4, 4]` the south-east, and `[2.2, 3.75]` is three-quarters of the
way down the third row of blocks.

Ending an avenue on a whole number puts it on a grid road, which is what makes
it look like it joins the street network rather than stopping in a field.

An avenue takes precedence over whatever the blocks would have held: buildings
and trees keep clear of it, parked cars and pedestrians use its kerb, and
buildings beside it face it instead of the grid road behind them. Three of
them is enough to break the grid up; more is fine, they just eat buildable
land.

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

The grid does not stop at the town: it covers the planet, six faces of ninety-six
blocks and three hundred and eighty-four plots, so anywhere you can stand has a
code. The town is the top face and needs no prefix; the other five faces each
take a letter, which goes in front:

| Prefix | Face |
| --- | --- |
| *(none)* | the town, overhead |
| `N-` `E-` `S-` `W-` | the four faces around the sides, over each horizon |
| `B-` | the far side of the planet |

So `B3A` is in town and `E-B3A` is the same cell on the eastern face. Column
letters and row numbers restart on every face, which is why the prefix is part
of the code rather than a continuation of the town's numbering.

In game, press **M** (or the **◻︎ Lot grid** button) to draw it: bright yellow
outlines the town's face, olive the rest of the planet, cyan splits every block
into its four plots. Labelled pegs follow you from block to block rather than
standing on all three hundred plots at once, and the HUD shows the plot you are
in, so walking around is enough to find the code for a spot.

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
  `panelak`, `safehouse`), any tree (`pine`, `oak`, `birch`, `shrub`, `bush`),
  any prop from `src/data/props.json`, a `car`, or an NPC by id.
- `walls` / `roof` — optional colour overrides, any CSS colour.
- `with` — extra things scattered around the main one inside the same plot.
- `note` — a line for whoever reads the file next. Ignored by the game.

So "on lot B3A place a children playground with 7 trees and 1 bush" is one
entry, and the change is reviewable as a diff.

### Laying something out to the metre

Dropping a thing on a marker is enough for a building in a plot. A whole
estate needs more, so a placement can also say exactly where things go:

```json
{ "at": "S-B4A", "place": "panelak", "facing": "north",
  "offset": [-12.25, -49.5],
  "repeat": [{ "count": 4, "step": [9.5, 0] },
             { "count": 4, "step": [0, 33] }] }
```

- `offset` — `[east, north]` in metres from the marker.
- `facing` — `north`, `south`, `east` or `west`; the way the front looks.
- `repeat` — one step makes a row, two make a grid. This one is sixteen
  models: four blocks of flats, each built from four sections.

East and north are read off the grid **where the marker stands**, and the
whole layout is placed in that one frame — so a run of buildings stays
parallel and evenly spaced even where it crosses onto the next face of the
grid, which is where compass directions would otherwise turn a corner.

Companions take the same three fields, so the parking courts between those
blocks, the cars in their bays, the lamps and the bins are each one line.

## The estate on the far side: S-B4A

`S-B4A` holds Sídliště Jižní, which is what the layout fields are for:

- four long panelák blocks running parallel to the estate lane, each one a row
  of four sections — the way they were really built, and the way a straight
  block follows the curve of a small planet;
- a parking court between each pair of blocks, bays at right angles to a lane
  **2.16 m** wide, which is 1.2 times the width of a car. That is as the brief
  asked; it is about a third of what a car needs to turn into a bay, so treat
  it as a look rather than a working geometry;
- the courts fed by one lane up the west end, with cars nose-in to the bays;
- and the rest of what makes an estate: beating frames, washing lines,
  dumpsters, bike racks, a notice board by each door, a playground, a kiosk, a
  stop on the lane, and four residents walking about.

It runs about 130 m by 60 m, so it spills over the plots around `S-B4A` — a
placement is anchored to a marker, not fenced in by it.

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

A prop with `"footprint": 0` is a surface rather than an obstacle — the
parking courts and the estate lane are things you drive on, so nothing spaces
itself off them and nothing collides with them.

## Getting around while you work

The **🌍 Spin globe** button (or **G**) pulls the camera off the surface and
lets you drag the planet round like a desk globe, with a flick carrying on and
settling. Pinch to zoom — two fingers apart to come in close enough to read a
street, together to pull back and see the whole planet; a mouse wheel does the
same. Dragging turns the globe by what is on screen, so close in it turns
less. Whatever ends up at the top is where you are standing, so switching back
drops you there. Everything else — walking, driving, NPCs, shooting — stops
while the globe view is up, so nothing moves under you.

## What is still not authored

The map fixes the plan; the seed fixes everything below it. Individual plots,
building sizes, colours, tree kinds, parked cars and mountains are all drawn
from the seeded generator rather than listed by hand. They never change between
runs, but they are not something you can point at in the map. When a *specific*
thing has to sit in a *specific* spot, that is what `placements.json` is for:
everything listed there is placed exactly, and the seeded filler works around
it.
