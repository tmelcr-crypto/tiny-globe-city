# Asset catalogue

`asset-catalog.pdf` is the list of everything the city could contain: 619
assets in 16 categories, each with a reference note from Prague, a size in
metres, and two renders — how it should look in the reference style, and the
placeholder standing in for it today.

## Regenerating it

```
npm run catalog
```

That starts the dev server, opens `scripts/catalog/page.html` in headless
Chromium, renders every asset twice and prints the PDF. Run it whenever
`src/data/catalog.json`, the props, or any of the game's models change — the
catalogue is generated, never edited by hand.

It needs Playwright and a Chromium build; the script looks for Chromium at
`/opt/pw-browsers/chromium` or wherever `CHROMIUM_PATH` points.

## Where the list came from

Prague, as a reference city: its districts, its street furniture, its trams
and its building types. It was compiled from knowledge of the city, **not**
from a live Google Street View session — nothing here was sampled from
imagery at build time. Each entry's note is a description to check against a
real street view before anyone models it.

## Adding to it

Add an entry to the right category in `src/data/catalog.json`:

```json
["tra_tram_flag", "Tram stop flag", "sign", [0.6, 3.2, 0.08], ["#c8442e", "#efeade"],
 "Red-and-white stop sign on its own pole"]
```

The fields are listed at the top of that file: `id`, `name`, `archetype`,
`size`, `colors`, `prague`. The archetype picks the stand-in shape — the list
is in `scripts/catalog/archetypes.js`, and a new one is a new entry there.

When an asset gets a real model in the game, add it to the `built` map:

```json
"built": { "tra_tram_shelter": "prop:tram_stop" }
```

The catalogue then renders that actual model in the placeholder column instead
of a stand-in, so the page always shows what the game really has. Prefixes are
`prop:`, `building:`, `tree:`, `vehicle:` and `npc:`.
