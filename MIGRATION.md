# rhythm-garden: source migration, integration pending

Original source: `apps/games/04-rive-interactives/rhythm-garden/` at `4f72ea86928666189b32f6f05c2c697a37341d06`.
Mechanical baseline: `f6c4826d971dd1baaff33ebcf4b8f6fe04191c10`; source tree `6cc18d37cdf19ef8b6d86534139f51b8fe47c99c`.
All 23 current files retain the exact original Git blobs/modes. Owned historical paths, designs and WIP were retained; original complete history and source-to-extracted commit maps remain in private migration recovery. Copied generic helpers/tooling do not make another game's entire history part of this app.

This commit adds only generated-output exclusions and this provenance note. It changes no app behavior. The original host/files/save lifecycle remains source reference and needs a deliberate port to the new assembly. Source presence does not enable this app or establish server-backed save compatibility, agent operations, immersive-session behavior or complete build assets.

Existing configured checks passed in an isolated copy with the original sibling layout. Independent extraction checks are recorded privately. Configured test/typecheck results are recorded separately from browser/host integration.

Dependency locks and tracked artwork/license notices remain authoritative inputs. Third-party dependencies keep their own licenses. Generated artifacts must be built and verified independently; do not copy a production bundle or user documents into this repository.
