# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` globe, city (static streets/buildings from data), spawner (dynamic NPCs/cars/pickups)
- `entities/` player, car (modular parts + driving physics), npc, weapon
- `interiors/` enterable buildings
- `systems/` collision, vehicles (enter/exit + proximity), pickups, quests, activities, world events
- `data/` JSON content
- `ui/` HUD, touch controls, vehicle enter/exit prompt

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
