# 9e Simulator — Handoff Note

Handoff of the 9e Simulator prototype into the 9e website project. This note describes what the game is, how the code is organised, how to extend it, how to test it, and what remains open.

Snapshot: prototype **v63** (30 October 2026), delivered as `9e-simulator.html`.

## 1. What the game is

A single-player, real-time browser game for practising the foot-drill orders of the *École du soldat* with a unit of the 9e Régiment d'Infanterie Légère.

- The player commands a unit of **20 men** (10 files × 2 ranks), shown from above as circles on a map drawn in the style of a 19th-century British Ordnance Survey 6-inch sheet.
- Orders are given in **two voices**: the preventive command first (for example "Par le flanc droite"), then the executive command ("droite!"). The unit acts only on the executive command.
- Orders can be given with the bottom command panel or, optionally, **spoken aloud in French** (voice mode).
- **Capitaine Le Jay** is the in-game guide. He always addresses the player as "Chasseur".
- Game text is in **Catalan**. Order names stay in **French**. The game refers to the *École du soldat*, not to "the 1791 manual".

### Content

| Mode | Map | Purpose |
|---|---|---|
| Level 1 – *Sortir de la plaça* | 44 × 48 m | Guided tutorial: camera, command panel, Garde à vous, flank turns, marching, accelerated pace, Par file, Sur la droite par file en bataille, Alignement and Fixe. |
| Level 2 – *La porta i la cantonada* | 56 × 50 m | Oblique march through a gate, wheeling in march (Conversion / Tournez), wheeling from the halt (Par peloton), alignment. |
| Level 3 – *Exercici de síntesi* | 84 × 72 m | Unguided practice: oblique through an 8 m gate, a 5 m lane that only admits a column, then form line facing east, aligned, inside the target zone. |
| Free mode (*Mode lliure*) | 150 × 110 m | Open field with every order unlocked, no objective and no collisions. Shows the fatigue bar and the disorder warning. |

Levels 4–12 are shown as locked placeholders.

## 2. Files in this handoff

```
9e-simulator.html          The whole game: HTML, CSS and JavaScript in one file (~570 KB, ~3,300 lines).
                           Avatar images, the regiment logo and the map library are inlined.
HANDOFF.md                 This note.
tests/                     Playwright scripts (see section 6).
```

The only external request is Google Fonts (IM Fell French Canon SC, Alegreya Sans SC, Pinyon Script). Without network access the game falls back to system serif and sans-serif fonts.

### Related documents

- **Order list** (Claude Doc): https://claude.ai/artifact/X6PZR3XE1gg7ALurCzKk2n. It is the source of truth for each order's ID, French command and in-game behaviour. The user writes the behaviour of each order in this document; implementation follows it.

## 3. Running it

Open `9e-simulator.html` in a browser. No build step and no server are required.

Voice mode is different. See section 7: it needs Chrome or Edge, microphone permission and an internet connection, and it works best when the page is served over HTTPS.

Browser storage keys (localStorage):

- `9eSfx2`: sound settings (sound, drum, movement).
- `9eVeu`: voice-mode preference, voice options, and what the game has learned about the player's pronunciation.

## 4. Code map

The game script is organised by section banners (`// ---------- … ----------`). In file order:

