# The city map

The planet is authored, not generated fresh each run. `src/data/city-map.json`
describes it, `src/world/city-map.js` reads it, `src/world/grid.js`,
`src/world/chart.js` and `src/world/streets.js` turn it into coordinates and
streets, and `src/world/spawner.js` builds it. Same map in, same world out,
every time.

This file is how we talk about layout changes: describe the change as an edit to
the map, and it is unambiguous.

## The map

The planet is divided like a cube — six square faces (see below) — and the map
has a block of rows for each one:

```
"faces": {
  "T": { "name": "Vice Bay — the city",
         "rows": ["P D D C", "O R A C", "R @ A D", "O C C A"] },
  "N": { "name": "Ocean Drive — the beach",
         "rows": ["H H C H", "B H H B", "B B M B", ". B B ."] },
  ...
}
```

One character per block. **Row 0 is the north edge of that face, column 0 its
west edge.** The player faces south, so they look *down* the map from wherever
`@` is, and `@` appears exactly once on the whole planet.

Every face is cut into the same square grid — four by four here — because they
are all faces of one cube. The six of them are `T` (the top, where the town is),
`N`, `E`, `S` and `W` around the sides, and `B` for the far side.

Streets run between blocks that are built up, with pavements either side, so the
street grid follows from the shape of the map — you never place a road by hand.
Open country gets no grid: a forest is crossed by the road that passes through
it and nothing more. Every junction is rounded off by `street.corner` metres, so
the kerb sweeps round the corner rather than meeting at a right angle.

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

Every face carries its own block of rows, so the whole planet is mapped: the
town on the top face, and beaches, suburbs, docks, desert and forest on the
other five. The grid is turned so the player's spawn lands under them.

## Legend

Each character is one entry in `legend`, and the entry says everything about
that kind of block:

```json
"V": { "zone": "village", "biome": "meadow", "buildings": 5, "streets": true,
       "trees": 9, "props": { "haystack": 2, "well": 1, "fence_rail": 4 } }
```

| Field | What it does |
| --- | --- |
| `zone` | which buildings may go there (`buildings.json` decides, below) |
| `biome` | what kind of country it is: `city`, `beach`, `desert`, `forest`, `meadow` |
| `buildings` | how many buildings go in the block — density is authored |
| `streets` | whether the street grid runs along this block's edges |
| `trees` | how many trees, and `treeKinds` which sort if it is fussy |
| `props` | the dressing: how many of each prop from `props.json` |
| `spawn` | the one block the player starts in (`@`) |
| `lake` | the block the park lake sits in |

The vocabulary as it stands:

| Char | Zone | Biome | What it is |
| --- | --- | --- | --- |
| `@` | residential | city | where the player starts; also holds the safehouse |
| `D` | downtown | city | towers, offices, glass |
| `C` | commercial | city | shop rows, offices, the odd tower |
| `A` | apartments | city | slab blocks and their yards |
| `R` | residential | city | houses and gardens |
| `O` | oldtown | city | church, shop rows, statues and a fountain |
| `H` | resort | beach | Ocean Drive: deco hotels, palms, parasols |
| `B` | beach | beach | sand, palms, deckchairs, huts — no buildings |
| `M` | port | city | wharf: containers, crates, bollards |
| `I` | industrial | city | warehouses and yards |
| `V` | village | meadow | cottages, a well, hay |
| `F` | farm | meadow | barns, hay and fence rails, no street grid |
| `W` | forest | forest | pine, oak and birch, nothing built |
| `L` | logging | forest | a few cabins and timber among the pines |
| `X` | desert | desert | dunes, cactus, rock |
| `Y` | oasis | desert | a motel and a villa where there is water |
| `P` | park | city | lawn with the lake in it |
| `G` | park | meadow | green space out of town |
| `.` | wild | meadow | nothing built, nothing planned |

## Making a change

Most layout changes are one character.

- **Move downtown** — put the `D`s where you want them. They are the tall ones,
  so keep them off the block the player starts in.
- **Move the player** — move `@`. The grid re-centres on it, so the player
  always starts on the grass verge just inside that block's north-east corner.
- **Move the park and lake** — move `P`. The lake follows it.
- **Turn country into town** — change a `W` or `.` into a zone with
  `"streets": true`, and the grid grows into it.
- **Thin out or crowd a block** — change its `buildings`, `trees` or `props`.
- **Reshape the streets** — `street.road`, `street.sidewalk`, `street.corner`.
  The block size follows from the grid, so it is not yours to set: cut every
  face into more rows and columns and every block gets smaller.
- **Reshuffle the details** — change `seed`. Same layout, different pick of
  house sizes, colours and tree kinds.

Every face has to stay the same square: four rows of four here, on all six.
The reader checks it and says so if they do not match.

Everything else — how much of each kind of scenery there is, the lake radius,
where the rock ring sits — is under `scenery`.

## Which buildings a zone admits

`src/data/buildings.json` decides that. Each building lists the zones it may
appear in and how common it is in each:

```json
"zones": { "apartments": 10, "residential": 2, "commercial": 3 }
```

So an apartment block is the usual thing in an `A` block, turns up occasionally
among the houses, and sometimes fills a gap on a commercial street. A new kind of building is
a new entry here plus a weight in whichever zones should have it — no new code.

## Streets that leave the grid: avenues

A grid alone reads as a suburb. Real streets bend with the coast and cut across
the blocks at whatever angle gets them where they are going, so each face of the
map also carries avenues — streets that ignore the grid:

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
it look like it joins the street network rather than stopping in a field. An
avenue is the only street a block with `"streets": false` gets, so it is also
how a road is carried out through the forest or across the desert.

An avenue takes precedence over whatever the blocks would have held: buildings
and trees keep clear of it, parked cars and pedestrians use its kerb, and
buildings beside it face it instead of the grid road behind them. Three of
them is enough to break the grid up; more is fine, they just eat buildable
land.

## How the streets meet the land

The planet has hills, valleys and a sea, and the streets are laid *into* them
rather than draped over them (`src/world/streets.js`, and `docs/TERRAIN.md` for
the land itself). Each street is given a profile — the height it sits at, all
the way along:

1. the bare ground under it, averaged over a dozen samples either side, so it
   ignores every bump;
2. held to a gradient no steeper than `MAX_GRADE` (8.5 in 100), which is what
   makes it cut through a rise and bank up over a hollow;
3. agreed with every street it crosses, tapered away either side so the crossing
   is a bend rather than a step — including crossings with a street laid on the
   next face along;
4. re-graded, agreed again, and so on until the two stop arguing.

Then each stretch is classified: road where the earth can carry it, **bridge**
where the road would stand clear of the ground, **tunnel** where the ground
would stand over the road. The land is carved to the roads, the structures are
built, and the classification is settled once more against the carved land,
because a hill the street next door cut away is no longer worth tunnelling.

`tests/drive.test.js` drives the whole network afterwards and checks the ride:
that there is ground under the wheels everywhere, that nothing climbs faster
than the gradient limit, that the road does not kink, that the carriageway is
clear, and that bridges stay over the land and tunnels under it.

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
