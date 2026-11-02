# 9e Simulator: Game Rules and Tuning Reference

Version 1.7.8. Source: `site/simulator/index.html` (single file, HTML + Canvas). This document was written from a reading of the code; numerical claims marked "computed" were derived from the formulas, and the drift steady-state figures were obtained by simulating the drift update rule on its own.

## 1. Overview and how to tune

Units: 1 map cell = 1 metre; times are in seconds; angles are in radians unless stated; "pts" are points of the 0 to 100 bars. The game loop caps each frame at `dt = 0.05 s`. All randomness uses `Math.random()`.

**The tuning block.** Every rule parameter that was previously scattered is now in the `TUNE` object (search for `TUNE: tots els paràmetres`). Changing a value there changes the rule everywhere. Default values are those of version 1.7.7, so behaviour is unchanged. A seeded comparison of 1.7.7 and 1.7.8 on levels 7 and 10 (movement, loading, volleys, AI fighting) produced identical final states.

| `TUNE` group | Governs |
| --- | --- |
| `moviment` | step length, ranks and files spacing, cadences, turn times, command delay, par file, alignment speeds |
| `ordre`, `recordatori` | order percentage, warnings, chaos thresholds, reminder timers |
| `desordre` | disorder noise per step, per turn, per shot; column and fatigue modifiers |
| `energia` | stamina rates, thresholds, posture costs |
| `mosquet` | reload, accuracy, range, fire strip, shelter, suppression, static enemy fire |
| `tirailleurs` | skirmisher spacing, bounds and minimum distance |
| `art` | artillery battery |
| `capita` | Captain Le Jay reload bonus |
| `ia` | AI regiments (level 10) |
| `puntuacio` | scoring constants |
| `mort` | collision margins and delay of the "unit destroyed" reset |

The following derived constants are built from `TUNE` and should not be edited directly: `STEP`, `FRONT`, `RANK_GAP`, `ORD_CADENCE`, `PACES`, `TURN_T`, `PF_TURN_T`, `PF_MIN_LEG`, `ORDER_DELAY`.

**Data tables that stay outside `TUNE`.** Per order, `ORDERS[i].des` (disorder multiplier), `.en` (fatigue multiplier) and `ORDER_BY_ID['MA-04'].desOpt` (pace multipliers). Per level, `SCORE_REF` and the level flags below.

| Order | `des` | `en` |
| --- | --- | --- |
| MA-01 En avant | 0.8 | 1 |
| MA-02 En arrière | 1 | 0.8 |
| MA-07 Oblique | 1.2 | 1.2 |
| MA-04 Pas (`desOpt`) | ordinari 1, accelerat 1.5, carrega 2.2 | same factors used for fatigue |
| FD-04 Par le flanc, FD-06 Front | 0.5 (shot) | 1 |
| FD-05 Demi-tour | 0.7 (shot) | 1 |
| WH-01 Par peloton | 2.2 | 1.5 |
| WH-02 Conversion | 2.0 | 1 |
| WH-03 Tournez | 2.4 | 1 |
| CD-01 Par file | 1.5 (shot) | 1 |
| CD-06 Contremarche | 1.0 (shot) | 1 |
| FI-04 Feu | 0.15 (shot) | 1 |
| SK-01, SK-02, SK-04, SK-05 | 0.3 | 1 |
| SK-11 | 0.2 | 1 |

An order flagged "shot" applies a one-off jolt when executed (section 4). All other orders listed with `des = 0` do not disorder the unit.

**Level flags** (verified by loading each level): `driftScale` multiplies all disorder noise; `fatigueScale` multiplies all stamina rates; `exhaust` stops the unit at 0 stamina; `advanced` enables the tired disorder penalty, the standing recovery rules and the stamina bar; `warnDisorder` enables Louis' warnings and chaos; `musket`, `skirm` unlock the weapon and skirmisher orders; `minMen` is the loss threshold; `keepMin` protects the first enemy regiment from falling below that number of men by skirmisher fire.

