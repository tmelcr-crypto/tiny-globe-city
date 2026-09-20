# Tiny Globe City

Tiny GTA-like browser game on a small globe. The player stays fixed; the globe rotates underneath.

## Run
```
npm install
npm run dev
```

## Deploy
Push to `main`. In GitHub: Settings → Pages → Source: **GitHub Actions**.

## Playable demo
`public/play-demo.html` is a self-contained, single-file build of the current
globe-rolling mechanic (three.js loaded from a CDN, no build step) plus a coin-
collecting loop for a quick playtest. It ships to GitHub Pages at `/play-demo.html`
alongside the main app, and can also be opened directly from `dist/` after `npm run build`.

## Docs
See `CLAUDE.md` and `docs/`.
