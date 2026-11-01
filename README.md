# Bite & Bounce

One-button vampire runner for **Goedware Halloween Jam III** - theme *"It only comes out at night"*.
Phaser 4 + Vite, 100% web, mobile-friendly (landscape).

**Play:** https://squidhell.github.io/HalloweenJamIII/

## How to play
- **Tap / click / Space** = hop. **Hold** = jump higher. Hold on landing = higher bounce.
- The sun is rising: you burn in the light, you heal in the shade (dark columns).
- **Land on villagers** to bite them: refills blood, bounces you, chains combos in the air.
- Avoid the garlic. Collect blood orbs. Score = distance + bites x chain.

## Dev
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```
Add `?debug` to the URL to expose the scene as `window.__bb` in the console.

## Structure
- `src/art.js` - **all visuals live here** (placeholder squares/circles). Reskin later by editing the `create*()` functions + `COLORS`/`DIMS`, no gameplay change needed
- `src/scenes/Game.js` - gameplay (title, run, death, collisions, spawning)
- `src/fx.js` - particle pool - `src/audio.js` - procedural WebAudio sfx + music (no assets)
- `src/font.js` - loads the Waelek font from `public/fonts/` (falls back to a system font if missing)

## Font
Drop `waelek.ttf` (or `.otf` / `.woff2` / `.woff`) in `public/fonts/`. Source: https://www.fontspace.com/waelek-font-f145813 (free, non-commercial).

## Deploy
Every push to `main` runs `.github/workflows/deploy.yml` (build + GitHub Pages).
One-time setting: *Settings -> Pages -> Source: GitHub Actions*.
