# Rhythm Garden

**Rhythm-tap game · Rive web runtime + application state · single-player · phone required · flat-screen app**

> Planned design, not implemented or browser-tested. `index.pseudo.mjs` is an explanatory entry point, not a playable game.

## Experience

Tap four animated flowers to a short original rhythm, then watch the garden bloom from your performance.

## What this demonstrates

- Rive character timing and coordinated artboards
- Web Audio scheduling
- Latency calibration and touch precision

## Rules and complete loop

- Four lanes; hits judged against an audio-time schedule with explicit windows.
- Game scoring uses the audio clock plus calibrated input timestamp, not Rive frames or requestAnimationFrame.
- Pause saves progress at a phrase boundary; no promise of sample-exact resume after device audio suspension.

## Bounded polished release

Three short original tracks, practice mode, tap calibration and a visual-only practice option.

- No strobe effects; shape cues supplement color
- Optional reduced-motion static note markers
- Input/audio calibration visible, not hidden compensation

No multiplayer, accounts, server simulation or generic editor is required. Start, rules/help, play/activity, pause, outcome/goal feedback and retry must all be complete. Settings include volume/mute, reduced motion, contrast and game-specific options where meaningful. State changes occur in the game model; animations illustrate them.

## Rive inside this app

Four animated flowers and combo bloom; app owns hit windows and timing. The requested asset is `rhythm-flowers.riv`; it is **not included**. See [RIVE.md](RIVE.md) for the authoring/integration contract. A placeholder or unrelated animated logo does not satisfy this requirement.

## Save behavior

Phrase checkpoint; loading restarts the saved phrase boundary with countdown, not a fictitious continuous audio clock. See [SAVE.md](SAVE.md). Loading starts paused; resume is explicit. Restart and load cancel stale callbacks and any owned AI work.

## Build sequence

Implement the rule loop in [gameplay.pseudo.txt](gameplay.pseudo.txt); bind the exact app lifecycle from [index.pseudo.mjs](index.pseudo.mjs); complete [CONTROLS.md](CONTROLS.md); author/integrate [RIVE.md](RIVE.md); then satisfy [ACCEPTANCE.md](ACCEPTANCE.md). Do not add XR or a 3D engine solely to widen the technology list.

Target wave: **3**. Integrator first reads [AGENTS.md](../../AGENTS.md); do not guess host APIs from symbolic helper names.

Use original/licensed artwork and audio. Keep the scope small enough to polish; expand content only after the release gates pass.
