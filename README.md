# Rhythm Garden — desktop integration

Rhythm Garden is a four-lane timing game built on the tested standalone rhythm
model. Three seeded gardens each contain four short phrases. Hits are judged
from the application audio clock with visible input calibration, not from
animation frames or Rive events.

The app owns one per-window rhythm model, Canvas2D presentation, audio context,
resize observer, listeners and account-file subscription. Desktop play supports
D/F/J/K; phone play uses four large flower pads. Focus loss closes the current
phrase as a checkpoint and pauses explicitly. Disposal is idempotent.

Save and Open use the signed-in desktop's My files through
`host.storage.mirrorFileContext()`. Checkpoints contain the phrase boundary,
score, combo, judgments, calibration, difficulty and completed tracks. Loading
validates the whole document and begins paused at the saved boundary.

## Current limitation

No authored `rhythm-flowers.riv` is included. The game shows a clearly labeled
procedural garden and retains the `Main` / `Presentation` Rive contract plus an
allowlisted intent boundary. The Rive acceptance gate remains open.
Physical-phone timing, full medal runs, authored music and performance/thermal
evidence also remain open.

## Verification

```sh
npm install --prefix apps/system/rhythm-garden --ignore-scripts
npm run typecheck --prefix apps/system/rhythm-garden
npm test --prefix apps/system/rhythm-garden
node tests/rhythm-garden-browser.test.mjs
CODI_PHONE=1 node tests/rhythm-garden-browser.test.mjs
node tests/rhythm-garden-safety.test.mjs
node tests/rhythm-garden-account.test.mjs
```
