# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` globe, spawner
- `entities/` player, car, npc, weapon
- `interiors/` enterable buildings
- `systems/` quests, activities, world events
- `data/` JSON content, including `city-map.json` — the town layout (see `docs/CITY.md`)
- `ui/` HUD, touch controls

Rule: player is fixed at the top of the globe; `worldPivot` rotates.
