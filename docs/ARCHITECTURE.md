# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` globe, spawner, city plan, lot markers (the grid covers the planet)
- `entities/` player, car, npc, weapon
- `interiors/` enterable buildings
- `systems/` quests, activities, world events, dev free-float globe view
- `data/` JSON content: `city-map.json` (town layout), `placements.json` (exact
  placements by lot marker), `props.json` (street furniture) — see `docs/CITY.md`
- `ui/` HUD, touch controls, lot-grid overlay, dev buttons

Rule: player is fixed at the top of the globe; `worldPivot` rotates.