| Section | Key identifiers | Notes |
|---|---|---|
| MapKit (map asset library) | `MapKit.A.*`, `MapKit.scene`, `MapKit.paper` | Ordnance Survey-style assets: field, road, wall, fence, hedge, wood, tent, plaza, labels, benchmarks. All units are metres. |
| Scale and constants | `BASE_M`, `STEP` (0.65 m), `FRONT` (0.5 m), `RANK_GAP` (0.325 m), `PACES` | `PACES`: ordinaire 76, accéléré 100, de charge 120 steps per minute. |
| Camera | `cam`, `rot`, `zoom`, `clampCam`, `followCam`, `centreCam` | The camera clamps the **view centre** to the map (with an 80 px margin), so it works at any rotation. Left/right arrows rotate the map, up/down arrows zoom. The compass resets north. |
| Sound | `SFX` | Web Audio synthesis only. There are no audio files. |
| Unit | `makeCo`, `buildMembers`, `co` | `co.state` is one of `parat`, `marxa`, `gir`, `auto` or `conv`. `co.members[]` holds `{rank, file, x, y, h, dx, dy, …}`; `dx`/`dy` are each man's offset from his ideal position. |
| Movement and orders | `setPace`, `halte`, `turn`, `oblique`, `enArriere`, `parFile`, `surLaDroite`, `alignement`, `fixe`, `contremarche`, `startWheel`, `parPelotonEnLigne` | Each function validates state and calls `say()` to write the command above the unit. |
| Disorder | `driftStep`, `wheelDrift`, `jolt`, `disorderRms`, `DESORDRE_REST` | See section 5.3. |
| Fatigue | `updateStamina`, `co.cansament` | 0–100, where 100 means rested. See section 5.3. |
| Tutorial framework | `TUT`, `tutUpdate`, `tutShow`, `tutUnlocked`, `CAM_GUIDE`, `reac` | Each level defines `tutorial.steps`. A step's `unlock` keys decide which orders are visible. |
| Command panel | `FAMILIES`, `ORDERS`, `HALTE`, `buildOrderPanel`, `renderUnitControls`, `fire`, `tickPending` | See section 5.1. |
| Unit card and map block | `buildUnitCard`, `updateInfo`, `buildMapControls`, `buildMini`, `drawMini` | The unit card shows formation, position, state, pace, an Order % bar and (free mode only) an Energy bar. |
| Voice mode | `VOICE`, `voiceProcess`, `vRank`, `vMatch`, `vKey`, `vadTick`, `openVoiceTest`, `openCalib` | See section 7. |
| Levels and screens | `buildLevel1`, `buildLevel2`, `buildLevel3`, `buildFree`, `LEVELS`, `startLevel`, `showScreen`, `checkLevel` | |

## 5. Core systems

### 5.1 Order registry and command panel

Every order is one data entry in `ORDERS`. The panel is generated from this list. An entry looks like this:

```js
{ id: 'FD-04',            // ID from the order list document
  fam: 'gir',             // panel family: pos, mar, gir, conv, form
  k: 'gir',               // tutorial unlock key (order hidden until a step unlocks it)
  fr: 'Par le flanc',
  full: 'Par le flanc {s} – {s}!',   // preventive – executive; {s} = gauche/droite, {o} = pace name
  sides: true, icons: [...], cmdsS: {...},   // or options: [...] for the pace selector
  des: 0.5, shot: true,   // disorder the order generates (internal, see 5.3)
  avail: sd => true | 'reason the order cannot be given now',
  run: sd => turn(sd * Math.PI / 2) }
```

Panel layout:

- **Left — march cross:** oblique left and right, *En avant*, a large red **Halte**, *En arrière*. Next to it is the **pace selector** (Ordinaire / Accéléré / De charge).
- **Centre — families:** Posició, Girs, Conversions and Formacions. Hovering opens a menu of large buttons. Unavailable orders are greyed and their tooltip gives the reason. A badge shows how many orders in the family are currently available.
- **Right — map:** a large minimap with the controls inside it: sound and voice options, voice toggle, zoom, and *Centrar*.

To add an order:

1. Add an entry to `ORDERS` and, if needed, a family to `FAMILIES`.
2. Implement its `run` function.
3. Add its `k` key to the `unlock` list of the tutorial step that teaches it.

The two-voice behaviour, voice recognition and the free mode pick up the new order automatically, provided `full` uses the `"preventive – executive"` form with an en dash.

**Didactic rule:** there are no keyboard shortcuts for orders. The player must recall the French command names. The space bar is used only as a push-to-talk key in voice mode.

### 5.2 Two-voice orders

- `fire(o, arg)` writes the preventive command above the unit, then executes after **`ORDER_DELAY` = 1 s** of game time. The executive command is shown when the order runs.
- While an order is pending, the other buttons are disabled.
- Halte also uses two voices ("Peloton – halte!"). Clicking Halte cancels any other pending order.
- Single-word commands (*Fixe!*, *Contremarche!*) execute immediately.
- If the order is no longer valid when the executive command arrives, it is cancelled with a message.
- The tutorial cues in level 2 were moved earlier to allow for the 1 s delay.