| Level | `driftScale` | `fatigueScale` | `exhaust` | `advanced` | `warnDisorder` | `musket` | `skirm` | `minMen` | `keepMin` | trees (`cover`) | `walls` | enemies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.8 | 1 | no | no | no | no | no | none | none | 0 | 0 | 0 |
| 2 | 0.8 | 1 | no | no | no | no | no | none | none | 0 | 0 | 0 |
| 3 | 1 | 1 | no | no | no | no | no | none | none | 0 | 0 | 0 |
| 4 | 0.8 | 1 | no | no | no | no | no | none | none | 0 | 0 | 0 |
| 5 | 1.1 | 2.2 | yes | yes | yes | no | no | none | none | 0 | 0 | 0 |
| 6 | 0.5 | 1 | no | no | no | yes | no | none | none | 0 | 0 | 1 |
| 7 | 0.5 | 1 | no | no | no | yes | no | 8 | none | 89 | 0 | 2 |
| 8 | 0.5 | 1 | no | no | no | yes | yes | 6 | 24 | 0 | 0 | 1 |
| 9 | 0.5 | 1 | no | no | no | yes | no | 6 | none | 0 | 0 | 0 |
| 10 | 0.5 | 0.8 | yes | yes | yes | yes | yes | 7 | none | 241 | 6 | 2 AI + 1 allied AI |

## 2. Movement and commands

**Geometry.** `STEP = moviment.pas = 0.65 m`. Men in a rank are `moviment.front = 0.5 m` apart; ranks are `moviment.rengle = 0.325 m` apart. The unit has 10 files by 2 ranks (20 men). Speed is `stepLength × cadence / 60`.

| Pace (order MA-04) | Cadence (steps/min) | Key | Speed (m/s, computed) |
| --- | --- | --- | --- |
| Pas ordinaire | 76 | `moviment.cadOrdinari` | 0.823 |
| Pas accéléré | 100 | `moviment.cadAccelerat` | 1.083 |
| Pas de charge | 120 | `moviment.cadCarrega` | 1.300 |
| En arrière (MA-02) | 76, half steps | uses `cadOrdinari` | 0.412 |

Automatic manoeuvres (`startAuto`) walk at `ORD_SPEED` = 0.823 m/s. "Serrez les files" is executed at the pas de charge speed. Oblique marching (MA-07) alternates a straight step and a 45 degree step.

**Turning.** The whole unit turns in `moviment.girUnitat = 0.7 s` regardless of the angle (Demi-tour, Front, Par le flanc, which turns while marching). Each file turns 90 degrees in `moviment.girFilera = 0.5 s` during a par file. The head turns at `moviment.girCap = 1.5 rad/s`.

**Two-voice commands.** Function `fire()`: the order text is split at " – ". If there is no split (Fixe!, Contremarche!, Halte) the order runs at once. Otherwise the preparatory voice is spoken and `pendingCmd` is armed for `moviment.retard = 0.78 s` (`ORDER_DELAY`). While it is armed no other order can be issued. When the delay expires `tickPending` checks availability again: if the order is no longer available it is cancelled ("Ordre anul·lada"); in voice mode a missing executive voice also cancels it. On execution (`runOrder`) the order counter `STAT.ord` increases, any running "Serrez les rangs" is cancelled (unless the order is SR-01), the order runs, and if the order is flagged `shot` a jolt of disorder is applied.

**Halte.** The executive "Peloton, halte!" stops the unit immediately (`halte()` then `stopCo`): state becomes `parat`, pace returns to ordinary, mode to direct. Any file that is mid-turn in a par file completes its turn (`pfSnap`); the others wait for the next march. The step-synchronised `haltReq` path is retained but not used by `halte()`.

