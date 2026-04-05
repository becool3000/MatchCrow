Editable sprite PNGs for MatchCrow live in this folder.

Files currently used by the game:
- `tile-key.png`
- `tile-coin.png`
- `tile-ring.png`
- `tile-button.png`
- `tile-trinket.png`
- `crow-idle-a.png`
- `crow-idle-b.png`
- `crow-fly.png`
- `fx-feather.png`
- `fx-sparkle.png`

Enemy sprite files live in `enemies/` and the filename matches the enemy id exactly:
- `enemies/mite.png`
- `enemies/midge.png`
- `enemies/hornet.png`
- `enemies/wasp.png`
- `enemies/grasshopper.png`
- `enemies/frog.png`
- `enemies/bumble-bee-queen.png`
- `enemies/ai-ant.png`
- `enemies/dark-crow.png`

Planned unlock tile placeholder sprites staged here, but not yet loaded by Phaser:
- `tile-gem.png`
- `tile-thimble.png`
- `tile-medal.png`
- `tile-berry.png`
- `tile-pin.png`
- `tile-star.png`
- `tile-shell.png`
- `tile-compass.png`
- `tile-acorn.png`
- `tile-hourglass.png`

Keep the filenames the same when editing so Phaser can keep loading them.
Enemy textures are loaded from `public/sprites/enemies/<enemy-id>.png`, so you can swap them one at a time without touching the game code.
If you want to regenerate the original defaults from the current code patterns, run:

`npm run export:sprites`