### 5.3 Disorder and fatigue

**Disorder ("Ordre %").**

- **Measure.** Disorder is the RMS of the men's offsets from their ideal positions. `Order % = 100 × (1 − rms / 0.20 m)`.
- **Per-step noise.** Each step adds random noise scaled by the current order's `des` value. Marching uses En avant 0.8, Oblique 1.2 and En arrière 0.6. The pace multiplies this: ordinaire ×1, accéléré ×1.5, de charge ×2.2.
- **Pivots.** Par peloton (`des` 2.2) and Conversion (2.0) add more noise the further a man is from the pivot. Tournez (3.6) adds the most.
- **One-off jolts.** Orders marked `shot` apply a single jolt: flank turns, demi-tour, par file, contremarche.
- **Column.** Marching in column produces half the disorder of line (`COLUMN_DES` = 0.5).
- **Recovery.** The men return 1.2 % towards their place per step (`DESORDRE_REST`). The Alignement order removes disorder entirely: the guide steps out **half a pace** and the others align on him.
- **Victory condition.** A level is won only with rms below 0.03 m (about 85 %), so the player must align at the end.
- **Warning.** In free mode, Le Jay warns when the order drops below 25 %.

**Fatigue.**

- `co.cansament` (0–100) rises at rest (+1.5 %/s).
- It falls very slowly at attention (−0.05 %/s).
- Marching costs −0.5 %/s at ordinary pace, multiplied by the pace factor. Marching in column costs 60 % of marching in line (`COLUMN_EN`).
- It is shown only in free mode and has no gameplay effect yet.

### 5.4 Tutorial framework

- **Step fields.** A level's `tutorial.steps[]` entries may define `title`, `text` (a string or several pages), `hl` (IDs to highlight), `unlock` (order keys), `done()`, `when()` (delays the dialog), `cue()` (a short in-game prompt from Le Jay, such as "Ara! Halte!"), `enter()`, `guide` (the camera micro-tutorial) and `pose` (Le Jay's illustration).
- **Level options.** `tutorial.startAtencio`, `resetStep` and `gardeStep` control what happens after a collision reset.
- **Hidden orders.** Orders whose `k` key has not been unlocked are hidden from the panel and are not recognised by voice.

## 6. Tests

These are Playwright scripts. Each one opens `../9e-simulator.html` by default; set the `GAME` environment variable to test another URL or file.

```
cd tests
node level1.playthrough.js      # real-time run of the level 1 tutorial using two-voice orders (about 3 minutes); expects "H [ 'show', 0 ]"
node level2.playthrough.js      # real-time run of level 2 following Le Jay's cues (about 3 minutes); expects end: 'show'
node level3.playthrough.js      # fast simulated run of level 3; expects the final line to end with "show"
node two-voice-orders.test.js   # every order changes nothing before the executive command and executes on it
node voice-matching.test.js     # voice matcher against typed transcripts, including mispronunciations
node voice-halte.test.js        # Peloton – halte! variants
```

Requirement: `npm i playwright` with a Chromium browser installed.

In the voice tests, lines marked `--` are expected cases where nothing should happen: a preventive command alone, noise, and an unavailable order. The `peloton à l'arrêt` case in `voice-halte.test.js` also fails at present: the preventive is recognised but "à l'arrêt" is not accepted as the executive command.

## 7. Voice mode

The voice toggle is the **Veu** button inside the minimap. The options are in the sound menu next to it.

- **Recognition.** The game uses the browser's Web Speech API in `fr-FR`. It works in **Chrome and Edge**. Firefox has no support and Safari is unreliable. Chrome sends audio to Google's service, so an **internet connection** is required. The browser asks for **microphone permission**.
- **Microphone test.** The first time voice mode is enabled, a test asks the player to say "En avant". If it fails, the player can retry, do the test with the manual controls, or skip it.
- **Matching.** Each recognised phrase is scored against every order the player has already learned. Scoring uses a simplified French phonetic key with edit distance, gives credit for how much of the phrase it explains, and weights orders by the situation (for example Halte while marching) and by whether they are currently available. The best match must exceed a threshold and beat the second-best order by a margin.
- **Executive command.**
  - **By word:** the recogniser hears "marche", "halte", "droite"… One-breath commands ("en avant marche") also work.
  - **By volume** (default): after the preventive command and a short pause, any short loud shout executes the order. The trigger uses an adaptive noise floor (`vadTick`). The recogniser's later echo of the word is ignored.
  - **Timeout:** a preventive command expires after 6 s without an executive command.
