# Build plan

An original 2D physics hill-climb driving game for iPhone and iPad. Same genre and
handling feel as the classic two-pedal hill climbers; original name, driver,
vehicles, tracks, art and audio. No ads, no purchases: everything is earned by playing.

Working title: **Ridgeline** (placeholder, change freely).

Priority order for every trade-off: **1. mechanics and physics, 2. upgrades,
3. graphics, 4. everything else.**

## 1. Platform and stack

| Choice | Decision | Why |
|---|---|---|
| Delivery | Web app, installable to the home screen (PWA) | Runs on iPhone and iPad with no App Store or Mac needed; can be wrapped with Capacitor later for a store build without code changes |
| Language / build | TypeScript, Vite | Fast, testable headlessly |
| Physics | planck.js (Box2D port) | Wheel joints with spring/damper are what gives this genre its feel |
| Rendering | Canvas 2D, all art drawn in code or SVG | No asset pipeline; crisp on every screen size |
| Tests | Vitest for simulation, Playwright for smoke tests | Physics runs with no browser, so agents can verify handling numerically |

### iPhone / iPad requirements (apply to every task)

- Landscape only. Safari cannot lock orientation, so show a "rotate your device" overlay in portrait.
- Layout must work from iPhone SE (667x375 pt) to iPad Pro 13"; respect `env(safe-area-inset-*)` for the notch and home bar.
- Physics at a fixed 60 Hz step with render interpolation, so 120 Hz iPads and 60 Hz phones behave identically.
- Multi-touch pedals: brake on the left half, gas on the right half; both may be held at once. Disable page scroll, pinch zoom, double-tap zoom, long-press callout and text selection.
- Audio starts only after the first touch (Safari rule). There is no vibration API on iOS; do not rely on haptics.
- Cap canvas resolution at devicePixelRatio 2. Target a steady 60 fps on an iPhone 11.
- Saves in `localStorage`, versioned, with migration.
- Keyboard (arrow keys) also works, for desktop testing.

## 2. Architecture contract

Simulation is strictly separated from rendering and UI. Nothing under `src/sim`
may touch the DOM, canvas, time, or `Math.random` (use the seeded RNG).

```
src/
  sim/        deterministic game simulation (no DOM)
    world.ts        fixed-step loop, owns the planck world
    vehicle.ts      builds a vehicle rig from a VehicleSpec
    driver.ts       ragdoll driver, crash detection
    terrain.ts      height function -> chunked chain shapes
    run.ts          fuel, coins, distance, stunts, run end
    rng.ts          seeded RNG
  data/       pure data, no logic
    vehicles.ts     VehicleSpec per vehicle
    upgrades.ts     upgrade curves and costs
    tracks.ts       TrackSpec per environment
  render/     reads sim state, draws it
  ui/         menus, HUD, garage
  audio/
  save/
  input/
```

Key types (the source of truth is `src/sim/types.ts`; later tasks may add fields, never rename):

```ts
interface Input { gas: boolean; brake: boolean }

interface VehicleSpec {
  id: string
  chassis: { polygon: Vec2[]; mass: number; centerOfMass: Vec2 }
  wheels: { anchor: Vec2; radius: number; mass: number; friction: number;
            springHz: number; damping: number; driven: boolean }[]
  engine: { maxTorque: number; torqueFalloff: number; maxWheelSpeed: number;
            brakeTorque: number; reverseWheelSpeed: number; idleDragTorque: number }
  airControl: { spinRate: number; spinResponse: number; groundTorque: number }
  // added by later tasks: fuel (P5), driverSeat (P3)
}

interface SimState {            // what render and UI read each frame
  chassis: Pose; wheels: Pose[]; driver: DriverPose
  speed: number; rpm: number; fuel: number; distance: number
  coins: number; airborne: boolean; status: 'running' | 'crashed' | 'outOfFuel'
  events: SimEvent[]            // coin, fuelPickup, flip, airTime, land, crash
}
```

Upgrades never contain logic: `applyUpgrades(baseSpec, levels) => VehicleSpec`.
That keeps priority 2 (upgrades) a pure function of priority 1 (physics).

## 3. Handling model (the part that must feel right)

**Read the "How the game works" section of README.md first.** It is the
source of truth for the run rules, coins, upgrades and the progression
principle: every vehicle's base values are its worst; upgrades move each value
towards a tuned fully upgraded value. When tuning, always say which end
(base or fully upgraded) a change is for.


- **Rig:** chassis body + wheels on wheel joints (spring + damper along the suspension axis, motor on the hub).
- **Gas on the ground:** motor drives the driven wheels; reaction torque lifts the nose, so hard throttle causes wheelies and can flip the car backwards.
- **Brake on the ground:** brakes the wheels, then reverses; pitches the nose down.
- **In the air:** gas rotates the car nose-up, brake rotates it nose-down. The spin snaps to a fixed rate almost at once and holds it, rather than building up while the pedal is held (owner playtest 1). Releasing the pedal keeps the current spin. This is the core skill of the genre.
- **Suspension:** soft and long-travel, visibly squashing on landings; weight shifts under acceleration and braking.
- **Driver:** a jointed head and torso riding on the chassis. The run ends when the head hits terrain.
- **Fuel and coins:** as described in README "The run".
- **Terrain:** continuous height function per environment (layered noise, amplitude and roughness ramp up with distance), plus per-environment gravity and surface friction.
- **Camera:** follows the car, looks ahead in the direction of travel, zooms out with speed and height.

