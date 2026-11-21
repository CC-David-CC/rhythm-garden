import { Rng } from "./rng.ts";

export const LANE_COUNT = 4;
export const PERFECT_WINDOW_MS = 50;
export const GOOD_WINDOW_MS = 120;
export const PHRASE_COUNT = 4;

export interface Note {
  lane: number;
  timeMs: number;
}

export interface Phrase {
  id: number;
  notes: Note[];
}

export interface Judgment {
  lane: number;
  timeMs: number;
  kind: "perfect" | "good" | "miss";
  inputTimeMs: number;
}

export interface Track {
  id: number;
  phrases: Phrase[];
}

function makeTrack(id: number): Track {
  const rng = new Rng(`track-${id}`);
  return {
    id,
    phrases: Array.from({ length: PHRASE_COUNT }, (_, phraseId) => ({
      id: phraseId,
      notes: Array.from({ length: 6 }, (_, noteId) => ({
        lane: rng.int(LANE_COUNT),
        timeMs: phraseId * 4000 + 500 + noteId * 550,
      })),
    })),
  };
}

export const TRACKS: readonly Track[] = Array.from({ length: 3 }, (_, id) => makeTrack(id));

export interface RhythmSnapshot {
  trackId: number;
  phraseId: number;
  score: number;
  combo: number;
  bestCombo: number;
  judgments: Judgment[];
  calibrationMs: number;
  difficulty: 1 | 2 | 3;
  completed: number[];
  rngState: number;
}

export class RhythmSession {
  readonly rng: Rng;
  trackId = 0;
  phraseId = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  judgments: Judgment[] = [];
  calibrationMs = 0;
  difficulty: 1 | 2 | 3 = 1;
  completed: number[] = [];
  paused = true;
  private audioStartMs = 0;
  private judgedNotes = new Set<number>();

  constructor(seed: string | number = "rhythm-garden", trackId = 0, snapshot?: RhythmSnapshot) {
    this.rng = new Rng(seed);
    this.trackId = trackId;
    if (snapshot !== undefined) this.applySnapshot(snapshot);
  }

  get track(): Track {
    return TRACKS[this.trackId];
  }

  beginPhrase(audioClockMs: number, phraseId = this.phraseId): void {
    this.phraseId = phraseId;
    this.audioStartMs = audioClockMs;
    this.judgedNotes.clear();
    this.paused = false;
  }

  /**
   * Judgments use the audio clock plus calibrated input timestamp only.
   * Rive frames, rAF and wall-clock stalls can never change a judgment.
   */
  judge(lane: number, inputTimeMs: number, audioTimeMs: number): Judgment | null {
    if (this.paused) return null;
    if (lane < 0 || lane >= LANE_COUNT) return null;
    const phrase = this.track.phrases[this.phraseId];
    if (phrase === undefined) return null;
    const note = phrase.notes.find(
      (candidate) => !this.judgedNotes.has(candidate.timeMs) && candidate.lane === lane,
    );
    if (note === undefined) return null;
    const calibratedAudio = audioTimeMs + this.calibrationMs;
    const noteDelta = Math.abs(calibratedAudio - note.timeMs);
    let kind: Judgment["kind"];
    const difficultyScale = this.difficulty === 1 ? 1.2 : this.difficulty === 3 ? 0.8 : 1;
    if (noteDelta <= PERFECT_WINDOW_MS * difficultyScale) kind = "perfect";
    else if (noteDelta <= GOOD_WINDOW_MS * difficultyScale) kind = "good";
    else return null;
    this.judgedNotes.add(note.timeMs);
    const judgment: Judgment = { lane, timeMs: note.timeMs, kind, inputTimeMs };
    this.judgments.push(judgment);
    if (kind === "perfect") this.score += 100;
    else this.score += 50;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    return judgment;
  }

  registerMiss(audioTimeMs: number): void {
    if (this.paused) return;
    const phrase = this.track.phrases[this.phraseId];
    if (phrase === undefined) return;
    const calibratedAudio = audioTimeMs + this.calibrationMs;
    for (const note of phrase.notes) {
      if (this.judgedNotes.has(note.timeMs)) continue;
      if (calibratedAudio > note.timeMs + GOOD_WINDOW_MS) {
        this.judgedNotes.add(note.timeMs);
        this.judgments.push({ lane: note.lane, timeMs: note.timeMs, kind: "miss", inputTimeMs: audioTimeMs });
        this.combo = 0;
      }
    }
  }

