# Ridgeline (working title)

An original 2D physics hill-climb driving game for iPhone and iPad, built as an
installable web app. See [PLAN.md](PLAN.md) for the build plan and task list.

## How the game works

You drive as far as you can along a hilly track before you run out of fuel or
land on your head. Coins you pick up along the way pay for upgrades, and
upgrades let you get further on the next run. There are no ads and nothing to
buy: every coin is earned by driving.

The game is in Swedish: every screen, button and in-game text (the code and this README stay
in English). Vehicle and track names are Swedish too: Buggyn (code id `runabout`), Crossen
(`scrambler`), Bjässen (`hauler`) and Träskkryparen (`rover`); Gröna ängar, Kraterfälten,
Frostpasset, Dynhavet, Röda kanjonen and Månskensskogen. The README uses the English code names.

### Vehicles

| Vehicle | Unlock | Character |
|---|---|---|
| Runabout | free | Small, light car; easy to handle |
| Scrambler | 6,000 coins | Two-stroke motocross bike; quick, spins fast in the air, flips easily. Wheelies are rider-controlled: full gas lifts the front at launch, and on the back wheel the nose rises steadily on the gas and drops when you let go, so you feather it (hold the gas and it loops). Land on the back wheel balanced, nose well up, to carry a wheelie on; land low or hard and the front slaps down. Its suspension bottoms out on a bump stop before the tyres reach the mudguards |
| Hauler | 15,000 coins | Heavy 4x4; slow, very stable, climbs almost anything once upgraded |
| Marsh Rover | 10,000 coins | Amphibious buggy on balloon paddle tyres: puddles do not slow it, and on slippery ground (snow, ice, mud, sand) its studs keep a grip of at least 0.7 (0.95 with Tyres maxed). The best in Frost Pass and Moonlit Woods at low and mid levels; on grass and rock about even with the others. Fourth upgrade: Lighter hull |

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
| Dune Sea | 7,000 coins | Long rolling sand dunes, loose sand (less grip), big dune jumps; fast. Cacti and blowing sand |
| Red Canyon | 14,000 coins | Steep rocky climbs with good grip; rare, gentle jumps (kickers on steep ground were unsurvivable). Red cliffs at late afternoon |
| Moonlit Woods | 20,000 coins | Night forest: muddy and slippery, bumpy with roots. Moon, stars, fireflies, glowing mushrooms |

**Puddles** lie on gentle stretches of three maps: rain puddles on Green Meadows, slush on
Frost Pass and deep mud in Moonlit Woods. A wheel in one drags the vehicle back (mud most)
and has less grip, with splashes and a splash sound. They are in fixed places, the same
every run.

Gravity is the same in the air as on the ground. A test checks that a
half-upgraded Runabout and Hauler can get through the first 300 m of every
map (`tests/stages.test.ts`).

Every environment is endless and the same every run: the hills grow taller
and steeper with distance, up to a limit, so there is always further to go.
Kicker ramps (a ramp that steepens to a lip, then a drop) throw the car into
the air regularly, so holding full gas all the way does not work: you have
to ease off and balance the car in the air. Green Meadows has the most.

### The run

- **Fuel** drains while you drive, a little faster with the gas held. Fuel cans
  lie along the track, further apart the further you get; under the fuel gauge,
  "Fuel in 125 m" says how far the next one is. When the tank runs
  dry the engine dies but the run goes on: the car rolls on, and only the
  brake works (it slows the car and tips the nose down in the air; it cannot
  reverse). Roll into a fuel can on an empty tank and you refuel and get a
  **1,000-coin bonus**. The run ends once the car has stood still for a second,
  or has made no new ground for 8 seconds (rocking in a dip).
