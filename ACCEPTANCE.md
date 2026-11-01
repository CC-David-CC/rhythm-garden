# Acceptance — Rhythm Garden

**All runtime cases are NOT RUN.** This file is a plan; document checks are not gameplay evidence.

Apply all C01–C24 in [common acceptance](../../docs/ACCEPTANCE-COMMON.md). No immersive support is claimed or required for this flat-screen app.

## Game-specific cases

| ID | Experiment / invariant | Status |
|---|---|---|
| rhythm-garden-G01 | Rendering stalls do not change judgment time. | not_run |
| rhythm-garden-G02 | Two touch pads can score simultaneous notes independently. | not_run |
| rhythm-garden-G03 | Audio suspension pauses the game explicitly. | not_run |
| rhythm-garden-G04 | Rive event cannot create a hit judgment. | not_run |
| rhythm-garden-G05 | Saved score is restored at documented phrase boundary. | not_run |
| rhythm-garden-G06 | Muted/visual practice remains playable. | not_run |

## Release evidence

Record rules/content and dependency versions, actual asset names/hashes, desktop browser, real phone and (where required) Galaxy XR build, commands/logs, complete-playthrough result, save restoration result, multiwindow/late-disposal behavior, frame timing and unresolved defects. Exercise actual Rive properties and texture input rather than substituting an HTML mock.

A pure rules unit test, a visual smoke test and a hardware XR test are different evidence. Preserve that distinction. All promised features must be demonstrated or explicitly left incomplete; do not relabel a generic engine scene as the finished game.