**Par file chaining.** Only in column, marching straight (`parFile`). The first par file sets a turn line at the front-most man; each file turns, as a block of two men, when its centre reaches that line. A further par file given while the first is in progress appends a turn whose line lies `moviment.parFileTram = 2 m` beyond the head's current position along the new heading (`PF_MIN_LEG`), producing a zig-zag. While a par file or a flank turn is active no step drift is applied (`driftStep` is skipped) and the unit is "busy" for orders.

**Limits.** A man within 0.5 m of the map edge stops the unit ("Límit del terreny"). Touching an obstacle (margin `mort.obstacle = 0.15 m`) or a tree (radius plus `mort.arbre = 0.22 m`) kills the exercise and triggers the checkpoint retry (section 8).

**Other motion constants.** Alignment correction speed `moviment.alineaVel = 0.6 m/s`; gap-filling walk after casualties `moviment.buitVel = 1.3 m/s`; "Serrez les rangs" duration `moviment.serrezT = 10 s`.

## 3. Fatigue and stamina

**Variable.** `co.cansament`, 0 to 100 points, starts at 100. Updated every frame by `updateStamina(dt)`:

`cansament = clamp( cansament + rate × dt × level.fatigueScale , 0 , max(cap, cansament) )`

where `cap` is 100, except while recovering after a halt (cap `energia.halteFins`, so recovery never pushes the bar above that value).

**Rate selection (points per second, before `fatigueScale`).**

| Situation | Rate | Keys |
| --- | --- | --- |
| Stopped, not at attention ("En place, repos!") | +1.5 | `energia.repos` |
| Stopped at attention, level not `advanced` | -0.05 | `energia.atencio` |
| Stopped at attention, `advanced`, musket level (`armMode`) | -0.4 × posture cost | `energia.quiet`, `energia.arma` |
| Stopped at attention, `advanced`, no musket, first 10 s | +1.2 while below 50 (cap 50), else 0 | `halteDurant`, `halteRecupera`, `halteFins` |
| Same, from 10 s to 30 s | 0 | `quietDesDe` |
| Same, after 30 s still | -0.4 | `quiet` |
| Marching | -0.5 × `en`(march order) × paceMul × (0.6 if column) | `energia.marxa`, `energia.columna` |
| Manoeuvre (`conv`) | -0.6 × `en`(manoeuvre order) × paceMul (1 for `stand`) | `energia.maniobra` |
| Anything else (turning, automatic manoeuvres) | -0.1 | `energia.altres` |

Posture costs (`energia.arma`, multiplier of `quiet`): portez 1, repose 0.3, charge 1, apprete 1.5, joue 1.8, croise 1.5. The idle timer `co.idleT` resets whenever the unit is not stopped. `paceMul` is 1, 1.5, 2.2 for the three paces (`desOpt`). Marching backwards still applies the current pace multiplier for fatigue.

Computed examples at `fatigueScale = 1`: ordinary march in line -0.5 pts/s (200 s to empty); pas de charge in line -1.1 pts/s; ordinary march in column -0.3 pts/s. Level 5 (`fatigueScale = 2.2`) empties the bar in 91 s of ordinary marching in line; level 10 (0.8) in 250 s.

**Effects.**
1. Reload: every loading duration is multiplied by `1 + mosquet.cansats × (1 − cansament/100)`; at 0 stamina loading takes 1.6 times longer (`mosquet.cansats = 0.6`).
2. Disorder: on `advanced` levels, below `desordre.cansatsSota = 25` pts all disorder noise is multiplied by `desordre.cansats = 1.8` (`driftK`).
3. Exhaustion: on levels with `exhaust`, at 0 pts while marching or manoeuvring (except Contremarche) the unit is stopped ("Exhaustos") and Lefon complains. Marching cannot start again below `energia.minMarxa = 15` pts.
4. Warnings: Lefon grumbles below `energia.rondina = 25` and is re-armed above `energia.rearma = 50`. Bar colours change at `energia.verd = 50` and `energia.groc = 20`.