All numbers live in `data/` and are live-editable in the tuning sandbox (P2).

### Reference notes on genre feel

Public guides and reviews describe the feel only in qualitative terms; there
are no published physics numbers. What they agree on, and what P6 tunes towards:

- Momentum matters more than top speed: carrying speed over a crest beats flooring it up the face.
- Holding full gas up a hill flips the car backwards; players feather the pedal and use brake to drop the nose.
- Landing flat on both wheels keeps speed; landing nose- or tail-first costs it.
- Engine upgrades add power for steep climbs; grip puts that power down; suspension adds stability and landing absorption; all-wheel drive balances the car and reduces tipping. Power upgraded far beyond grip is wasted as wheelspin.
- The launch should be punchy with a light nose, settling as speed builds (implemented as drive torque that fades towards top speed).

Lesson from P1: the launch wheelie was on a knife-edge and flipped the car
depending on which frame the pedal went down. Handling tests must sweep input
timing, not check a single scripted run.

## 4. Tasks

Tier: **S** = strong model, done in sequence, sets the feel. **C** = cheaper
agent, can run in parallel once its dependencies are merged. Each task owns the
listed files and should not edit others except to wire itself in.

### Phase 1: physics core (sequential, tier S)

| ID | Task | Owns | Done when |
|---|---|---|---|
| P1 (done) | Project scaffold, fixed-step world, one vehicle on flat and sloped test terrain, keyboard + touch input, debug renderer | `sim/world.ts`, `sim/vehicle.ts`, `input/`, build config | Car drives, wheelies under full gas, pitches in the air; sim tests pass; loads on an iPhone in landscape |
| P2 (done) | Tuning sandbox: on-screen sliders for every `VehicleSpec` field, save/load presets as JSON | `ui/sandbox/` | Any handling value can be changed while driving and exported |
| P3 (done: `sim/driver.ts`; sway is visual only so handling is unchanged, ragdoll takes over on a crash) | Driver ragdoll and crash detection | `sim/driver.ts` | Landing on the roof ends the run; a hard but upright landing does not |
| P4 (done: `sim/terrain.ts`, chunks of 64 m streamed around the car) | Procedural terrain with chunk streaming and difficulty ramp | `sim/terrain.ts` | Endless drive at 60 fps; identical terrain for the same seed |
| P5 (done; numbers in `sim/run.ts` RULES) | Run rules: fuel, canisters, coins, distance, stunt detection, run end and payout | `sim/run.ts` | Scripted-input tests verify fuel-out, flip counting, payouts |
| P6 | Handling pass on the first vehicle using the sandbox: tune the **base** (worst) values and the **fully upgraded** values, plus numeric regression tests for both ends (0-to-top-speed time, wheelie onset, air rotation rate, max climbable slope). The sandbox needs a switch between base and fully upgraded | `data/vehicles.ts`, `tests/handling/` | **Owner playtest approves both ends.** Nothing in later phases starts before this |

### Phase 2: upgrades and content (parallel, tier C unless noted)

| ID | Task | Depends | Done when |
|---|---|---|---|
| U1 (done: `data/upgrades.ts`, tests in `tests/upgrades.test.ts`) | Upgrade system as specified in README "Upgrades": engine, tyres, suspension, drivetrain; 10 levels each; no fuel upgrade; `applyUpgrades(base, max, levels)` interpolates each physics value; cost curve | P6 | Each level produces a measurable change in the P6 handling metrics; tests assert monotonic improvement and that level 1 equals the base car |
| U2 (done: `npm run economy`) | Economy balance: payouts vs upgrade costs so a new upgrade is affordable every 2 to 4 runs early, slowing later | U1, P5 | Simulated-progression script prints a sane curve |
| U3 (done: `save/save.ts`) | Save system: coins, owned vehicles, upgrade levels, best distances; versioned | P5 | Survives reload; migration test passes |
| V1 (done: Scrambler) | Vehicle 2: light two-wheeler (agile, easy to flip, rider leans) (**S**, new rig shape) | P6 | Own handling tests; distinctly different feel |
| V2 (done: Hauler) | Vehicle 3: heavy 4x4 truck (slow, stable, climbs anything) | P6 | Same |
| T1 (done: Crater Fields) | Environment 2: low-gravity, long floaty jumps | P4 | Own `TrackSpec`, playable end to end |
| T2 (done: Frost Pass) | Environment 3: slippery, steep, rough | P4 | Same |
| T3 (done: prices in `data/vehicles.ts` and `data/environments.ts`) | Vehicle and environment unlock prices and the order they open | U2 | Wired into save and economy |

### Phase 3: graphics (parallel, tier C)

One agent first writes `render/STYLE.md` (palette, line weights, shape language)
so the rest stay consistent. All art is original.

