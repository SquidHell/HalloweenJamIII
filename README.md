# Bite & Bounce

One-button vampire runner for **Goedware Halloween Jam III** - theme *"It only comes out at night"*.
Phaser 4 + Vite, 100% web, mobile-friendly (landscape).

**Play:** https://squidhell.github.io/HalloweenJamIII/

## How to play
**The loop = a night/day cycle you read at a glance** (phase name + timer bar at the top, moon/sun in the sky, sky color).
- **NIGHT - you come out.** No sun. Villagers fill the street: **land on them** to bite, refill blood and bounce. Chain bites in the air for big combos. Avoid the garlic.
- **DAWN (3.5 s warning).** The sky turns orange, a countdown shows, blue shadow platforms scroll in.
- **DAY - hide.** The sun burns you everywhere except **standing on a blue shadow platform** (it also heals you). Hop from platform to platform. Villagers are indoors.
- Survive the day = bonus, then the next night starts. Each cycle is harder (shorter nights, longer days, smaller platforms, hotter sun).
- **Controls:** tap / click / Space = hop. **Hold** = jump higher. Hold on landing = higher bounce.

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
- `src/cycle.js` - night/day schedule and difficulty curve (durations per cycle)
- `src/fx.js` - particle pool - `src/audio.js` - procedural WebAudio sfx + music (no assets)
- `src/font.js` - loads the Waelek font from `public/fonts/` (falls back to a system font if missing)

## Font
Drop `waelek.ttf` (or `.otf` / `.woff2` / `.woff`) in `public/fonts/`. Source: https://www.fontspace.com/waelek-font-f145813 (free, non-commercial).

## Deploy
Every push to `main` runs `.github/workflows/deploy.yml` (build + GitHub Pages).
One-time setting: *Settings -> Pages -> Source: GitHub Actions*.
