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
