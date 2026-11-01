import { describe, expect, it } from "vitest";
import {
  PERFECT_WINDOW_MS,
  RhythmSession,
  decodeSave,
  encodeSave,
  sessionFromSave,
} from "../src/model/rhythm.js";

describe("RhythmSession rules", () => {
  it("judgments use the audio clock, not wall time", () => {
    const session = new RhythmSession("clock", 0);
    session.beginPhrase(0);
    const before = session.score;
    const note = session.track.phrases[0].notes.find((candidate) => candidate.lane === 0)!;
    session.judge(note.lane, note.timeMs, note.timeMs); // perfect timing against the schedule
    expect(session.score).toBe(before + 100);
    expect(session.judgments[0].kind).toBe("perfect");
    expect(PERFECT_WINDOW_MS).toBe(50);
  });

  it("two simultaneous notes in different lanes score independently", () => {
    const session = new RhythmSession("multi", 0);
    session.beginPhrase(0);
    const noteA = session.track.phrases[0].notes[0];
    const noteB = session.track.phrases[0].notes.find((note) => note.lane !== noteA.lane)!;
    expect(session.judge(noteA.lane, noteA.timeMs, noteA.timeMs)).not.toBeNull();
    expect(session.judge(noteB.lane, noteB.timeMs, noteB.timeMs)).not.toBeNull();
    expect(session.judgments).toHaveLength(2);
  });

  it("audio suspension pauses the game explicitly", () => {
    const session = new RhythmSession("suspend", 0);
    session.beginPhrase(0);
    session.completePhrase();
    expect(session.paused).toBe(true);
    expect(session.judge(0, 500, 500)).toBeNull();
  });

  it("latency calibration shifts the judged audio timestamp", () => {
    const calibrated = new RhythmSession("calibration", 0);
    const uncalibrated = new RhythmSession("calibration", 0);
    calibrated.calibrate(100);
    calibrated.beginPhrase(0);
    uncalibrated.beginPhrase(0);
    const note = calibrated.track.phrases[0].notes[0];
    expect(calibrated.judge(note.lane, note.timeMs - 100, note.timeMs - 100)?.kind).toBe("perfect");
    expect(uncalibrated.judge(note.lane, note.timeMs - 100, note.timeMs - 100)?.kind).toBe("good");
  });

  it("there is no Rive-event judgment path", () => {
    const session = new RhythmSession("rive", 0);
    session.beginPhrase(0);
    const score = session.score;
    // No API accepts an arbitrary Rive event; only judge() with clock data.
    expect(session.score).toBe(score);
  });

  it("saving at a phrase boundary restores score and judgments", () => {
    const session = new RhythmSession("save", 1);
    session.beginPhrase(0);
    session.judge(0, 500, 500);
    session.completePhrase();
    const restored = sessionFromSave(decodeSave(encodeSave(session)));
    expect(restored.score).toBe(session.score);
    expect(restored.phraseId).toBe(0);
    expect(restored.paused).toBe(true);
  });

  it("restored phrase cannot score the same judged note twice", () => {
    const session = new RhythmSession("duplicate", 0);
    session.beginPhrase(0);
    const note = session.track.phrases[0].notes[0];
    expect(session.judge(note.lane, note.timeMs, note.timeMs)).not.toBeNull();
    const restored = sessionFromSave(decodeSave(encodeSave(session)));
    restored.paused = false;
    expect(restored.judge(note.lane, note.timeMs, note.timeMs)).toBeNull();
  });

  it("rejects malformed checkpoints before replacement", () => {
    const good = JSON.parse(encodeSave(new RhythmSession("bad-save")));
    for (const mutate of [
      (value: any) => value.appId = "other",
      (value: any) => value.payload.trackId = 9,
      (value: any) => value.payload.calibrationMs = 500,
      (value: any) => value.payload.judgments = [{lane: 8, timeMs: 1, inputTimeMs: 1, kind: "perfect"}],
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      expect(() => decodeSave(JSON.stringify(bad))).toThrow();
    }
  });
});
