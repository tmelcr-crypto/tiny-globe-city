# Architecture
- `core/` loop, input, camera, state, event bus
- `world/` the planet, in layers:
  - `planet.js` the radius everything is measured against
  - `city-map.js` reads `data/city-map.json`: blocks, zones, biomes, legend
  - `sphere-grid.js` the cubed sphere the planet is divided by
  - `grid.js` that grid, turned so the player's doorstep is the top of the globe
  - `chart.js` a flat map per face — a straight line on one is a great circle
  - `terrain.js` the height field (see `docs/TERRAIN.md`), and the carving
  - `streets.js` the street network, its profiles, bridges and tunnels
  - `biome.js` what kind of country a point is, mixed between blocks
  - `city-plan.js` ties them together and holds the player's own flat map
  - `city-ground.js` the road surfacing, pavements, bridges and bores
  - `globe.js` the land and sea meshes
  - `spawner.js` everything standing on the ground
  - `markers.js` lot codes (`B3A`, `E-B3A`) and the frames layouts are built in
- `entities/` player, car, npc, weapon, building, tree, prop
- `interiors/` enterable buildings
- `systems/` collision, combat, interaction, npc wander, dev free-float view
- `data/` JSON content: `city-map.json` (the whole planet), `terrain.json`
  (the shape of the land), `placements.json` (exact placements by lot marker),
  `buildings.json`, `props.json`, `vehicles.json` — see `docs/CITY.md`
- `ui/` HUD, touch controls, lot-grid overlay, dev buttons

Rule: player is fixed at the top of the globe; `worldPivot` rotates.