- **Crashing**: the run ends at once if the driver's head hits the ground.
- **Coins** come from seven places (values in `src/sim/run.ts` and `src/data/track.ts`):
  - coins lying on the track, in small groups, worth more the further out they are;
  - air time: 20 coins per second in the air, for jumps of at least 0.8 s;
  - flips: 100 for a single, 300 for a double, 900 for a triple, 2,000 for a
    quad (and 1,500 more for each rotation beyond), back or front, landing on the wheels (any wheel
    touching, roughly upright relative to the ground; rotation is measured
    against the ground, so ramps and downhill landings count fully);
  - wheelies: 2 coins per metre, for wheelies of at least 10 m (by distance, so a
    fast wheelie pays more than a slow one). A wheelie starts with the front wheels
    up and a back wheel down, moving forward, and lasts until a front wheel touches
    the ground: hops off the back wheel keep it going, but only metres driven with
    a back wheel down count. Long wheelies pay more: each metre is paid at ×2 from
    25 m, ×3 from 50 m, ×4 from 100 m and ×5 from 200 m. A live counter under the
    coins shows the metres, coins and multiplier while you are on the back wheel;
  - distance milestones, a one-off bonus the first time you pass each marker on a track;
  - 1,000 coins for reaching a fuel can on an empty tank.
  - combos: tricks (flips, air time, wheelies) chained one after another, each within 2.5 s on
    the ground of the last, pay a bonus when the chain ends: ×1.5 for two, +0.5 per trick, up to ×4
    (the bonus is the tricks' coins times the multiplier minus one). A messy landing or a crash
    loses the chain; a live counter shows it.
- At the end of a run all coins collected are banked, whether it ended in a crash or an empty tank.
- Crashing costs nothing except the run itself. There are no checkpoints:
  every run starts from the beginning of the track.

### The start

Every run opens with a quick 3, 2, 1, GO (0.7 s a beat, with beeps). The vehicle is held while
a big rev counter shows in the middle of the screen; the gas revs the engine. Revs inside the
green window (66–86 %) at GO give a **perfect start**: a push for about a second, through the
centre of mass so it cannot flip the vehicle (about half a second quicker to 30 m). Revs in
the red (the limiter, if the gas is simply held) are **too many revs**: the wheels spin in a cloud of
smoke (half grip) while a perfect start's push runs in reverse, both for about a second and
fading together, so the vehicle still gets away, just about as much slower as a perfect start is
quicker. Revs below the green start normally, but the engine **bogs**: low chugs and the
revs sag before they pick up (sound and rev counter only). Races and ghosts start their clocks at GO.

Each engine revs at its own pace (`engine.revTime`, idle to the limiter out of gear): the
Scrambler's two-stroke 0.35 s, the Runabout's four 0.6 s, the Marsh Rover 0.85 s and the
Hauler's V8 1.1 s. So the two-stroke needs quick taps to hold the green, while the V8 swells
slowly. While driving, the rev counter and the engine sound follow the wheels at the same pace
(code: `src/sim/launch.ts`).

### Dagens utmaning (daily challenge)

A new track every day, the same on every device, rebuilt from the date alone (code:
`src/data/daily.ts`). The date picks a base map (its look, gravity, grip and puddles; the harder
maps come up less often), one of five terrain styles (Långa vågor, Guppig, Hoppark, Branta
backar, Lugn) that scale its hills, crests, bumps and jumps within safe ranges, a small jitter,
and the seed. Two events run on it: **Dagens lopp**, a 500 m race, and **Dagens oändliga**, an
endless run, each with its own vehicle (two different ones) at a balanced tuning that is the same
for everyone: every upgrade between level 3 and 7, adding up to 20 (the family's own upgrades do
not count). Pick an event in the garage under "Dagens utmaning" and press Kör; it works in rounds
too (everyone drives the set vehicle). Coins are earned as usual.

Records, ghosts and highscores are kept under the date (a "Dagens" tab in Topplista), and dropped
after two weeks. Quality: a variant steeper than its base map is never used (the next variant of
the same date is tried instead); tests check a year of dates against that, and a scripted driver
finishes both events on a month of tracks.

### Modes: endless and races

Pick a mode in the garage. **Endless** is the classic: drive as far as you can. **Races**
(500 m, 1 km, 2 km) put a chequered finish arch at that distance and time you: the clock
runs in the corner with the metres to go. Crashing or running out of fuel before the line is
a DNF (did not finish). Coins are earned as usual. Bests, ghosts and highscores are kept per
mode: in a race, *best* means the fastest finish, and your ghosts are your fastest and last
runs at that length. Round standings rank finishers by time, then DNFs by how far they got.

### Players, rounds and ghosts

- **Code:** the round rules (turns, results, standings, ghosts carried between rounds) live in
  `src/game/round.ts` as plain functions with their own tests (`tests/round.test.ts`).
- **Who plays:** tick Wille, Frans, Johan and/or Bim in the garage. Pressing Kör (Drive) starts a
  round: each ticked player drives once, in turn, on the vehicle and track picked in the garage.
  With several players, a "Ny omgång" screen first shows who starts ("Wille börjar!") and the turn
  order, with a green "Kör, Wille!" button (green buttons always drive; Garaget is offered only
  after the round); the countdown also shows whose turn it is ("Willes tur").
  After each run their results show with a big "Frans tur" button to hand the iPad over; after the
  last turn come the round's standings (with each player's vehicle), then back to the garage.
- **Own vehicle each:** in a round with several players, the screen before each turn shows the
  vehicles the family owns and the player picks theirs; the track and mode stay shared. Each
  player's pick is remembered on the device (it starts as the garage's vehicle).
- **Shared garage:** coins, upgrades and unlocks are shared by everyone. Bests, ghosts and the
  highscore board are per name, and distance bonuses count from each player's own best.