**Where.** `updateStamina`, `driftK`, `loadDur`, `startLoad`, availability of MA-01; keys `TUNE.energia.*`.

## 4. Order and disorder

**Variables.** Each man has `m.dx, m.dy`, his deviation in metres from his ideal slot. `disorderRms()` is the root mean square of `sqrt(dx²+dy²)` over the unit. The displayed order is

`orderPct = round( 100 × max(0, 1 − rms / ordre.rmsZero) )`, with `ordre.rmsZero = 0.2 m`.

**What raises disorder.**
1. March steps (`driftStep`, once per step, step period `60/cadence` s). For each man and axis: `delta = (random − 0.5) × n − desordre.retorn × deviation`, with `n = desordre.pas × driftK × marchDes`. `marchDes = des(march order) × paceMul (1 when backwards) × (desordre.columna = 0.5 in column)`; `driftK = level.driftScale × (desordre.cansats if advanced and stamina < desordre.cansatsSota)`. The man is displaced by `delta` and the deviation is updated by the same amount. Defaults: `pas = 0.06`, `retorn = 0.012`.
2. Wheeling and manoeuvres (`wheelDrift`, per step): noise `(random − 0.5) × (distance to pivot / radius) × desordre.roda × driftK × F` minus the same return term, where `F = des(manoeuvre order) × paceMul × (desordre.tiradors = 3 when in open order)`.
3. One-off jolts (`jolt`) after orders flagged `shot`: each man is displaced uniformly within `±desordre.cop × des × driftK / 2`.

**Long-run level while marching in line** (computed by simulating the update rule; time constant about 83 steps, roughly 66 s): ordinary pace 0.119 m rms (order about 40 %); accelerated 0.19 m (about 5 %); charge 0.27 m (0 %); ordinary in column 0.064 m (about 68 %); oblique 0.19 m (about 4 %); backwards 0.16 m (about 20 %); level 10 ordinary line (`driftScale` 0.5) 0.066 m (about 67 %); ordinary line when tired 0.23 m (0 %).

**What lowers disorder.** The natural return term `retorn` pulls each man back by 1.2 % of his deviation per step. "Alignement" (CD-03, stopped, in line, at attention) walks every man to his slot at `ORD_SPEED` and, when an automatic manoeuvre ends, all deviations are reset to zero (order 100 %) unless the manoeuvre keeps drift (skirmisher spacing orders do). "Serrez les rangs" (SR-01, marching in line) removes the deviations proportionally over `moviment.serrezT = 10 s`; any other order or a halt cancels it. After an Alignement the heads stay turned (`co.hdT`) until "Fixe!" (CD-03b); `recordatori.fixe = 6 s` after the stop, then every `recordatori.repeteix = 14 s`, the unit reminds the player.

**Thresholds (levels with `warnDisorder`).**
- Order below `ordre.avis = 25 %`: Louis warns once (`warnDisorder` message); re-armed above `ordre.rearma = 50 %`. The order label turns to "Desordre!".
- Order at or below `ordre.caos = 3 %`: **chaos**. Pending commands are cancelled, a march or manoeuvre is stopped, and every order is refused except Halte, Garde à vous, Alignement, Fixe! and Portez (`CHAOS_OK`). Chaos ends when order reaches `ordre.calma = 85 %` or more (`updateChaos`).
- Bar colours at `ordre.verd = 85 %` and `ordre.groc = 60 %`.

**Effect on firing.** Disorder has no direct effect on fire accuracy. It matters indirectly: the fire strip is built from the men's actual positions (section 6), so a ragged line produces a wider and less regular strip, and chaos blocks the orders needed to fire. Order percentage also feeds the score (section 9).

