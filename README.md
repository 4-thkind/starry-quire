# Spiral Notebook

A full-screen desktop notebook for Windows that looks and turns like a real spiral-bound notebook. Built with Electron. Made for revising from video playlists without juggling apps on a second monitor.

Grab a page by its corner and drag it over. The paper curls, the back of the sheet lifts above the rings, and the next page settles under the spiral. Pages never run out — fresh blank ones keep appearing as you write.

## Features

- **Real page turns.** Drag by the corner, two-finger swipe, or arrow keys. Powered by [StPageFlip](https://github.com/Nodlik/StPageFlip).
- **Spiral binding** that stays above resting pages and below the one being lifted, so turns look like paper.
- **Index spread** across both facing pages: every date and heading, click to jump.
- **Starry-Night page design** with crisp navy ruling.
- **Keyboard-only formatting**: `Ctrl+Shift+H` for headings (big on the first line, smaller elsewhere), `Ctrl+B/I/U`, `Ctrl+Shift+Y` to highlight, `Ctrl+Shift+X` strikethrough, `Ctrl+Shift+8`/`7` for bullet/numbered lists, Tab to indent. Type `->` `<-` `=>` `<->` and they become `→ ← ⇒ ↔`.
- **Autosave** to `%APPDATA%\spiral-notebook\notes.json` (atomic writes; a corrupt file is set aside, not overwritten).
- **Proper Windows installer** with a Start-menu entry, desktop shortcut, and a working uninstaller that removes your notes too.

Press `Ctrl+/` or click `?` inside the app for the full shortcut list.

## Run from source

```bash
npm install
npm start
```

## Build a Windows installer

```bash
npm run dist
```

Outputs `dist/SpiralNotebook-Setup.exe`. Building on Linux needs Wine for the NSIS step.

## Project layout

```
src/
  main.js         Electron main process (window, IPC, atomic save, corrupt-file guard)
  preload.js      contextBridge for the renderer
  index.html      Book shell + shortcut card
  style.css       Page design, cover, spiral layering
  renderer.js     Book model, formatting, shortcuts, blank-page growth
  vendor/
    page-flip.js  StPageFlip 2.0.7 bundle (MIT)
assets/
  cover.jpg       Cover art (garden + sky)
  page.jpg        Page background (swirls, sun, star) — baked-in lines removed
  icon.ico        App icon
```

## Notes storage

```json
{
  "YYYY-MM-DD": [
    { "id": "...", "heading": "", "body": "<h1>Topic</h1><div>...</div>" }
  ]
}
```

The heading box was removed in a later version — any pre-existing title in `heading` gets folded into the body as an `<h1>` on load, so old notes carry over.

## Credits

- Page-turn physics: [StPageFlip](https://github.com/Nodlik/StPageFlip) by Nodlik (MIT), bundled in `src/vendor/`.
- Everything else: me.

## Licence

MIT.
