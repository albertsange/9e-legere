# 9e Simulator: Handoff Note for Claude Code

Snapshot: simulator version **1.8.61** (4 November 2026). This note lets a new Claude Code session continue the work without the previous conversation.

## 1. Repository and deployment

- Repository: `https://github.com/albertsange/9e-legere`, branch `main`.
- The simulator is a single file: `site/simulator/index.html` (HTML, CSS and JavaScript, canvas rendering). English strings live in `site/simulator/i18n/en.json`. Audio is in `site/simulator/audio/`.
- GitHub Pages deploys the site on every push to `main`. Check with `gh run list -L 2`.
- Test and audit tooling: `tools/i18n-audit.mjs`, `test/run_tests.py`, `test/mock-supabase.js`.
- Rules documents: `docs/game-rules.md` (English) and `docs/regles-del-joc.md` (Catalan).

## 2. Standing rules from the owner

1. Chat replies: Catalan, informal, address the owner as "locu", and open every reply with "Val locu, he fet…".
2. Anything written outside the chat (code comments in commits, documents, pull requests, issues, Jira, Confluence, Figma): formal English.
3. **Never push unless the owner explicitly says "puja-la" / "pujala" / "puja-ho".** Stop-hook messages about unpushed commits are not a request to push.
4. Keep credit usage low: small, targeted edits, no broad rewrites.
5. Commit trailers on every commit:
   - `Co-Authored-By: Claude <noreply@anthropic.com>` (use the current model name)
   - the session URL line if the environment provides one.
6. For each version, a test copy is produced for the owner (see section 6).

## 3. Code conventions

- Catalan is the source language in code. Every Catalan UI string needs an entry in `i18n/en.json` (`{catalan: english}`). Dialogue from Capitaine Le Jay needs both the plain form and the form prefixed with `<b>Capità Le Jay:</b> ` (English prefix `<b>Captain Le Jay:</b> `). Save the file with sorted keys, `indent=1`, `ensure_ascii=False` and a trailing newline to keep diffs small.
- Audit translations: `NODE_PATH=/opt/npm-tools/node_modules node tools/i18n-audit.mjs` (add `--json` to write the missing list to `/tmp/audit/miss3.json`). The target is 0 missing.
- `GAME_VERSION` is a constant near line 4858. Bump it on every change.
- `UNLOCK_ALL` (near line 1899) is currently `true` in the published build, so every level is open. Set it back to `false` to restore progressive unlocking.

## 4. Architecture summary

- **Orders**: table `ORDERS` / `ORDER_BY_ID` (for example MA-01 En avant, MA-04 pace with argument ordinari/accelerat/carrega, WH-01 Par peloton, SK-02 deploy, SK-04 Serrez les files, LS-01 load, FI-01..04 fire, CD-06 contremarche). Functions: `fire(o, arg)`, `tickPending`, `HALTE`.
- **Player unit**: global `co` (members, heading, formation). `withCo(c, f)` temporarily swaps `co` so the player's full machinery can drive a second unit (`SWAPPED` flag). Used by the squad system and by the guard.
- **Levels**: `LEVELS` (tutorial levels 1 to 10 and beyond) and `CAMP` (campaign 1, ids `c1n1` to `c1n5`). Each level is a `buildCampaignN()` or `buildLevelN()` function returning an object (map, enemies, tutorial steps, `tick(dt)`, `win`, `objectives`, `minMen`, and so on). Campaign cards use `CAMP_IMG` for cover images (base64 WebP).
- **AI infantry**: `aiUnitTick(u, side, dt)`, `aiGroups`, `aiVolley`, `aiClose`, `aiMove`, `aiRot`, `aiSp` (pace taken from `level.aiPace`). Useful flags: `stay` (hold position), `hold` (range), `onlyPlayer`, `noRetreat`, `state: 'retreat'` with `awayH`, `n0`.
- **Squad system (`SQ`)**: split the player's unit into two squads (the second led by Le Jay), regroup with a progress bar, join or follow when the player is deployed. See `sqBrain`, `sqSlots`, `sqButton`.
- **Tests in a browser**: Playwright is installed (`NODE_PATH=$(npm root -g) node script.js`). Serve `site/simulator` with `python3 -m http.server 8765` and open a copy of `index.html` with `UNLOCK_ALL = true`. Useful jumps: `startLevel('c1n5')`, `TUT.step = 4`.

## 5. Level 5: La Càrrega a Hondschoote (current design)

- Map 230 × 110 m. Palisade line at x = 150 with three openings (y 23–37, 48–62, 73–87); outside the openings the stakes slow the player to 8% speed (`mudK`). Protected zone at (192, 55), radius 12.
- Player starts with **40 men**. Objectives: cross the palisade through an opening; hold the protected zone for 60 s; keep at least 12 men in total (both squads count, `totalMen()`).
- Tutorial steps 0 to 3 teach splitting and regrouping the squads; the battle starts at step 4.
- **British side** (red = British, dark blue with orange edge = Hessian): three line regiments of 40 men on the palisade, two flank regiments, two advance units, one gun.
  - Two **garrisons** (`garrison: true`) stay inside the palisade and counterattack when the player enters.
  - Three small **reserves** (`rsv: true`, 20 men each) stand behind the line.
  - When a regiment loses 50% of its men it retreats to the nearest free reserve, merges with it, and attacks again (`retTo`). If no free reserve remains (garrisons do not count) it withdraws from the map.
- **French side**: three line regiments plus three reserves. When a French regiment loses 50% of its men, a reserve marches to it at the pas de charge and merges (`mergeTo`, `aiMergeStep`).
- AI pace in this level is ordinary (`aiPace: 'ordinari'`); units reload at the start.
- Score reference: `SCORE_REF.c1n5 = { t: 600, o: 30, k: 160 }` (guesses).

## 6. Producing a test copy for the owner

1. Copy `index.html`, set `UNLOCK_ALL = true`.
2. Inline `audio/menu.mp3` by replacing `fetch('audio/menu.mp3')` with a `data:audio/mpeg;base64,...` URI.
3. Insert `window.__I18N_EMBED={en:<contents of en.json>};` right after the first `<script>`.
4. Save as `9e-simulator-<version>-test.html` and deliver it.

## 7. Open items

- A full playthrough of level 5 has not been done; difficulty balance is untested (the crossfire is very lethal).
- Check a reported odd pivot point on conversions after splitting and regrouping the squads. It could not be reproduced; ask the owner for the exact conversion, whether Le Jay or the whole unit turned, and whether the unit was halted or marching.
- Levels 3 and 4 of the campaign (`c1n3`, `c1n4`) have not had a full end-to-end check.
- Update the levels document and the command reference artifact for the squad system and level 5.
- Check that the 33 unit-test expectations in `test/run_tests.py` still hold after the recent changes.