- **Ghost riders:** every run is recorded (the vehicle's pose 15 times a second, about 50 KB
  for two minutes) and stored on the device as that player's *last* run on that track, and as
  their *best* when it went further. Each turn you race see-through ghosts with name tags. Records are kept
  per player and track, and also per vehicle ("Wille rekord · Crossen"): the driver always races
  their overall record, their record in the vehicle they are driving when that is a different
  run, and their latest run. Playing alone: those three. In a round with several players: for every player in the round, their
  latest run ("Frans senaste": this round's run, else from the round before, else their saved
  last run) and their record ("Frans rekord"), plus the overall record on the track and mode
  ("Rekord · Johan"), also when its holder is not playing. A run that is both someone's latest and
  a record shows once, as the record. Ghosts fade
  out near your own vehicle, so they never get in the way: invisible when nearly on top of it
  (under 0.6 m), fully visible again from 4 m. Overlapping
  name tags stack. Ghosts replay poses,
  not inputs, so they never affect the physics and still play back after a game update. If
  the device's storage is full, last-run ghosts are dropped first. Ghosts are stored packed
  (`packGhost` in `src/save/ghosts.ts`): under half the size of plain JSON, so more than twice as many fit; older ghosts still load. Resetting progress clears
  ghosts too.
- **Always recorded:** every run is saved as the player's last ghost (and best when it
  went further or faster) and goes on the highscore board; unfinished races are listed as
  DNF with their distance, below the finishers. Runs in test mode (everything unlocked) do
  not count: no bests, highscores or ghosts.
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

### Sync between devices

Progress (coins, upgrades, unlocks, bests and highscores) can be shared between the
family's iPhones and iPads through a free Firebase Realtime Database
(`src/save/cloud.ts`, set `CLOUD_DB_URL`). In Settings, the first device taps **Start**
and gets a family code; the others tap **Join with code**. Each device then syncs when
the game opens, comes back to the front, and shortly after every run or purchase.

Merging keeps the best of both: upgrade levels and unlocks at their highest, bests at their
best, highscore boards combined. Coins are kept as earned and spent per device, so two
devices playing at the same time never lose or double-count coins. Writes use Firebase's
ETag check, so simultaneous syncs retry instead of overwriting each other.

Ghosts sync too: a small index in the cloud lists each player's best and last ghost per
track and mode, and only ghosts that are missing or beaten are sent either way (a better
best wins; for "last", the most recent run wins). Who is playing and the chosen vehicle,
map and mode stay on each device. Resetting progress on a
device also stops it syncing.

Database rules (Firebase console, Realtime Database, Rules):

```json
{ "rules": { "families": { "$code": { ".read": true, ".write": true } } } }
```

The family code (12 random characters) is the only key to a family's progress, and the
whole list of families cannot be read.

### Pause, ghosts setting and updates

- **Pause:** the ❚❚ button during a run (or leaving the app, e.g. a call) pauses: nothing moves,
  the engine goes quiet, and the menu offers Fortsätt (go on) or Avsluta åket (end the run).
- **Set pieces:** from 250 m on, most 300 m stretches of every map hold one set piece, placed by
  the map's seed (the same every run): a double jump with logs at the lips, a wooden table-top
  bridge, a row of whoops (five quick rollers), or a steep wall up to a plateau. Plain kickers are
  left out inside them (code: `src/sim/terrain.ts`).
- **Own paint colour:** every player's vehicle is painted in their name colour while they drive,
  on their ghosts, and in the vehicle pictures on their turn screen.
- **Time of day and weather (daily challenge only):** the date picks day, dusk or night (with
  headlight glow) and sometimes rain, snow or fog, matched to the map (no rain on the moon, no snow
  in the desert). Rain and snow make the ground slippery (82 % and 72 % of the map's grip), and the
  garage shows it ("Regn, halt"). Other runs are always clear daylight (code: `src/data/weather.ts`).
- **Spöken (settings):** race all ghosts, only records, or none.
- **Updates:** a home-screen app can stay open for days. The game checks `version.json` every few
  minutes and, outside a run, shows "Ny version finns · tryck för att uppdatera".
- **Rotate prompt:** shown only in the menus, never over a run in progress.
- **iPad screen size:** home-screen apps on iOS/iPadOS 26 can report a viewport about a status bar
  shorter than the window (WebKit bug 301108), leaving a strip at the bottom; the game then sizes
  itself from the large viewport instead (`src/ui/viewport.ts`). The settings screen shows what the
  device reports (window, screen, safe areas, home-screen app or browser) to help with layout
  problems.

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
the gas is let go at high revs, the Hauler a rumbling cross-plane V8 and the Runabout a buzzy inline four, all built the same way.

**Gears.** Every vehicle has a gearbox (Runabout 4, Scrambler 5, Hauler 4), mostly for sound
and feel: the engine note climbs through each gear and drops on the shift, with a clunk and
each vehicle's own shift sound (the Runabout's turbo blow-off, the Scrambler's exhaust crack,
the Hauler's deep blat). Held flat out in the air, it bounces off the rev limiter. On screen, a
rev gauge shows the gear, which pops on a shift; the exhaust spits flame and the rider rocks
back. The only effect on driving is a brief, partial torque cut while shifting (0.08 to 0.25 s),
which costs about 1% on stage times. Shifts are decided from smoothed wheel speed, never in the
air, and at least 0.7 s apart, so the box does not hunt over bumps.
