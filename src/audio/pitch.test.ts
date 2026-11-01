// 音高の規則 (v5 T4)。3 案 × 行動の表 (docs/plan/v5-phase2-player.md「音」) と、案 3 (fixed) が v3 の Hz に一致すること
import { describe, expect, it } from 'vitest';
import { makeGrid } from '../core/test-fixtures';
import { cancelMidi, chargeRange, nearestMelodyMidi, pitchFor, PITCH_RULES } from './pitch';
import { midiToHz, pluckSpec } from './pluck';

const grid = makeGrid();
// フィクスチャの phrase 0: noteBeats [0, 1.5, 2, 3, 4, 6]、notePitches [60, 62, 64, 65, 67, 69]

describe('nearestMelodyMidi / cancelMidi', () => {
  it('その拍のフレーズで時刻が最も近い音を返す。フレーズの外 (無い) は null、相殺は +12 か C5', () => {
    expect(nearestMelodyMidi(grid, 0.1)).toBe(60);
    expect(nearestMelodyMidi(grid, 1.8)).toBe(64);
    expect(nearestMelodyMidi(grid, 5.9)).toBe(69);
    expect(nearestMelodyMidi(grid, 999)).toBeNull();
    expect(cancelMidi(grid, 1.8)).toBe(76);
    expect(cancelMidi(grid, 999)).toBe(72);
  });
});

describe('pitchFor', () => {
  it('案 3 fixed は v3 の Hz (表 880 / 裏 440 / 外 110) に一致する', () => {
    expect(midiToHz(pitchFor('attack', 'on', 0, grid, 'fixed'))).toBeCloseTo(pluckSpec('on').hz, 6);
    expect(midiToHz(pitchFor('attack', 'off', 0, grid, 'fixed'))).toBeCloseTo(pluckSpec('off').hz, 6);
    expect(midiToHz(pitchFor('attack', 'miss', 0, grid, 'fixed'))).toBeCloseTo(pluckSpec('miss').hz, 6);
  });

  it('案 1 chord は F マイナーの主和音の音だけ (F / A♭ / C)', () => {
    const chordTones = new Set([0, 3, 8]); // F = 5 を 0 とした半音の位置: F, A♭, C → 5, 8, 0 → (midi - 5) % 12 ∈ {0, 3, 7}
    const isChord = (midi: number) => [0, 3, 7].includes((midi - 5 + 120) % 12);
    for (const [action, cls] of [
      ['attack', 'on'],
      ['attack', 'off'],
      ['attack', 'miss'],
      ['step', 'on'],
      ['step', 'miss'],
      ['riposte', 'on'],
      ['release', 'on'],
    ] as const) {
      expect(isChord(pitchFor(action, cls, 0, grid, 'chord')), `${action} ${cls}`).toBe(true);
    }
    expect(chordTones.size).toBe(3);
    expect(pitchFor('attack', 'on', 0, grid, 'chord')).toBe(77);
    expect(pitchFor('attack', 'off', 0, grid, 'chord')).toBe(72);
    expect(pitchFor('attack', 'miss', 0, grid, 'chord')).toBe(41);
    expect(pitchFor('step', 'on', 0, grid, 'chord')).toBe(72);
    expect(pitchFor('step', 'miss', 0, grid, 'chord')).toBe(68);
    expect(pitchFor('riposte', 'on', 0, grid, 'chord')).toBe(80);
    expect(pitchFor('release', 'on', 0, grid, 'chord')).toBe(53);
  });

  it('案 2 motif は最も近いメロディ音 m を基準にする (m = 64 のとき)', () => {
    const b = 1.8;
    expect(pitchFor('attack', 'on', b, grid, 'motif')).toBe(76);
    expect(pitchFor('attack', 'off', b, grid, 'motif')).toBe(64);
    expect(pitchFor('attack', 'miss', b, grid, 'motif')).toBe(40);
    expect(pitchFor('step', 'on', b, grid, 'motif')).toBe(64);
    expect(pitchFor('step', 'miss', b, grid, 'motif')).toBe(52);
    expect(pitchFor('riposte', 'on', b, grid, 'motif')).toBe(79);
    expect(pitchFor('release', 'on', b, grid, 'motif')).toBe(52);
    // フレーズの外は A♭4 (68) を基準にする
    expect(pitchFor('attack', 'off', 999, grid, 'motif')).toBe(68);
  });

  it('溜めの持続音は 1 オクターブ上がる', () => {
    for (const rule of PITCH_RULES) {
      const r = chargeRange(1.8, grid, rule);
      expect(r.to - r.from).toBe(12);
    }
    expect(chargeRange(1.8, grid, 'chord')).toEqual({ from: 53, to: 65 });
    expect(chargeRange(1.8, grid, 'motif')).toEqual({ from: 52, to: 64 });
    expect(chargeRange(1.8, grid, 'fixed')).toEqual({ from: 57, to: 69 });
  });
});