| ID | Task | Depends |
|---|---|---|
| G1 (done) | Style guide and renderer structure (layers, camera, interpolation) | P6 |
| G2 (done) | Vehicle art for all three vehicles, with suspension and wheel animation | G1, V1, V2 |
| G3 (done) | Original driver character, ragdoll-driven, with crash reaction | G1, P3 |
| G4 (done) | Terrain rendering (ground fill, surface strip, props) and parallax backgrounds per environment | G1, T1, T2 |
| G5 (done) | Particles: dust, exhaust, landing puffs, coin sparkle | G1 |
| G6 (done) | HUD: fuel gauge, distance, coins, rpm/boost dials, pedals, stunt pop-ups | G1, P5 |
| G7 (done) | Menus: title, garage with upgrade cards, vehicle and environment select, results screen | G1, U1, U3 |

### Phase 4: misc (parallel, tier C)

| ID | Task |
|---|---|
| M1 (done) | Audio: synthesised engine sound pitched by rpm, tyre, impact, coin, UI; music optional. Unlock on first touch |
| M2 (done) | PWA: manifest, icons, offline service worker, full-screen home-screen launch, rotate overlay, safe areas |
| M3 (done) | Settings: volume, pedal size and side swap, reset save |
| M4 (done: steady 60 fps at 1x resolution with a 4x CPU slowdown; automatic resolution drop if frames run slow) | Performance pass on a real iPhone: chunk culling, particle caps, canvas resolution |
| M5 (done) | Deployment to GitHub Pages: every push to `main` runs the checks and publishes the build |

### Phase 5: graphics pass 2 (planned, not started)

Owner feedback: the graphics need overall improvement, after gameplay, upgrades and sound
are settled. All art stays original and drawn in code (see `src/render/STYLE.md`); keep the
frame-time budget (60 fps on an iPhone 11, automatic resolution drop as the safety net).

| ID | Task | Notes |
|---|---|---|
| G8 (done) | Vehicles v2 | More detail and depth per vehicle: panel shading, visible suspension arms that compress, wheel motion blur at speed, mud or snow on tyres per environment, small bounce of loose parts |
| G9 (done) | Pip v2 | Animated arms and legs (hands on the wheel or bars, leaning into the gas), facial expressions (grin on flips, worried when tipping), full ragdoll with limbs on a crash |
| G10 (done) | Terrain v2 | Smoother ground curves, layered grass that sways, surface details (puddles, roots, rock bands, ice sheen), occasional bridges or logs on jumps |
| G11 (done) | Backgrounds v2 | A time-of-day mood per environment (sunny morning, starry night, snowy dusk), a foreground layer that passes in front of the track, animated life (birds, windmills, shooting stars, aurora) |
| G12 (done) | Effects | Speed lines at top speed, dust trails, landing shockwaves, coins that fly to the counter, counter pop, soft vignette and glow on lights |
| G13 (done) | Menus v2 | Garage with the selected vehicle idling and bouncing on a stage, purchase animation, icons for each upgrade, results screen that counts coins up, a custom rounded display font |
| G14 | Graphics check | Screenshot pass on iPhone SE, iPhone 16 Pro Max and iPad sizes; frame-time check with the 4x CPU slowdown |

## 5. Next steps after the first version

Not part of the first version; pick up once phases 1 to 4 are done.

- Timed race mode on fixed-seed tracks with a finish line, racing your own best ghost (recorded inputs replayed deterministically).
- More vehicles and environments beyond the first three of each.
- Daily challenge: a date-seeded track with a personal best.
- Vehicle tuning parts or perks as a second upgrade layer.
- App Store build via a Capacitor wrapper.

## 6. How to run these tasks in the Claude app

Everything here runs inside the Claude app on the subscription; nothing needs
an API key or paid service.

- This file is the task list. Start one new session per task with a message like
  "Do task U1 from PLAN.md", so each session starts small and cheap.
- Use the model picker: the strongest model for tier S tasks, a cheaper model
  (Sonnet, or Haiku for the simplest) for tier C tasks.
- Run one task at a time unless two tasks own different files; mark a task
  "(done)" in the tables when it is merged.
- Hosting on GitHub Pages is free for public repositories.

## 7. Rules for agents

- One task per branch and pull request; touch only the files the task owns.
- Merging: the owner has authorised merging your own pull requests into `main` without asking, once `npm run check` passes and the pull request has no conflicts or unanswered review comments. Merging publishes the game, so confirm the deploy run succeeds afterwards.
- `npm run check` (types, lint, tests) must pass before pushing.
- Never change a P6 handling value or a `sim/` interface outside a Phase 1 task without flagging it; the handling regression tests are the guard.
- No copyrighted names, characters, vehicle designs, tracks, art or audio from any existing game.
- No ads, no purchase prompts, no timers that gate play.

## 8. Where the owner is needed

1. **P6 feel sign-off.** Play the build on an iPhone and iPad and describe what is off ("too floaty", "nose drops too fast"). Expect two or three rounds.
2. Same again, briefly, for each new vehicle (V1, V2).
3. A glance at the style guide (G1) before the art tasks fan out.
