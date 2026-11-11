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
| Scrambler | 6,000 coins | Two-stroke motocross bike; quick, spins fast in the air, flips easily. Wheelies are rider-controlled: full gas lifts the front at launch, and on the back wheel the nose rises steadily on the gas and drops when you let go, so you feather it (hold the gas and it loops). Land on the back wheel balanced, nose well up, to carry a wheelie on; land low or hard and the front slaps down. Its suspension bottoms out on a bump stop before the tyres reach the mudguards |
| Hauler | 15,000 coins | Heavy 4x4; slow, very stable, climbs almost anything once upgraded |

Each vehicle has its own four upgrades and its own base and fully upgraded
values. Backflipping on launch is part of the game: feathering the gas is the
skill. The Runabout and the Hauler are **launch-safe**: at base, fully upgraded
or with any single upgrade maxed, full gas from a standstill on flat ground
does not flip them (on Green Meadows and Frost Pass). Mixed in-between setups
can, and the Scrambler can at any time.

### Environments

| Environment | Unlock | What is different |
|---|---|---|
| Green Meadows | free | Rolling grassy hills, many jumps; slightly light gravity (9) |
| Crater Fields | 4,000 coins | Low gravity (4.2), big crests and long floaty jumps; flips come easily |
| Frost Pass | 10,000 coins | Icy ground with far less grip, steeper and bumpier |

Gravity is the same in the air as on the ground.

Every environment is endless and the same every run: the hills grow taller
and steeper with distance, up to a limit, so there is always further to go.
Kicker ramps (a ramp that steepens to a lip, then a drop) throw the car into
the air regularly, so holding full gas all the way does not work: you have
to ease off and balance the car in the air. Green Meadows has the most.

### The run

- **Fuel** drains while you drive, a little faster with the gas held. Fuel cans
  lie along the track, further apart the further you get. When the tank runs
  dry the engine dies but the run goes on: the car rolls on, and only the
  brake works (it slows the car and tips the nose down in the air; it cannot
  reverse). Roll into a fuel can on an empty tank and you refuel and get a
  **100-coin bonus**. The run ends once the car has stood still for a second,
  or has made no new ground for 8 seconds (rocking in a dip).
- **Crashing**: the run ends at once if the driver's head hits the ground.
- **Coins** come from six places (values in `src/sim/run.ts` and `src/data/track.ts`):
  - coins lying on the track, in small groups, worth more the further out they are;
  - air time: 20 coins per second in the air, for jumps of at least 0.8 s;
  - flips: 100 for a single, 300 for a double, 900 for a triple, 2,000 for a
    quad (and 1,500 more for each rotation beyond), back or front, landing on the wheels (any wheel
    touching, roughly upright relative to the ground; rotation is measured
    against the ground, so ramps and downhill landings count fully);
  - wheelies: 2 coins per metre with the front wheels up and the back wheels
    down while moving forward, for wheelies of at least 10 m (by distance, so a
    fast wheelie pays more than a slow one);
  - distance milestones, a one-off bonus the first time you pass each marker on a track;
  - 100 coins for reaching a fuel can on an empty tank.
- At the end of a run all coins collected are banked, whether it ended in a crash or an empty tank.
- Crashing costs nothing except the run itself. There are no checkpoints:
  every run starts from the beginning of the track.

### Players, rounds and ghosts

- **Who plays:** tick Wille, Frans and/or Johan in the garage. Pressing Drive starts a round:
  each ticked player drives once, in turn, on the vehicle and track picked in the garage. After
  each run their results show with a big "Frans's turn" button to hand the iPad over; after the
  last turn come the round's standings, then back to the garage.
- **Shared garage:** coins, upgrades and unlocks are shared by everyone. Bests, ghosts and the
  highscore board are per name, and distance bonuses count from each player's own best.
- **Ghost riders:** every run is recorded (the vehicle's pose 15 times a second, about 50 KB
  for two minutes) and stored on the device as that player's *last* run on that track, and as
  their *best* when it went further. Each turn you race see-through ghosts with name tags: your
  own best, your own last, and the best run of the others in the round. Ghosts replay poses,
  not inputs, so they never affect the physics and still play back after a game update. If
  the device's storage is full, last-run ghosts are dropped first. Resetting progress clears
  ghosts too.
- **Highscores** (garage): the top 10 runs per track, with name, vehicle and distance, plus
  each player's best on that track.

### Progression principle

**Every vehicle starts as the worst version of itself.** The base car is
deliberately slow, short of grip and hard to handle. Upgrades take it from
there to its best version. So when we tune:

- The playtests so far have set the **base** values: about 40 km/h top speed
  (eased into rather than a hard limit),
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

