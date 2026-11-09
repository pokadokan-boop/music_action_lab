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
  it('v6 (1 曲目) と v7 (2 曲目) の 2 本 (A と A\' は 2026-10-27、v2 は 2026-10-29、v3 は 2026-10-30、v4 は 2026-11-02、v5 は 2026-11-05 に外した)', () => {
    expect(files.sort()).toEqual(['v6.json', 'v7.json']);
  });

  it('v6.json は 14 攻撃で、拍 0 以外の全メロディ音が hitBeat か大技の予告の始まり (telegraphBeat) に乗り、Z は slam (docs/plan/v6-phase2-enemy.md T6)', () => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, 'v6.json'), 'utf8')) as Choreo;
    const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
    expect(choreo.attacks).toHaveLength(14);
    const noteBeats = grid.phrases.flatMap((p) => p.noteBeats).filter((b) => b !== 0);
    const covered = [...choreo.attacks.map((a) => a.hitBeat), ...choreo.attacks.filter((a) => a.type === 'slam').map((a) => a.telegraphBeat)];
    expect(covered.sort((a, b) => a - b)).toEqual(noteBeats);
    const byPhrase = (i: number) => choreo.attacks.filter((a) => a.phrase === i).sort((a, b) => a.hitBeat - b.hitBeat).map((a) => a.type);
    expect(byPhrase(0)).toEqual(['dash']);
    for (const i of [3, 6]) expect(byPhrase(i)).toEqual(['shot', 'dash']);
    for (const i of [1, 4, 7]) expect(byPhrase(i)).toEqual(['shot', 'laser']);
    for (const i of [2, 5, 8]) expect(byPhrase(i)).toEqual(['slam']);
    expect(choreo.attacks.some((a) => a.uncancelable)).toBe(false);
    expect(choreo.attacks.filter((a) => a.chained)).toHaveLength(5);
    expect(choreo.attacks.some((a) => a.after)).toBe(false);
    expect(choreo.knockbackResist).toBe(0.5);
  });

  it('v7.json は 65 攻撃で、拍 0 以外の全メロディ音 (66 − 1) に hitBeat が乗り、大技は各段の最後の小節の heavy の laser (docs/plan/v7-phase2-enemy.md T4)', () => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, 'v7.json'), 'utf8')) as Choreo;
    const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
    expect(choreo.song).toBe('candidate-4');
    expect(choreo.attacks).toHaveLength(65);
    const noteBeats = grid.phrases.flatMap((p) => p.noteBeats).filter((b) => b !== 0);
    expect(choreo.attacks.map((a) => a.hitBeat).sort((a, b) => a - b)).toEqual(noteBeats);
    // phrase 番号 = 小節番号 (フレーズは 1 小節ずつ)
    for (const a of choreo.attacks) expect(a.phrase).toBe(Math.floor(a.hitBeat / 4));
    const byPhrase = (i: number) => choreo.attacks.filter((a) => a.phrase === i).sort((a, b) => a.hitBeat - b.hitBeat);
    // 大技: 突き 2 / 3 / 4 → 大上段 (heavy)。連撃の 2 発目以降は 1 拍前に狙い直す
    for (const [i, n] of [[7, 2], [15, 3], [23, 4]] as const) {
      const atks = byPhrase(i);
      expect(atks.map((a) => a.type)).toEqual([...Array(n).fill('laser'), 'laser']);
      expect(atks.map((a) => a.heavy ?? false)).toEqual([...Array(n).fill(false), true]);
      expect(new Set(atks.map((a) => a.group)).size).toBe(1);
      expect(atks.slice(1).map((a) => a.hitBeat - a.aimBeat!)).toEqual(Array(n).fill(1));
      expect(atks[0].aimBeat).toBeUndefined();
    }
    // 段ごとの型 (偶数 / 奇数小節)
    expect(byPhrase(0).map((a) => a.type)).toEqual(['laser']);
    expect(byPhrase(2).map((a) => a.type)).toEqual(['laser', 'laser']);
    expect(byPhrase(2)[0].approach).toEqual({ beats: 1, distance: 0.12 });
    expect(byPhrase(1).map((a) => a.type)).toEqual(['dash']);
    expect(byPhrase(8).map((a) => a.type)).toEqual(['laser', 'laser', 'laser']);
    expect(byPhrase(9).map((a) => a.type)).toEqual(['dash', 'sweep']);
    expect(byPhrase(16).map((a) => a.type)).toEqual(['shot', 'shot', 'laser', 'laser']);
    expect(byPhrase(17).map((a) => a.type)).toEqual(['laser', 'laser', 'sweep']);
    expect(choreo.attacks.filter((a) => a.heavy)).toHaveLength(3);
    expect(choreo.attacks.some((a) => a.type === 'slam' || a.uncancelable || a.after)).toBe(false);
    expect(choreo.sceneSeconds).toBe(36);
    expect(choreo.enemyHp).toBe(40);
    expect(choreo.knockbackResist).toBe(0.6);
    // 姿 (T5): 決闘者。動きの名前は全部書いてある
    expect(choreo.figure).toBe('duelist');
    expect(choreo.attacks.every((a) => a.move !== undefined)).toBe(true);
    expect(new Set(choreo.attacks.map((a) => a.move))).toEqual(new Set(['thrust', 'chop', 'heavyChop', 'sweep', 'dash', 'shot']));
  });

  it.each(files)('%s は合否条件を満たす', (file) => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, file), 'utf8')) as Choreo;
    const midi = new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`)));
    const grid = buildGrid(midi);
    expect(validateChoreo(choreo, grid, acceptance, config)).toEqual([]);
    expect(choreo.attacks.length).toBeGreaterThan(0);
  });
});