**Where.** `driftStep`, `wheelDrift`, `jolt`, `disorderRms`, `orderPct`, `processFix`, `alignement`, `serrezTick`, `updateChaos`, `updateFixeReminder`; keys `TUNE.ordre`, `TUNE.recordatori`, `TUNE.desordre`.

## 5. Visibility and line of sight

**What blocks sight and bullets.** Only two level lists are consulted by `losBlocked(x0, y0, x1, y1)`:
- `level.walls`: rectangles (houses). A segment that touches the rectangle is blocked (Liang-Barsky test).
- `level.cover`: trees `{x, y, r}`. The segment is blocked when its closest point to the tree centre is within `sqrt(mosquet.arbreRadi2) × r` (0.8 of the radius; key `arbreRadi2 = 0.64` is the squared fraction).

Nothing else blocks: other men do not block sight; smoke is cosmetic. Separate lists `level.obstacles` and the global `trees` are used for collisions (death of the exercise) and for AI path avoidance, not for line of sight.

**Where sight is tested.**
- Player volley: from the strip origin to each enemy man (`hitMen`). A man behind a tree or wall cannot be hit.
- Skirmisher shot: from the shooter to the chosen target (`manShot`).
- Static enemy regiment: it "sees" the player if the segment from its centre to the unit centre is clear; it turns towards the player only if it sees him. Its fire requires at least one of our men inside its strip and with a clear line from the strip origin.
- Battery: fires only if the unit centre is within `art.abast` and the line from the gun to the unit centre is clear; a cannonball in flight is not stopped by cover.
- AI regiments (level 10): only groups with a clear centre-to-centre line are candidate targets.

**AI vision memory (`aiUnitTick`).** Each tick the regiment filters the groups it can see. If it sees some, it picks one and stores its position in `u.last`. If it sees none but has `u.last`, it advances towards that point and forgets it when closer than `ia.cercaRadi = 6 m`. If it has never seen anything it advances `ia.cercaDist = 30 m` along its heading and halts at `ia.holdSenseObj = 3 m` from the aim point. At level start Austrians remember the player's start point and the allied company remembers the Austrian side (set in `onReset`).

**Where.** `losBlocked`, `segRect`, `hitMen`, `manShot`, `updateEnemies`, `updateGuns`, `aiUnitTick`; keys `mosquet.arbreRadi2`, `ia.cercaDist`, `ia.cercaRadi`, `ia.holdSenseObj`.

## 6. Firing

### 6.1 Line volley ("Feu!")

Availability: posture `joue` and `co.loaded`. The shot is instantaneous (the visible flashes are spread randomly over `mosquet.escalf = 0.45 s`, and 12 % of them are late by a factor 1.6: `tardaP`, `tardaK`; these are cosmetic).

**Fire strip** (`makeStrip`, `inStrip`): origin at the centre of the front rank of the line, half width = half the line width + `mosquet.marge = 0.6 m`, opening half angle `mosquet.obertura = 0.0436 rad` (2.5 degrees) on each side, length `mosquet.abast = 50 m`. A man is inside if his distance along the shot `u` is between 0 and 50 and his lateral offset is within `halfWidth + u × tan(opening)`.

**Probability that one enemy man inside the strip falls** (`dieProb`, `hitMen`):

`p = min( mosquet.maxMort, accuracy(u) × rankFactor × n ) × shelter`

- `accuracy(u) = punteria[0] + (punteria[1] − punteria[0]) × min(1, u / abast)`, defaults 0.55 at the muzzle to 0.15 at 50 m.
- `rankFactor`: `rengle1 = 1.4` for the target's front rank (rank 0), `rengle2 = 0.4` for the second rank.
- `n = number of shooters / 20` (a unit of 14 men has `n = 0.7`).
- `maxMort = 0.95`.

Computed examples with `n = 1`, no shelter: front rank 0.77, 0.49, 0.21 at 0, 25, 50 m; second rank 0.22, 0.14, 0.06.

