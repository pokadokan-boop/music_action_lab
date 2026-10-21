// テスト用の小さな Grid と振り付け。実物の MIDI に依存しない
import type { Attack, Choreo } from './choreo';
import type { Grid } from './grid';

export function makeGrid(bpm = 120, bars = 8): Grid {
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const phrases = [];
  for (let i = 0; i < bars / 2; i++) {
    const start = i * 8;
    phrases.push({
      index: i,
      startBeat: start,
      endBeat: start + 8,
      noteBeats: [start, start + 1.5, start + 2, start + 3, start + 4, start + 6],
      notePitches: [60, 62, 64, 65, 67, 69],
    });
  }
  return {
    bpm,
    beatSec: 60 / bpm,
    beatsPerBar,
    totalBeats,
    durationSec: (totalBeats * 60) / bpm,
    melodyOnsets: phrases.flatMap((p) => p.noteBeats),
    phrases,
  };
}

export function dashAttack(over: Partial<Attack> = {}): Attack {
  return {
    phrase: 1,
    type: 'dash',
    telegraphBeat: 8,
    hitBeat: 10,
    activeBeats: 0.25,
    path: [
      { beat: 8, x: 0.75, y: 0.5 },
      { beat: 10, x: 0.3, y: 0.5 },
      { beat: 10.5, x: 0.2, y: 0.5 },
    ],
    hitbox: { shape: 'circle', r: 0.06 },
    ...over,
  };
}

export function burstAttack(over: Partial<Attack> = {}): Attack {
  return {
    phrase: 2,
    type: 'burst',
    telegraphBeat: 16,
    hitBeat: 19,
    activeBeats: 0.25,
    path: [
      { beat: 16, x: 0.2, y: 0.5 },
      { beat: 18, x: 0.5, y: 0.5 },
    ],
    hitbox: { shape: 'circle', r: 0.2 },
    ...over,
  };
}

export function shotAttack(over: Partial<Attack> = {}): Attack {
  return {
    phrase: 3,
    type: 'shot',
    telegraphBeat: 24,
    hitBeat: 26,
    activeBeats: 0,
    path: [
      { beat: 24, x: 0.5, y: 0.5 },
      { beat: 26, x: 0.8, y: 0.3 },
    ],
    hitbox: { shape: 'circle', r: 0.03 },
    target: { x: 0, y: 0.3 },
    ...over,
  };
}

export function makeChoreo(attacks: Attack[] = [dashAttack(), burstAttack(), shotAttack()]): Choreo {
  return { id: 'test', song: 'fixture', intent: 'テスト用', idle: { amplitude: 0.02 }, attacks };
}