- **Listening modes.**
  - **Continuous:** restarts automatically whenever Chrome stops listening.
  - **Push-to-talk:** listens only while the player holds the pill button or the space bar.
- **Learning.**
  - **One-click correction:** when a phrase is not understood, the status pill offers the three most likely orders. Clicking one executes it and stores the phrase.
  - **Calibration ("Sala d'instrucció"):** the player says each learned command once, and the game stores how they pronounce it. It refuses to learn a pronunciation that resembles a different order.
  - **Storage:** everything learned is kept in localStorage and can be exported, imported or forgotten.
- **Voice log.** An optional panel lists what the browser heard, the alternatives, the top three candidate orders with scores, and the action taken. Use it to diagnose recognition problems.
- **Shared dictionary across players.** `vShareInit` and `vShare` write learned pronunciations to a shared `aliases` collection. They currently target the claude.ai artifact database (`window.claude.use('db')`) and stay inactive anywhere else. To enable a shared dictionary on the 9e website, replace these two functions with calls to the site's own backend (for example a Supabase table `aliases(kind, h, key, n, at)` with public read and rate-limited insert).

Known state: the voice pipeline has been verified only with simulated transcripts and a simulated microphone. The user reported that real-world recognition of Halte was unreliable, which prompted the improvements listed above. They still need real testing in Chrome with the voice log enabled.

### Hosting notes for the website

- Serve the page over **HTTPS**. Microphone permission is then remembered per site, whereas on `file://` it is asked for again on every visit.
- If the page is embedded in an `<iframe>`, the frame needs `allow="microphone"`.
- The page has no build step and no dependencies to bundle. It can be served as a static file, for example `/simulator/index.html`.
- The visual style (colour tokens such as `--bleu`, `--ecarlate`, `--chasseur`, `--sheet`, `--paper`, and the fonts) was designed to match the 9e uniform guide website. Align the tokens with the site's stylesheet if they have diverged.

## 8. Open items and backlog

1. **Real voice testing** in Chrome with the voice log, then tuning of the thresholds:
   - acceptance score: 0.62 for final results, 0.8 for interim results;
   - margin over the second-best order: 0.04;
   - executive-by-volume trigger: 5 × the noise floor, at least 0.03 RMS;
   - pause before an executive can trigger: 220 ms.
2. **Shared pronunciation dictionary** on the website backend (see section 7).
3. **Halte during Par file** is currently refused until the column has finished turning. Decide whether it should be queued instead.
4. **Orders still "To be defined"** in the order document: musket handling (MD/HM), loading and firing (LD/LS/FI/TF), skirmishers (SK), rank operations (RK/IN), and file manoeuvres (FA). Each needs its behaviour written in the document before implementation.
5. **Untaught orders.** *En place – Repos!*, *Par peloton en ligne* (WH-04) and *Contremarche* are implemented but not yet taught in any level, so they are hidden outside free mode.
6. **Levels 4–12.** Planned progression toward the full design: a company of 80 men, an AI opponent, and increasing difficulty.
7. **Fatigue** has no gameplay effect yet. One possibility is to raise disorder or slow the pace when energy is low.
8. **Deferred options:** map labels kept upright when the map is rotated; an "orient map to unit heading" camera mode; a timer or score.

## 9. Working conventions agreed with the user

- In-game text is in Catalan, informal, and Le Jay calls the player "Chasseur". Order names stay in French. The game refers to the *École du soldat*.
- Anything written outside the chat (documents, tickets, design files) is in formal English.
- Dialogs are short. Long tutorial texts are split into pages with a "Següent" button. The camera tutorial is a guided, one-instruction-at-a-time sequence.
- No keyboard shortcuts for orders, because the game is meant to teach. The arrow keys control only the camera.
- Each order's in-game behaviour is first written by the user in the order list document, then implemented.
