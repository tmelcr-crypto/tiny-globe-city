# CLAUDE.md

## Project
Tiny GTA-like game on a large globe. Vanilla JS (ES modules) + three.js + Vite. Mobile Chrome first.

## Core rule (do not break)
The player NEVER moves. All world objects are children of `worldPivot`.
Movement = rotating `worldPivot` under the player (see `src/core/camera.js`, `src/world/globe.js`).

## Commands
- `npm run dev` – dev server
- `npm run build` – production build to `dist/`
- `npm test` – vitest
- `npm run catalog` – rebuild `docs/catalog/asset-catalog.pdf`

## Conventions
- One entity/system per file, ES modules, no globals.
- Content lives in `src/data/*.json` (quests, weapons, vehicles).
- Systems communicate via `src/core/events.js`, not direct imports.
- Performance: target 60 fps on mid-range Android. Use instancing, low-poly, no per-frame allocations.

## Before structural changes
Read `docs/ARCHITECTURE.md`. Keep `docs/ROADMAP.md` up to date after each milestone.