  completePhrase(): void {
    const phrase = this.track.phrases[this.phraseId];
    if (phrase === undefined) return;
    for (const note of phrase.notes) {
      if (!this.judgedNotes.has(note.timeMs)) {
        this.judgments.push({ lane: note.lane, timeMs: note.timeMs, kind: "miss", inputTimeMs: -1 });
      }
    }
    this.paused = true; // saves only at phrase boundaries
    if (this.phraseId === PHRASE_COUNT - 1 && !this.completed.includes(this.trackId)) {
      this.completed.push(this.trackId);
    }
  }

  calibrate(offsetMs: number): void {
    this.calibrationMs = Math.min(200, Math.max(-200, offsetMs));
  }

  snapshot(): RhythmSnapshot {
    return {
      trackId: this.trackId,
      phraseId: this.phraseId,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      judgments: this.judgments.map((judgment) => ({ ...judgment })),
      calibrationMs: this.calibrationMs,
      difficulty: this.difficulty,
      completed: [...this.completed],
      rngState: this.rng.getState(),
    };
  }

  applySnapshot(snapshot: RhythmSnapshot): void {
    this.trackId = snapshot.trackId;
    this.phraseId = snapshot.phraseId;
    this.score = snapshot.score;
    this.combo = snapshot.combo;
    this.bestCombo = snapshot.bestCombo;
    this.judgments = snapshot.judgments.map((judgment) => ({ ...judgment }));
    this.calibrationMs = snapshot.calibrationMs;
    this.difficulty = snapshot.difficulty;
    this.completed = [...snapshot.completed];
    this.rng.setState(snapshot.rngState);
    this.judgedNotes.clear();
    const phrase = this.track.phrases[this.phraseId];
    for (const judgment of this.judgments) {
      if (judgment.timeMs >= 0 && phrase?.notes.some(note => note.timeMs === judgment.timeMs)) {
        this.judgedNotes.add(judgment.timeMs);
      }
    }
    this.paused = true;
  }
}

export const SAVE_FORMAT = "ksu.game.save";
export const SAVE_APP_ID = "rhythm-garden";

export class SaveError extends Error {
  constructor(reason: string) {
    super(`rhythm-garden save rejected: ${reason}`);
    this.name = "SaveError";
  }
}

export function encodeSave(session: RhythmSession): string {
  return JSON.stringify({
    format: SAVE_FORMAT, schemaVersion: 1, appId: SAVE_APP_ID, kind: "checkpoint",
    gameBuild: "unbound", contentVersion: "1", payload: session.snapshot(),
  });
}

export function decodeSave(text: string, maxBytes = 8 * 1024 * 1024): { payload: RhythmSnapshot } {
  if (text.length > maxBytes) throw new SaveError("document exceeds the size limit");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new SaveError("document is not valid JSON"); }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.format !== SAVE_FORMAT || envelope.appId !== SAVE_APP_ID) throw new SaveError("wrong envelope");
  const payload = envelope.payload as RhythmSnapshot;
  if (!payload || !Number.isInteger(payload.trackId) || payload.trackId < 0 || payload.trackId >= TRACKS.length ||
      !Number.isInteger(payload.phraseId) || payload.phraseId < 0 || payload.phraseId >= PHRASE_COUNT ||
      !Number.isSafeInteger(payload.score) || payload.score < 0 ||
      !Number.isSafeInteger(payload.combo) || payload.combo < 0 ||
      !Number.isSafeInteger(payload.bestCombo) || payload.bestCombo < payload.combo ||
      !Number.isFinite(payload.calibrationMs) || payload.calibrationMs < -200 || payload.calibrationMs > 200 ||
      ![1, 2, 3].includes(payload.difficulty) ||
      !Array.isArray(payload.completed) || payload.completed.length > TRACKS.length ||
      !payload.completed.every((track: unknown) => typeof track === "number" && Number.isInteger(track) && track >= 0 && track < TRACKS.length) ||
      new Set(payload.completed).size !== payload.completed.length ||
      !Number.isInteger(payload.rngState) || payload.rngState < 0 || payload.rngState > 0xffffffff ||
      !Array.isArray(payload.judgments) || payload.judgments.length > PHRASE_COUNT * 32) {
    throw new SaveError("invalid checkpoint");
  }
  for (const judgment of payload.judgments) {
    if (!judgment || typeof judgment !== "object" ||
        !Number.isInteger(judgment.lane) || judgment.lane < 0 || judgment.lane >= LANE_COUNT ||
        !Number.isFinite(judgment.timeMs) ||
        !Number.isFinite(judgment.inputTimeMs) ||
        !["perfect", "good", "miss"].includes(judgment.kind)) {
      throw new SaveError("invalid judgment");
    }
  }
  return { payload };
}

export function sessionFromSave(envelope: { payload: RhythmSnapshot }): RhythmSession {
  return new RhythmSession("restore", envelope.payload.trackId, envelope.payload);
}