**Column shelter** (`mosquet.escut`): for each man inside, count the other men inside that are more than `davant = 0.3 m` closer to the muzzle and within `ample = 0.6 m` sideways on the same shot line. With `b` such men, the shelter factor is 1 if `b <= lliures (1)`, otherwise `factor^(b − lliures)` with `factor = 0.12` (so 0.12 for `b = 2`, 0.0144 for `b = 3`). Only the first two men on a shot line are fully exposed. The same rule applies to enemy volleys against our column.

**Oblique fire** (`Joue à droite / à gauche`, `oblAim`): the strip direction is the unit heading plus the side times `mosquet.oblic = π/4`. If an enemy regiment's centre (within `abast + 8 m`) lies between the front and that 45 degree limit on the chosen side, the strip aims at the nearest such regiment instead. The direction is cleared after the shot.

**After the volley.** Every enemy man that falls is removed at once (corpse effect). A regiment that had at least one man inside the strip gains `supDescarrega = 0.5` suppression and one `volleys` count.

### 6.2 Skirmishers (open order)

With files open (`co.open`) each man fires individually (`manShot`): he chooses the nearest living enemy man ahead (`u > 0`), within `abast`, within `tirConAmple = 0.9 rad` of his heading and with clear sight; if none exists he does not fire. Each shot adds `supTret = 0.12` suppression to the target regiment. Hit probability: `(punteria0 + (punteria1 − punteria0) × d/abast) × apuntat (1.3) × (tirRengle2 = 0.6 for a second-rank target)`, no shelter, resolved after the flash delay plus `tirImpacteMs = 60`. `level.keepMin` stops the first enemy regiment from being reduced below that number. In "à volonté" mode each man fires every 0.8 to 4.3 s when loaded. Note: the narrow cone `tirCon = 0.17` is currently unused because every call passes the wide cone. Skirmisher fire silences the battery for 7 s (`g.mute`).

### 6.3 Reloading

Per man: `loadDuration = carrega × (1 − varia/2 + random × varia) × (1 + cansats × (1 − stamina/100))`, that is 15.3 to 20.7 s at full stamina (`carrega = 18`, `varia = 0.3`), up to 1.6 times that when exhausted. Progress per second is `ldBoost / loadDuration`. "Chargez" (LS-01) starts all men; the unit is loaded when the slowest man has finished. **Captain Le Jay** (level 10): `co.ldBoost = carrega / (carrega − capita.bonus)` = 1.385 while the captain is within `capita.dist = 16 m` of the unit centre, otherwise 1 (about 13 s mean). He follows the unit at 7 m behind.

### 6.4 Suppression and pressure

Each enemy regiment has `supp` between 0 and 1. It rises by `supDescarrega` (0.5) for each volley that reaches it, `supTret` (0.12) per skirmisher shot, and `supDescarrega × ia.supFrac (0.6)` per AI volley. It falls by `supDecau = 0.06` per second. While `supp > supMax (0.5)` the regiment does not fire. Below that, its volley strength is scaled by `(1 − supp)` (AI: `1 − min(ia.supMax = 0.9, supp)`). The hover card shows "sense pressió", "pressió lleu" from 0.05, "sota pressió" from 0.2, and "clavats a terra" from `supMax`.

### 6.5 Static enemy regiment (`updateEnemies`)

1. It starts with `reload = mosquet.enInici = 4 s`; reload then counts down.
2. It becomes alert when it has been fired upon (`volleys > 0`) or when it sees the unit within `enAlerta = 30 m`. Once alert and seeing the unit it turns towards it at up to `enGir = 0.17 rad/s`.
3. Its strip uses the opening `enOberta = 0.14 rad` (8 degrees) and the same range `abast`.
4. If none of our men is inside the strip with a clear line, its aiming timer resets. If it is reloading or pinned (`supp > supMax`), the timer is held at no more than `enAvis / 2`. Otherwise the timer runs, and after `enAvis = 5 s` it fires.
5. Its volley uses `n = men/20 × enPunteria (0.45) × (1 − supp)` against our men with the same `hitMen` rules, then `reload = enRecarrega = 32 s`.
6. If our strength falls below `level.minMen`, the unit is destroyed (section 9).

