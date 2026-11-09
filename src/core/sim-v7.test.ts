// v7 T3 (docs/plan/v7-phase2-enemy.md): sim での狙い直し (aimBeat) と踏み込み (approach)
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';
import { makeChoreo, makeGrid, shotAttack } from './test-fixtures';

const grid = makeGrid();
const dt = config.fixedDt;
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };

function runUntil(state: SimState, deps: SimDeps, beat: number, input: InputState = stay): void {
  while (state.beat < beat - 1e-9) step(state, input, dt, deps);
}

describe('連撃の狙い直し (sim)', () => {
  // 1 発目 24.5 (予告 22.5)、2 発目 26 (予告 24、aimBeat 25.5)。どちらも自機狙いの弾
  const first = shotAttack({ hitBeat: 24.5, telegraphBeat: 22.5, group: 'combo', aim: 'player', path: [{ beat: 22.5, x: 0.9, y: 0.3 }] });
  const second = shotAttack({ hitBeat: 26, telegraphBeat: 24, group: 'combo', aim: 'player', aimBeat: 25, path: [{ beat: 24, x: 0.9, y: 0.3 }] });
  const deps: SimDeps = { choreo: makeChoreo([first, second]), grid, cfg: config, acceptance };

  it('予告開始でその瞬間の位置を暫定で狙い、aimBeat でもう一度その瞬間の位置に狙いを合わせる。1 発目は狙い直さない', () => {
    const state = createSim(deps);
    runUntil(state, deps, 24.05);
    const atTelegraph = { ...state.player };
    const provisional = effectiveChoreo(state, deps.choreo).attacks[1].target!;
    expect(provisional.x).toBeCloseTo(atTelegraph.x, 9);
    expect(provisional.y).toBeCloseTo(atTelegraph.y, 9);
    // 予告の後に下へ歩く
    runUntil(state, deps, 25.05, { move: { x: 0, y: 1 }, attackPressed: false });
    const atAim = { ...state.player };
    expect(atAim.y).toBeGreaterThan(atTelegraph.y + 0.05);
    const reaimed = effectiveChoreo(state, deps.choreo).attacks[1].target!;
    expect(reaimed.y).toBeGreaterThan(provisional.y + 0.05);
    expect(state.reaimed.has(1)).toBe(true);
    expect(state.reaimed.has(0)).toBe(false);
    // 以後は追わない
    runUntil(state, deps, 25.9, { move: { x: 0, y: 1 }, attackPressed: false });
    expect(effectiveChoreo(state, deps.choreo).attacks[1].target).toEqual(reaimed);
    // 1 発目の狙いは予告開始のまま
    const firstTarget = effectiveChoreo(state, deps.choreo).attacks[0].target!;
    expect(firstTarget.y).toBeCloseTo(config.playerStartPos.y, 6);
  });

  it('同じ入力なら狙い直しを含めて記録のハッシュが一致する (決定性)', () => {
    const run = () => {
      const state = createSim(deps);
      runUntil(state, deps, 24.5, { move: { x: 0, y: 1 }, attackPressed: false });
      runUntil(state, deps, 27, { move: { x: -1, y: 0 }, attackPressed: false });
      return state.log.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('踏み込み (sim)', () => {
  it('当たりの 1 拍前から敵が自機へ寄り、当たりの瞬間に間合い (接触距離 × 1.5) の手前で止まる', () => {
    const atk = shotAttack({ aim: 'player', path: [{ beat: 24, x: 0.9, y: 0.28125 }], approach: { beats: 1, distance: 0.8 } });
    const deps: SimDeps = { choreo: makeChoreo([atk]), grid, cfg: config, acceptance };
    const state = createSim(deps);
    runUntil(state, deps, 25.0);
    const before = state.enemy.x;
    runUntil(state, deps, 26.0);
    const keep = (config.playerRadius + config.enemyRadius) * 1.5;
    // 自機は初期位置 (0.25) に立ったまま。敵は 0.9 から 0.25 + keep まで寄る (idle の上下は y だけ)
    expect(before).toBeCloseTo(0.9, 3);
    expect(state.enemy.x).toBeCloseTo(0.25 + keep, 2);
    expect(state.enemy.x).toBeLessThan(0.9);
  });
});

// v7.1 (docs/decisions/v7-feedback.md): 突進の予備動作を固定 (windupFixed) と、前の攻撃の終点に続く (followPrev)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Midi } from '@tonejs/midi';
import { applyFollow, prevInGroup, resolveAttack, validateChoreo, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { dashAttack, sweepAttack } from './test-fixtures';

describe('windupFixed と followPrev (純粋関数)', () => {
  it('windupFixed: 出発 (hitBeat) までの点は動かず、着点以降だけ自機へ平行移動する。無ければ予告の後の点が全部動く (v6 のまま)', () => {
    const base = dashAttack({ aim: 'player', path: [{ beat: 8, x: 0.75, y: 0.28 }, { beat: 9.5, x: 0.6, y: 0.28 }, { beat: 10, x: 0.64, y: 0.28 }, { beat: 10.5, x: 0.3, y: 0.28 }, { beat: 11, x: 0.24, y: 0.28 }] });
    const target = { x: 0.3, y: 0.1 };
    const loose = resolveAttack(base, target, config);
    expect(loose.path[1].y).toBeCloseTo(0.1, 9); // 9.5 の構えの点も動く
    const fixed = resolveAttack({ ...base, windupFixed: true }, target, config);
    expect(fixed.path[1]).toEqual({ beat: 9.5, x: 0.6, y: 0.28 });
    expect(fixed.path[2]).toEqual({ beat: 10, x: 0.64, y: 0.28 });
    expect(fixed.path[3].y).toBeCloseTo(0.1, 9);
    expect(fixed.path[4].x).toBeCloseTo(0.24, 9);
  });

  it('applyFollow: 最初の点を前の終点に合わせ、当たりの窓の終わりまでの点を動かし、戻りの点は動かさない', () => {
    const sw = sweepAttack({ path: [{ beat: 26, x: 0.24, y: 0.28 }, { beat: 26.5, x: 0.24, y: 0.28 }, { beat: 27.5, x: 0.6, y: 0.28 }] });
    const r = applyFollow(sw, { x: 0.1, y: 0.4 }, grid.beatSec, config);
    expect(r.path[0]).toEqual({ beat: 26, x: 0.1, y: 0.4 });
    expect(r.path[1].x).toBeCloseTo(0.1, 9);
    expect(r.path[2]).toEqual({ beat: 27.5, x: 0.6, y: 0.28 });
  });

  it('prevInGroup と検査 follow-shape: group の 2 発目以降だけ', () => {
    const a = dashAttack({ group: 'g' });
    const b = sweepAttack({ group: 'g', followPrev: true });
    const choreo = makeChoreo([a, b]);
    expect(prevInGroup(choreo, 1)).toBe(0);
    expect(prevInGroup(choreo, 0)).toBe(-1);
    expect(validateChoreo(choreo, grid, acceptance, config).filter((v) => v.rule === 'follow-shape')).toEqual([]);
    const bad = validateChoreo(makeChoreo([sweepAttack({ group: 'g', followPrev: true })]), grid, acceptance, config).filter((v) => v.rule === 'follow-shape');
    expect(bad).toHaveLength(1);
  });
});

describe('v7.json の小節 9: 突進 (36) → 薙ぎ払い (38) が着地した場所から出る (sim)', () => {
  const root = resolve(__dirname, '..', '..');
  const choreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v7.json'), 'utf8')) as Choreo;
  const real = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
  const cfg = { ...config, playerHp: 99 };
  const deps: SimDeps = { choreo, grid: real, cfg, acceptance };
  const dashIdx = choreo.attacks.findIndex((a) => a.type === 'dash' && a.hitBeat === 36);
  const sweepIdx = choreo.attacks.findIndex((a) => a.type === 'sweep' && a.hitBeat === 38);

  it('予告 (34) の瞬間に敵の位置が跳ばず、薙ぎ払いの発生点は突進の終点に一致し、戻り先は構えのまま', () => {
    expect(choreo.attacks[dashIdx].windupFixed).toBe(true);
    expect(choreo.attacks[sweepIdx].followPrev).toBe(true);
    const state = createSim(deps);
    // 自機を上へ寄せておく (狙いが開始位置からずれる)
    runUntil(state, deps, 33.9, { move: { x: 0, y: -1 }, attackPressed: false });
    const before = { ...state.enemy };
    runUntil(state, deps, 34.1);
    // 予告開始の前後で敵は跳ばない (idle の上下 0.02 以内)
    expect(Math.abs(state.enemy.x - before.x)).toBeLessThan(0.01);
    expect(Math.abs(state.enemy.y - before.y)).toBeLessThan(0.03);
    runUntil(state, deps, 36.05);
    const eff = effectiveChoreo(state, deps.choreo);
    const dashEnd = eff.attacks[dashIdx].path.at(-1)!;
    const sw = eff.attacks[sweepIdx];
    expect(sw.path[0].x).toBeCloseTo(dashEnd.x, 9);
    expect(sw.path[0].y).toBeCloseTo(dashEnd.y, 9);
    // 戻り先 (最後の点) は JSON のまま
    expect(sw.path.at(-1)).toEqual(choreo.attacks[sweepIdx].path.at(-1));
    // 着地 (37) から薙ぎ払い (38) まで敵はその場にいる
    runUntil(state, deps, 37.2);
    const p1 = { ...state.enemy };
    runUntil(state, deps, 37.9);
    expect(Math.abs(state.enemy.x - p1.x)).toBeLessThan(0.01);
  });
});
