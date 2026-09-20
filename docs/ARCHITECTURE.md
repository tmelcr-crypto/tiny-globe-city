# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` globe, spawner, geo (lat/lon -> direction helper)
- `entities/` player, car, npc, weapon, savepoint
- `interiors/` enterable buildings
- `systems/` quests, activities, world events, savepoints (proximity), save (manual save/load)
- `data/` JSON content (quests, weapons, vehicles, savepoints)
- `ui/` HUD, touch controls, player creation, save prompt

Rule: player is fixed at the top of the globe; `worldPivot` rotates.

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
