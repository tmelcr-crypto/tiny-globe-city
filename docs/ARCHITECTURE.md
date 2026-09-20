# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` globe, city (static streets/buildings from data), spawner (dynamic NPCs/cars/pickups), houses (standalone enterable buildings), geo (lat/lon -> direction helper)
- `entities/` player, car (modular parts + driving physics), npc, weapon, savepoint
- `interiors/` enterable buildings (2D platformer interior, canvas-rendered)
- `systems/` collision, vehicles (enter/exit + proximity), pickups, savepoints (proximity), save (manual save/load), house-entry (proximity), quests, activities, world events
- `data/` JSON content (quests, weapons, vehicles, buildings, trees, world districts, savepoints, houses, interiors)
- `ui/` HUD, touch controls, vehicle enter/exit prompt, player creation, save prompt, house enter prompt, loading screen

Rule: player is fixed at the top of the globe; `worldPivot` rotates.

## World layout
Districts are hand-authored in `src/data/world.json` (lat/lon center + a
street grid: block count, block size, street width, building height/footprint
ranges, density). `src/world/city.js` reads that data and, per district:
1. Converts lat/lon to a direction vector, builds an east/north tangent
   basis at that point on the sphere.
2. Lays out a flat block/street grid in that local tangent plane.
3. Projects each block/road point onto the sphere surface (normalize +
   scale by radius) and orients it to the local surface normal.

Buildings and roads are each a single `THREE.InstancedMesh` per district
(one draw call each) — required to hit the 60fps/mobile target with dozens
of buildings per district. Add a district by adding an entry to
`world.json`; no code changes needed for a new district.

## Player creation
`ui/player-creation.js` shows a name-entry overlay before the game loop starts
running (see `main.js`). The name is stored in `core/state.js` (`state.player.name`).

## Saving
Progress is saved manually, not automatically. `entities/savepoint.js` places a
beacon mesh (a child of `worldPivot`) at a lat/lon from `data/savepoints.json`.
`systems/savepoints.js` checks each frame whether a savepoint has rotated under
the fixed player and emits `savepoint:change`; interacting (on-screen button or
the `E` key) emits `save:requested`, handled by `systems/save.js`, which
persists `{ player, money, health }` to `localStorage`.

## Enterable buildings
`world/houses.js` scatters standalone houses (each with a door mesh) across
the globe, distinct from the district buildings in `world/city.js` (which
are static InstancedMesh street-grid geometry with no interiors).
`systems/house-entry.js` checks each frame whether a door has rotated under
the fixed player and emits `house:near`/`house:far`; `ui/enter-prompt.js`
shows an Enter button, which emits `house:enter-request`. `main.js` shows
`ui/loading-screen.js` for a beat, then hands off to
`interiors/interior.js`, a 2D canvas platformer (defined per-house in
`data/interiors.json`) that takes over input and rendering until the player
reaches the exit and requests `interior:exit-request`.
