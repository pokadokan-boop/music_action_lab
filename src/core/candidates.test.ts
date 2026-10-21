// 実物の曲候補が拍グリッドに乗ることを確かめる。音楽的な条件は検査しない (目安であり必須条件ではない)
import { Midi } from '@tonejs/midi';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { buildGrid } from './grid';

const dir = resolve(__dirname, '..', '..', 'assets', 'midi');
const files = readdirSync(dir).filter((f) => f.endsWith('.mid'));

describe('曲候補', () => {
  it('3 候補がある', () => {
    expect(files.sort()).toEqual(['candidate-1.mid', 'candidate-2.mid', 'candidate-3.mid']);
  });

  it.each(files)('%s はグリッドとフレーズを持ち、戦闘シーンの長さを覆う', (file) => {
    const midi = new Midi(readFileSync(resolve(dir, file)));
    const grid = buildGrid(midi);
    expect(grid.bpm).toBeGreaterThan(0);
    expect(grid.phrases.length).toBeGreaterThanOrEqual(1);
    expect(grid.durationSec).toBeGreaterThanOrEqual(acceptance.sceneSeconds - 1);
    expect(midi.tracks.map((t) => t.name).sort()).toEqual(['bass', 'drums', 'melody']);
  });
});
