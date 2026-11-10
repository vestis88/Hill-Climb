# Art style

Original flat cartoon style, drawn in code (no image files). Keep new art consistent with this.

- **Shapes**: simple and chunky, rounded corners, readable at phone size. Every object
  gets a dark outline (`OUTLINE`, about 0.05 m wide in world units).
- **Light**: comes from the upper left. Bodies use a soft top-to-bottom gradient (light,
  body colour, dark) plus a white shine; slopes in the background keep a band of shade on
  the side facing right. Headlights and crystals get a soft glow.
- **Depth**: three background layers (far mountains, mid hills, near hills with trees) with
  haze between them, then roadside props, the ground, the vehicle with a soft shadow,
  particles, weather, and the HUD on top.
- **Colours**: each environment's palette lives in `src/data/environments.ts`. Vehicles use
  `VEHICLE_COLOURS` in `art.ts`. Coins are bronze (5), silver (10) and gold (15+).
- **Driver**: "Pip", an original character: teal helmet with a white stripe, a visor
  showing two eyes, orange scarf, navy jacket and white gloves. Never copy characters, vehicles or tracks from existing games.
- **Text**: system font, heavy weight, white with a dark outline over the game.
- **Themes**: each environment's sky, layers, ground texture and props are defined in
  `THEMES` in `scenery.ts`.
