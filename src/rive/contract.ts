export const RIVE_CONTRACT = Object.freeze({
  asset: "rhythm-flowers.riv",
  artboard: "Main",
  stateMachine: "Presentation",
  properties: Object.freeze(["lane", "energy", "combo"]),
  triggers: Object.freeze(["cue", "hit", "miss", "bloom"]),
  intents: Object.freeze(["pause", "resume"]),
});

export type RiveIntent = typeof RIVE_CONTRACT.intents[number];

export function parseRiveIntent(value: unknown): RiveIntent | null {
  return typeof value === "string" && RIVE_CONTRACT.intents.includes(value as RiveIntent)
    ? value as RiveIntent
    : null;
}