**Bayonet** (arm `croise`): if a man is within 1.0 m of an enemy man and a volley had already hit, each living enemy man dies with probability 0.5 and the rest flee (these two figures are still literals in `updateBayonet`).

**Battery** (`updateGuns`): fires when the unit centre is within `art.abast = 65 m` with clear sight, turns at `art.gir = 0.3 rad/s`, must be aligned within `art.tol = 0.06 rad`, aims for `art.apunta = 2 s`, then fires with an aim error uniform within ±`errLong = 7 m` along and ±`errLat = 2.5 m` across. The ball moves at `art.vel = 90 m/s`, touches ground `art.rasant = 8 m` before the aim point, then slows by `art.frena = 60 m/s²` to at least `art.velMin = 25 m/s`, and rolls on for `art.rebot = 45 m`. After touching the ground it kills any of our men within `art.ample = 0.35 m` of its path. Reload `art.recarrega = 12 s` (or `g.rt`).

**Where.** `fire/feu`, `feuTiradors`, `manShot`, `makeStrip`, `inStrip`, `dieProb`, `hitMen`, `oblAim`, `loadDur`, `startLoad`, `updateMusket`, `updateEnemies`, `enemyVolley`, `updateBayonet`, `updateGuns`; keys `TUNE.mosquet.*`, `TUNE.art.*`, `TUNE.capita.*`.

## 7. Enemy and allied AI (level 10)

Functions `aiTickAll`, `aiUnitTick`, `aiVolley`, `aiGroups`, `aiAvoid`. Active once the tutorial step is 2 or more and until the Austrians retreat. Austrians fight the player and the allied company; the allied company fights the Austrians.

**Target choice.** Among visible groups, the lowest score wins: `distance − flanc (10 if the group shows its flank, angle over 0.9 rad) − feble (4 if under 12 men) − jugador (8 if it is the player)`. Keys `ia.flanc, flancBonus, feble, febleBonus, jugadorBonus`.

**Movement.** Hold distance `u.hold` per regiment (33 m and 35 m for the Austrians, 30 m for the allies; defined in the level). The regiment heads for the target, offset by the angle `u.off` (±0.3 rad) while farther than `hold + ia.holdMarge (8 m)`. It turns at `ia.girMarxa = 0.3 rad/s` while approaching and `enGir × ia.girParat = 0.27 rad/s` once within hold distance. It walks at the ordinary pace (0.823 m/s) only if farther than `hold` and within `ia.tolMarxa = 0.5 rad` of the desired heading. Obstacles: three probe points ahead (5 m and 9 m, 3.2 m to each side, margin 1.2 m) trigger a turn at 0.55 rad/s at 0.6 of ordinary speed; a regiment stuck for over 9 s ignores avoidance for 5 s (`ia.evita`).

**Firing.** Conditions: a target, distance at most `ia.abast = 42 m`, reload finished, `supp <= supMax`, and at least `max(ia.minHomes = 3, ia.minFraccio = 0.3 × target men)` target men inside its strip with a clear line. The aiming timer must then reach `ia.apunta = 2.5 s`. Volley strength: `n = men/20 × (0.7 Austrian, 1.0 French) × (1 − min(0.9, supp))`, same `hitMen` rules and strip opening `enOberta`. Reload `carrega × (0.85 + random × 0.5)` = 15.3 to 24.3 s. A hit on the player kills men with a Louis message; on an allied or Austrian group it kills men and adds `supDescarrega × 0.6` suppression.

