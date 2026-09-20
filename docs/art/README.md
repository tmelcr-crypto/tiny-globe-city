# Art direction

`mossbite-style-reference.png` is the target look for the game: chunky low-poly
models, saturated colours, soft rounded silhouettes, readable at small sizes.
Everything currently in `src/entities/` is a placeholder standing in for
something on that sheet — use it when replacing them with real assets.

Kept here rather than in `public/assets/` because Vite copies `public/` into
every build, and the game never loads this file.

## What the sheet covers, and what stands in for it today

| On the sheet | In the game now |
| --- | --- |
| Characters, outfits | `entities/player.js` — a capsule with a nose marker |
| Pets / companions | not implemented |
| Animations (idle, walk, run, jump, sit) | not implemented; nothing is rigged or animated |
| Vehicles: pickup, sports car, SUV, ATV | `entities/car.js` + `data/vehicles.json` — one boxy car |
| Car customization: body, wheels, accessories, colours | not implemented |
| Buildings: house, gas station, shop, garage, barn, watchtower | `entities/building.js` + `data/buildings.json` — house, church, apartment, skyscraper, safehouse |
| Props: trees, rocks, fences | `entities/tree.js` — four tree kinds; no rocks or fences |
| Environment tiles: road, dirt, grass, water, rock | `world/city-ground.js` — flat coloured surfaces on the globe |
| UI: minimap, coins, hearts, fuel, button bar | `ui/hud.js` — a single line of text |
| Map style | `world/city-plan.js` — the district and road layout |
| Time of day / weather: day, sunset, night, rain | not implemented; one fixed light and sky colour |

## The catalogue

`docs/catalog/asset-catalog.pdf` lists every asset the city could hold — 619 of
them, referenced against Prague — showing each one in this sheet's style beside
the placeholder the game uses today. Rebuild it with `npm run catalog`; see
`docs/catalog/README.md`.

## Notes for whoever builds the real assets

- One world unit is one metre and the player is 1.5 m (`entities/player.js`), so
  model everything to that scale.
- Every model's origin sits at its base, because the spawner places that origin
  directly on the globe surface. `tests/grounded.test.js` enforces it.
- Each model declares `userData.footprint`, the radius of ground it occupies.
  Spawn spacing and player collision are both sized from it.
- Buildings merge their parts into one geometry with material groups, so a
  building costs a single draw call. Keep replacements similarly cheap —
  the target is 60 fps on a mid-range Android phone.
