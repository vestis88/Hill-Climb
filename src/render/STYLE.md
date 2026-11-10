# Art style

Original flat cartoon style, drawn in code (no image files). Keep new art consistent with this.

- **Shapes**: simple and chunky, rounded corners, readable at phone size. Every object
  gets a dark outline (`OUTLINE`, about 0.05 m wide in world units).
- **Light**: one flat highlight on the top or upper-left of each shape; no gradients
  except the sky and the ground fill.
- **Colours**: each environment's palette lives in `src/data/environments.ts`. Vehicles use
  `VEHICLE_COLOURS` in `art.ts`. Coins are bronze (5), silver (10) and gold (15+).
- **Driver**: "Pip", an original character: teal helmet with a white visor stripe, orange
  scarf, navy jacket. Never copy characters, vehicles or tracks from existing games.
- **Depth**: two parallax layers behind the track (far and near), the track, then
  vehicle, then particles, then HUD.
- **Text**: system font, heavy weight, white with a dark outline over the game.
