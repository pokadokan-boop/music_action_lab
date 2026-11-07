// 実物の曲候補が拍グリッドに乗ることを確かめる。音楽的な条件は検査しない (目安であり必須条件ではない)。
// v7 の候補 (4〜6) は形の約束 (docs/plan/v7-phase2-song.md T1) を検査する: 24 小節、lead-high が最初から、melody は 8 分の格子、フレーズは 2 小節以下、段ごとの音数が起伏の形どおり
import { Midi } from '@tonejs/midi';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { buildGrid, type Grid } from './grid';

const dir = resolve(__dirname, '..', '..', 'assets', 'midi');
const files = readdirSync(dir).filter((f) => f.endsWith('.mid'));
const load = (file: string) => new Midi(readFileSync(resolve(dir, file)));

// 段 (8 小節) ごとの melody の音数
function stageCounts(grid: Grid): number[] {
  const stageBeats = 8 * grid.beatsPerBar;
  const counts = [0, 0, 0];
  for (const b of grid.melodyOnsets) counts[Math.min(2, Math.floor(b / stageBeats))]++;
  return counts;
}

describe('曲候補', () => {
  it('1 曲目の候補 3 つと 2 曲目の候補 3 つがある', () => {
    expect(files.sort()).toEqual(['candidate-1.mid', 'candidate-2.mid', 'candidate-3.mid', 'candidate-4.mid', 'candidate-5.mid', 'candidate-6.mid']);
  });

  it.each(files)('%s はグリッドとフレーズを持ち、戦闘シーンの長さを覆う', (file) => {
    const grid = buildGrid(load(file));
    expect(grid.bpm).toBeGreaterThan(0);
    expect(grid.phrases.length).toBeGreaterThanOrEqual(1);
    expect(grid.durationSec).toBeGreaterThanOrEqual(acceptance.sceneSeconds - 1);
  });

  it.each(['candidate-1.mid', 'candidate-2.mid', 'candidate-3.mid'])('%s (v0) は melody / bass / drums の 3 トラック', (file) => {
    expect(load(file).tracks.map((t) => t.name).sort()).toEqual(['bass', 'drums', 'melody']);
  });

  describe('2 曲目の候補 (v7)', () => {
    it.each(['candidate-4.mid', 'candidate-5.mid', 'candidate-6.mid'])('%s は 24 小節・34 秒以上で、lead-high が拍 0 から鳴る', (file) => {
      const midi = load(file);
      const grid = buildGrid(midi);
      expect(midi.tracks.map((t) => t.name).sort()).toEqual(['bass', 'drums', 'lead-high', 'melody']);
      expect(grid.totalBeats).toBe(24 * grid.beatsPerBar);
      expect(grid.durationSec).toBeGreaterThanOrEqual(34);
      const lead = midi.tracks.find((t) => t.name === 'lead-high')!;
      expect(Math.min(...lead.notes.map((n) => n.ticks))).toBe(0);
      // 背景の線は音型を変えない: 2 小節の音型が 12 回そのまま繰り返される
      const ppq = midi.header.ppq;
      const pattern = lead.notes.filter((n) => n.ticks < 8 * ppq).map((n) => [n.ticks % (8 * ppq), n.durationTicks, n.midi].join('/'));
      for (let rep = 1; rep < 12; rep++) {
        const chunk = lead.notes.filter((n) => n.ticks >= rep * 8 * ppq && n.ticks < (rep + 1) * 8 * ppq).map((n) => [n.ticks % (8 * ppq), n.durationTicks, n.midi].join('/'));
        expect(chunk).toEqual(pattern);
      }
    });

    it.each(['candidate-4.mid', 'candidate-5.mid', 'candidate-6.mid'])('%s の melody は 8 分の格子に乗り、フレーズは 2 小節以下', (file) => {
      const grid = buildGrid(load(file));
      for (const b of grid.melodyOnsets) expect(Math.abs(b * 2 - Math.round(b * 2))).toBeLessThan(1e-6);
      for (const p of grid.phrases) expect(p.endBeat - p.startBeat).toBeLessThanOrEqual(2 * grid.beatsPerBar + 1e-9);
    });

    it('段ごとの melody の音数が起伏の形どおり (4 右肩上がり / 5 山型 / 6 段 3 が最大)', () => {
      const c4 = stageCounts(buildGrid(load('candidate-4.mid')));
      expect(c4[0]).toBeLessThan(c4[1]);
      expect(c4[1]).toBeLessThan(c4[2]);
      const c5 = stageCounts(buildGrid(load('candidate-5.mid')));
      expect(c5[1]).toBeGreaterThan(c5[0]);
      expect(c5[1]).toBeGreaterThan(c5[2]);
      expect(c5[2]).toBeLessThan(c5[0]); // 静を挟む
      const c6 = stageCounts(buildGrid(load('candidate-6.mid')));
      expect(c6[2]).toBeGreaterThan(c6[0]);
      expect(c6[2]).toBeGreaterThan(c6[1]);
    });

    it('各段の最後の小節に大技の音型 (短い音が 2 つ以上のあと、拍 2 の長い音) がある', () => {
      for (const file of ['candidate-4.mid', 'candidate-5.mid', 'candidate-6.mid']) {
        const midi = load(file);
        const ppq = midi.header.ppq;
        const melody = midi.tracks.find((t) => t.name === 'melody')!;
        for (const bar of file === 'candidate-5.mid' ? [7, 15, 22] : [7, 15, 23]) {
          const inBar = melody.notes.filter((n) => n.ticks >= bar * 4 * ppq && n.ticks < (bar + 1) * 4 * ppq).sort((a, b) => a.ticks - b.ticks);
          const last = inBar.at(-1)!;
          expect(inBar.length, `${file} 小節 ${bar + 1}`).toBeGreaterThanOrEqual(3);
          expect((last.ticks - bar * 4 * ppq) / ppq, `${file} 小節 ${bar + 1} の長い音`).toBe(2);
          expect(last.durationTicks / ppq).toBeGreaterThanOrEqual(1);
          for (const s of inBar.slice(0, -1)) expect(s.durationTicks / ppq).toBeLessThanOrEqual(0.5);
        }
      }
    });
  });
});
