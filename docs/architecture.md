# How it works

## The night

The shift runs from 22:00 to 06:00. Its length in seconds (`getShiftDuration`) is chosen so that every colleague
has been fired by 06:00: each firing comes sooner than the last,
`interval = firstInterval * acceleration ^ firedCount`, never below `minInterval`.

The night has two set pieces (`BURSTS` in `content.js`):

- **22:00, cold open.** The lamp of the colleague across the desk goes out and three notifications arrive at once,
  so the player is busy from the first seconds and understands what the game is about.
- **02:00, a wave of layoffs.** Two lamps go out together with a second volley, so the middle of the night doesn't sag.

After each volley the regular stream pauses for 3.5 s.

**Difficulty within the night** (`getNightDifficulty`) grows with shift time, linearly. It used to follow the number
of fired colleagues, but firings speed up towards morning, so the last 20% of the night jumped from 0.68 to 1.
The card rate is interpolated as cards per second rather than as an interval; interpolating the interval made the
last hour almost twice as busy. Fog, lamp flicker and sound still follow the firings: that's atmosphere, not difficulty.

## Two meters

- **Performance** grows while the player holds the monitor and drains on its own, faster towards morning.
- **Stress** grows when a notification reaches the hero and drops a little with every dismissed one.

Dismissing a card sometimes spawns a new one in its place (`respawnChance`). From Middle on, some cards are grey
**noise**: harmless if they land, a wasted click if you catch them. The first one of the night gets a one-off callout.

## Endings

| Ending | Trigger |
|---|---|
| Made it to morning | survive until 06:00 and go home |
| Very responsive | Performance hits 0 while you kept dismissing notifications |
| Frozen | Performance hits 0 while you did nothing |
| Out of office | Stress hits 100 |
| Logged off | secret: hold your own lamp once half of the office is gone |

Each ending has two beats: the hero's last notification lands in the scene, then a terminal-style summary with
this night's numbers. Found endings and per-level best scores are kept in `localStorage`.

## Levels

The rules are the same on every level; only the pace changes. `levels.js` defines Junior (`LEVEL_EASIEST`) and
Lead (`LEVEL_HARDEST`), and every level takes values between them by its tier (0, ⅓, ⅔, 1).

| | Junior | Middle | Senior | Lead |
|---|---|---|---|---|
| Performance drain, /s (22:00 → 06:00) | 2 → 6 | 2.7 → 7.3 | 3.3 → 8.7 | 4 → 10 |
| New card every, s | 3 → 1.2 | 2.7 → 1.07 | 2.3 → 0.93 | 2 → 0.8 |
| Flight time, s | 9 → 3.5 | 8.2 → 3.2 | 7.3 → 2.8 | 6.5 → 2.5 |
| Stress per missed card | 8 | 9.3 | 10.7 | 12 |
| Stress decay, /s | 1.5 | 1.33 | 1.17 | 1 |
| Chance of a new card where one was dismissed | 50% | 52% | 53% | 55% |
| Noise share | — | 10% | 20% | 30% |

Surviving a level offers a promotion; losing on Senior or Lead offers a step down.
Tune the numbers in `#debug` → Game / News, then copy them into `levels.js`.

## Rendering choices

- **Fake lamps.** Dozens of point lights would crawl on a phone. Colleagues get an unlit bulb
  (`MeshBasicMaterial`) and an additive light pool on the floor; the only real light with shadows hangs over the hero.
- **Shared geometry and materials.** All desks reuse the same geometries and most materials.
- **Sprites for text.** Firing reasons, hints and notifications are sprites with canvas textures. Notification
  textures are cached per text; firing labels are disposed when they fade out.
- **Render order.** Labels (5) → cards (6) → HOLD TO WORK (10), with `depthTest: false` so nothing in the scene
  can hide a card the player needs to click.
- **Clamped clock.** The game clock only accumulates up to 0.1 s per frame, so time stands still in a hidden tab.

## Camera

During the shift the camera is nearly fixed: ±15° around and ±8° of tilt, no zoom, no pan, because a stray swipe that
missed a card used to wreck the frame. At the start it eases back from wherever the intro orbit left it before the
limits apply. Look around mode and the final screen use a free camera; in Look around its target is kept inside the office.

## Input

Cards are hit-tested in screen pixels with 18 px of padding and dismissed on `pointerdown`: in the 100–200 ms before
`pointerup` a fast card can leave the cursor. The monitor and the lamp use invisible, oversized hit boxes that are
easier to hit with a finger than the meshes themselves.