**Retreat at 50 %.** In the level tick: when the Austrians' living men fall to `ia.retirada.mitja = 0.5` of their initial total, every Austrian regiment switches to `state = 'retreat'`, turns to face away from the player at 1.2 rad/s (`retirada.gir`), and once within 0.06 rad of that heading walks away at the accelerated pace (1.083 m/s). Retreating regiments no longer fire and are not valid targets. The level is won 7 s after the retreat starts.

**Routing.** `routEnemy` (bayonet) makes all survivors flee at 3.2 to 5.2 m/s for 4 s and marks the regiment as routed.

## 8. Checkpoints and death

**Checkpoint (`tutSnap`).** When a tutorial step starts (its dialog is closed, or its small hint is shown), if the step has no guide sequence and the unit is not in a conversion, turn, automatic manoeuvre, par file, flank turn, alignment or pending command, the game stores a deep copy of the unit (`co`), the enemies, the allies, the guns and the corpses in `TUT.snap`, tagged with the step number. `canRetry()` is true when a snapshot exists for the current step; the menu button "Repetir el pas" and the stuck hint (after 35 s stopped) use it.

**Restore (`snapRestore`).** Replaces the unit, enemies, allies, guns and corpses by the snapshot, clears the pending command, the cannonballs and the effects, and resets `co.lost`. It does **not** reset the score counters `STAT`, so time, orders and losses incurred before the retry still count.

**Death (`deathRetry(msg)`).** Called when the unit touches an obstacle or tree, or is destroyed (men below `level.minMen`, after `mort.destrossadaMs = 2600 ms`). If a checkpoint exists for the current step it is restored, otherwise the level is reset to its start (`reset()`, which keeps tutorial progress but not unit state). A message and Le Jay's "Ho tornem a provar" are shown. `STAT` is only cleared when the level is (re)started from the menu.

## 9. Scoring and ranking

`STAT` accumulates while the game screen is active and the game is neither paused nor in a dialog: `STAT.t` (seconds), `STAT.oSum` (the sum of `orderPct × dt`), `STAT.ord` (orders executed), `STAT.dead` (own men killed), and `STAT.men0` (men at start).

`scoreCalc(n)` gives four parts of `puntuacio.part = 250` points each, 1000 in total:

| Part | Formula |
| --- | --- |
| Time | `250 × lin(STAT.t, ref.t)` |
| Losses | `250 × max(0, 1 − dead / men0)` |
| Orders | `250 × lin(STAT.ord, ref.o)` |
| Average order | `250 × clamp(average / 100, 0, 1)`, average = `oSum / t` |

`lin(v, ref) = clamp( 1 − (v − ref) / (puntuacio.marge × ref) , 0 , 1 )` with `marge = 2`: full points at or below the reference, zero at three times the reference. Each part is rounded separately.

`SCORE_REF` (seconds, orders) per level: 1 (90, 12); 2 (100, 14); 3 (110, 16); 4 (140, 20); 5 (200, 25); 6 (120, 14); 7 (150, 20); 8 (170, 30); 9 (150, 10); 10 (300, 35). Missing levels use (150, 20). The score is displayed when the level is completed (`scoreShow`).

## 10. Verification notes and limits

- Experiments run: the two regression bots (level 8 and level 9 without voice) complete without errors; a seeded, frame-stepped comparison of versions 1.7.7 and 1.7.8 on levels 7 and 10 gave identical states (positions, casualties, suppression, score); the drift steady-state figures come from simulating the update rule alone, not from play.
- Constants still written as literals in code (cosmetic or very local): the bayonet contact distance (1.0 m) and kill probability (0.5), the route speeds of fleeing men, the captain's follow offset (7 m) and smoothing, the "OK" flash time, tooltip pressure thresholds (0.05, 0.2), the 35 s stuck hint, the tolerance 0.003 m that ends an alignment, and Liang-Barsky details.
- Not measured in live play: the effect of `escalf` (cosmetic), and any interaction between level-specific `onVolley` handlers and the rules above.
