Enemy sprite replacements live in this folder.

Replace one PNG at a time and keep the filename exactly the same as the enemy id:

- `mite.png`
- `midge.png`
- `hornet.png`
- `wasp.png`
- `grasshopper.png`
- `frog.png`
- `bumble-bee-queen.png`
- `ai-ant.png`
- `dark-crow.png`

The game loads these files from `public/sprites/enemies/<enemy-id>.png`, so updates are picked up without changing code.