Each vehicle has four upgrades chosen to suit it, each with 10 levels. Level 1
is the base vehicle. Engine, Tyres and Suspension are shared; the fourth is
specific:

| Vehicle | Fourth upgrade | Why |
|---|---|---|
| Runabout | **Drivetrain**: power to the front wheels too | It starts rear-wheel drive; all-wheel drive climbs and pulls better |
| Scrambler | **Flip control**: spins faster in the air | A bike has no front drive; the rider throws it round quicker, so flips (and their coins) come easier |
| Hauler | **Lighter body**: sheds weight | It is already a full-time 4x4; less weight makes it quicker and climb better |

| Upgrade | What you notice | What it changes in the physics |
|---|---|---|
| **Engine** | Faster acceleration and higher top speed; climbs hills it used to stall on | Drive torque, how much pull it keeps at speed, top wheel speed |
| **Tyres** | Wheels spin less on launch and on steep climbs; better braking | Tyre friction |
| **Suspension** | Lands jumps cleanly, stays planted over bumps, harder to tip over | Spring damping, and a lower centre of weight |
| **Drivetrain** | Steadier climbing, power on rough and slippery ground | Drive added at the front wheels |
| **Lighter body** | Quicker off the line, livelier | Chassis mass |
| **Flip control** | Rotates up to 50% faster in the air and reacts sooner | Air spin rate (2.4 to 3.6 rad/s) and how quickly it is reached |

Upgrades are bought separately per vehicle. There is deliberately no fuel
upgrade: fuel stays the same for every car, so getting further comes from
driving better and from the upgrades.

**Upgrades make stages quicker.** `npm run stages` times a scripted driver over
the first 500 m of every map with all upgrades at each level, and each upgrade
on its own. Current results, seconds (DNF: the driver crashed on every try):

| | Level 1 | 5 | 10 |
|---|---|---|---|
| Runabout, Green Meadows | 55.6 | 42.7 | 36.4 |
| Scrambler, Green Meadows | 54.2 | 43.8 | 39.1 |
| Hauler, Green Meadows | 55.3 | 42.6 | 35.1 |
| Runabout, Crater Fields | DNF | 53.4 | 42.9 |
| Hauler, Frost Pass | 61.4 | 46.9 | 37.7 |

Times fall at nearly every level; the engine does the most on its own, and
tyres, suspension and the fourth upgrade add smaller gains that matter more on
steep and rough ground. `tests/stages.test.ts` checks the trend for every
vehicle.

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
  60 runs or **2.4 hours** of play (it crashes on some jumps). Children should take
  several times longer.
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

### Test mode and tuning sandbox

Turn on **Test mode** in Settings (or add `?tune` to the address, for example
`…/Hill-Climb/?tune`): every vehicle and environment can be picked without buying it (a red
TEST MODE badge shows in the garage, and no coins are spent), and the garage
gets a **Tuning** button. It has sliders for every handling value of
the base car and of the fully upgraded car, a choice of which to drive (your
upgrades, base, or full), and **Copy values** to get the numbers to put into
`src/data/vehicles.ts`. Tuning changes stay in that browser only. Players
without `?tune` never see it.

## Play on a phone

Every push to `main` is checked, built and published to GitHub Pages by
`.github/workflows/deploy.yml`. In Safari, open the Pages address and use
Share, then "Add to Home Screen": it then opens full-screen like an app, with
its own icon, and works offline after the first visit. New versions arrive
the next time it is opened with a connection.

**Settings** (in the garage): sound on/off and volume, pedals swapped (gas on
the left), and resetting all progress. All sound is synthesised in the game;
there are no audio files. Each vehicle has its own engine; the Scrambler is a
single-cylinder two-stroke built from exhaust pulses, with pops and bangs when
the gas is let go at high revs, and the Hauler a rumbling cross-plane V8 built the same way.

**Gears.** Every vehicle has a gearbox (Runabout 4, Scrambler 5, Hauler 4), mostly for sound
and feel: the engine note climbs through each gear and drops on the shift, with a clunk and
each vehicle's own shift sound (the Runabout's turbo blow-off, the Scrambler's exhaust crack,
the Hauler's deep blat). Held flat out in the air, it bounces off the rev limiter. On screen, a
rev gauge shows the gear, which pops on a shift; the exhaust spits flame and the rider rocks
back. The only effect on driving is a brief, partial torque cut while shifting (0.08 to 0.25 s),
which costs about 1% on stage times. Shifts are decided from smoothed wheel speed, never in the
air, and at least 0.7 s apart, so the box does not hunt over bumps.
