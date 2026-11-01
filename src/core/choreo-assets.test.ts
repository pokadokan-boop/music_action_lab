// assets/choreo/*.json が、その曲の拍グリッドで合否条件を満たすこと
import { Midi } from '@tonejs/midi';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { validateChoreo, type Choreo } from './choreo';
import { buildGrid } from './grid';

const root = resolve(__dirname, '..', '..');
const choreoDir = resolve(root, 'assets', 'choreo');
const files = existsSync(choreoDir) ? readdirSync(choreoDir).filter((f) => f.endsWith('.json')) : [];

describe('振り付けデータ', () => {
  it('v5 の 1 本だけ (A と A\' は 2026-10-27、v2 は 2026-10-29、v3 は 2026-10-30、v4 は 2026-11-02 に外した)', () => {
    expect(files.sort()).toEqual(['v5.json']);
  });

  it('v5.json は 17 攻撃で、拍 0 以外の全メロディ音に乗り、同じモチーフには同じ 2 攻撃 (docs/plan/v5-phase2-enemy.md T7)', () => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, 'v5.json'), 'utf8')) as Choreo;
    const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
    expect(choreo.attacks).toHaveLength(17);
    const noteBeats = grid.phrases.flatMap((p) => p.noteBeats).filter((b) => b !== 0);
    expect(choreo.attacks.map((a) => a.hitBeat).sort((a, b) => a - b)).toEqual(noteBeats);
    const byPhrase = (i: number) => choreo.attacks.filter((a) => a.phrase === i).sort((a, b) => a.hitBeat - b.hitBeat).map((a) => a.type);
    expect(byPhrase(0)).toEqual(['dash']);
    for (const i of [3, 6]) expect(byPhrase(i)).toEqual(['shot', 'dash']);
    for (const i of [1, 4, 7]) expect(byPhrase(i)).toEqual(['shot', 'laser']);
    for (const i of [2, 5, 8]) expect(byPhrase(i)).toEqual(['laser', 'burst']);
    expect(choreo.attacks.filter((a) => a.uncancelable).map((a) => a.type)).toEqual(['burst', 'burst', 'burst']);
    expect(choreo.attacks.filter((a) => a.chained)).toHaveLength(8);
    expect(choreo.attacks.some((a) => a.after)).toBe(false);
  });

  it.each(files)('%s は合否条件を満たす', (file) => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, file), 'utf8')) as Choreo;
    const midi = new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`)));
    const grid = buildGrid(midi);
    expect(validateChoreo(choreo, grid, acceptance, config)).toEqual([]);
    expect(choreo.attacks.length).toBeGreaterThan(0);
  });
});
