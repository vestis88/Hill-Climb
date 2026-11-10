# Ridgeline (working title)

An original 2D physics hill-climb driving game for iPhone and iPad, built as an
installable web app. See [PLAN.md](PLAN.md) for the build plan and task list.

## How the game works

You drive as far as you can along a hilly track before you run out of fuel or
land on your head. Coins you pick up along the way pay for upgrades, and
upgrades let you get further on the next run. There are no ads and nothing to
buy: every coin is earned by driving.

### Vehicles

| Vehicle | Unlock | Character |
|---|---|---|
| Runabout | free | Small, light car; easy to handle |
| Scrambler | 6,000 coins | Light dirt bike; quick, spins fast in the air, flips easily |
| Hauler | 15,000 coins | Heavy 4x4; slow, very stable, climbs almost anything once upgraded |

Each vehicle has its own four upgrades and its own base and fully upgraded
values. No combination of upgrades flips any vehicle over backwards from a
standstill on flat ground; the hills still need a light touch.

### Environments

| Environment | Unlock | What is different |
|---|---|---|
| Green Meadows | free | Rolling grassy hills |
| Crater Fields | 4,000 coins | Low gravity (about 40%), big crests, long floaty jumps |
| Frost Pass | 10,000 coins | Icy ground with far less grip, steeper and bumpier |

Every environment is endless and the same every run: the hills grow taller
and steeper with distance, up to a limit, so there is always further to go.

### The run

- **Fuel** drains while you drive, a little faster with the gas held. Fuel cans
  lie along the track, further apart the further you get. The run ends when
  the tank is empty and the car rolls to a stop.
- **Crashing**: the run ends at once if the driver's head hits the ground.
- **Coins** come from four places (values in `src/sim/run.ts` and `src/data/track.ts`):
  - coins lying on the track, in small groups, worth more the further out they are;
  - air time, paid per second in the air;
  - flips, paid for each full rotation that lands on the wheels;
  - distance milestones, a one-off bonus the first time you pass each marker on a track.
- At the end of a run all coins collected are banked, whether it ended in a crash or an empty tank.
- Crashing costs nothing except the run itself. There are no checkpoints:
  every run starts from the beginning of the track.

### Progression principle

**Every vehicle starts as the worst version of itself.** The base car is
deliberately slow, short of grip and hard to handle. Upgrades take it from
there to its best version. So when we tune:

- The playtests so far have set the **base** values: about 33 km/h top speed,
  a modest engine, tyres that spin on climbs steeper than about 25 degrees.
  These stay weak on purpose.
- Each upgrade moves one group of physics values from its base value
  towards its fully upgraded value. Upgrades never add new behaviour;
  they only change numbers the physics already uses.
- The fully upgraded vehicle is tuned too, and has to feel great but
  still be beatable by the hardest terrain.
- The skill of the game, balancing the car with the pedals in the air, is
  not upgradable. Every upgrade level must make a measurable difference.

### Upgrades

Each vehicle has four upgrades, each with 10 levels. Level 1 is the base car.

| Upgrade | What you notice | What it changes in the physics | Base → fully upgraded (starter car, first proposal) |
|---|---|---|---|
| **Engine** | Faster acceleration and higher top speed; climbs hills it used to stall on | Drive torque and top wheel speed | Torque ×1 → ×2; top speed 33 → about 70 km/h |
| **Tyres** | Wheels spin less on launch and on steep climbs; better braking | Tyre friction | Steepest climb from a standstill about 25° → about 38° |
| **Suspension** | Lands jumps cleanly, stays planted over bumps, harder to tip over | Spring damping, and a lower centre of weight | Bounce after landing dies out faster; centre of weight 0.2 m lower |
| **Drivetrain** | Steadier climbing, power on rough and slippery ground | Drive added at the front wheels | Rear-wheel drive → all-wheel drive |

Upgrades are bought separately per vehicle. There is deliberately no fuel
upgrade: fuel stays the same for every car, so getting further comes from
driving better and from the four upgrades above.

### Coins and prices

- Prices rise with each level, roughly 50% more than the level before. An
  early level costs about one or two runs of coins; the last levels take many
  runs. First proposal: level 2 costs 300 coins and level 10 about 7,700,
  about 22,000 coins to max one upgrade.
- New vehicles and new environments are also bought with coins.
- Pace is checked by an economy simulation, `npm run economy`: a scripted
  driver plays Green Meadows with the Runabout and buys the cheapest upgrade
  after each run. It almost never crashes, so it is much faster than a child.
  Current result: first upgrades after one run, fully upgraded after about
  26 runs or **2 hours** of play. Children should take several times longer.
- What sets the pace: coins are worth 5 each up to 500 m, 10 up to 1,500 m
  and 15 beyond; the distance bonus is 15 coins per new 100 m; fuel cans get
  further apart (150 m more each time plus 85 m), so a faster, upgraded car
  gets further on each tank.

All prices and upgrade ranges live in `src/data/` and are tuned by playtest.

## Develop

```
npm install
npm run dev      # local server; open the printed Network URL on a phone on the same Wi-Fi
npm run check    # type-check and run the handling tests
npm run build    # production build in dist/
```

Controls: hold the right half of the screen for gas and the left half for
brake. On a keyboard use the arrow keys or A/D; R restarts a run, and Enter
starts one from the garage.

Progress (coins, upgrades, best distance) is saved in the browser on each
device. Clearing Safari's website data resets it.

### Tuning sandbox

Add `?tune` to the address (for example `…/Hill-Climb/?tune`) to get a
**Tuning** button in the garage. It has sliders for every handling value of
the base car and of the fully upgraded car, a choice of which to drive (your
upgrades, base, or full), and **Copy values** to get the numbers to put into
`src/data/vehicles.ts`. Tuning changes stay in that browser only. Players
without `?tune` never see it.

## Play on a phone

Every push to `main` is checked, built and published to GitHub Pages by
`.github/workflows/deploy.yml`. In Safari, open the Pages address and use
Share, then "Add to Home Screen" for a full-screen launch.
