import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { GameClock } from './clock';
import { classifyBeat, createSim, step, type InputState, type SimDeps } from './sim';
import { makeChoreo, makeGrid } from './test-fixtures';

const deps: SimDeps = { choreo: makeChoreo(), grid: makeGrid(), cfg: config, acceptance };

// 決め打ちの入力列: 拍ごとに向きを変え、特定の時刻で攻撃する
function scriptedInput(t: number): InputState {
  const phase = Math.floor(t * 2) % 4;
  const move = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ][phase];
  const attackPressed = t % 1 < 0.05 || (t > 4 && t < 4.1);
  return { move, attackPressed };
}

function runScripted(seconds: number) {
  const state = createSim(deps);
  const clock = new GameClock(config.fixedDt);
  for (let i = 0; i < seconds * 60; i++) {
    for (const t of clock.advanceTime(1000 / 60)) step(state, scriptedInput(t), config.fixedDt, deps);
  }
  return state;
}

describe('sim', () => {
  it('同じ入力列なら記録のハッシュが一致する (acceptance.determinism)', () => {
    expect(acceptance.determinism.sameInputSameLogHash).toBe(true);
    const a = runScripted(20);
    const b = runScripted(20);
    expect(a.log.events.length).toBeGreaterThan(0);
    expect(a.log.hash()).toBe(b.log.hash());
  });

  it('sceneSeconds で終了し、以後は進まない', () => {
    const state = runScripted(22);
    expect(state.finished).toBe(true);
    expect(state.t).toBeGreaterThanOrEqual(acceptance.sceneSeconds);
    expect(state.t).toBeLessThan(acceptance.sceneSeconds + 0.02);
  });

  it('プレイヤーは画面内に留まる', () => {
    const state = createSim(deps);
    for (let i = 0; i < 600; i++) step(state, { move: { x: -1, y: -1 }, attackPressed: false }, config.fixedDt, deps);
    expect(state.player.x).toBeCloseTo(config.playerRadius, 9);
    expect(state.player.y).toBeCloseTo(config.playerRadius, 9);
  });

  it('攻撃は押した瞬間だけ記録され、拍の位置で分類される', () => {
    const state = createSim(deps);
    const held: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    for (let i = 0; i < 10; i++) step(state, held, config.fixedDt, deps);
    expect(state.log.events.filter((e) => e.kind === 'attack')).toHaveLength(1);
    expect(state.log.events[0].cls).toBe('on');
  });

  it('射程 + 補正距離の内なら寄せて命中、外なら外れ', () => {
    const near = createSim(deps);
    near.player.x = near.enemy.x - (config.meleeRange + config.rangeAssist * 0.5);
    near.player.y = near.enemy.y;
    step(near, { move: { x: 0, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    expect(near.lastHit).toBe(true);
    expect(near.enemy.hp).toBe(config.enemyHp - 1);
    expect(Math.abs(near.enemy.x - near.player.x)).toBeLessThanOrEqual(config.meleeRange + 1e-9);

    const far = createSim(deps);
    far.player.x = 0.1;
    step(far, { move: { x: 0, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    expect(far.lastHit).toBe(false);
    expect(far.enemy.hp).toBe(config.enemyHp);
  });

  it('当たり範囲に入ると 1 攻撃につき 1 回だけ被弾する', () => {
    const state = createSim(deps);
    // burst (phrase 2) の中心 (0.5, 0.5) に立ち、hitBeat 19 まで進める
    state.player.x = 0.5;
    state.player.y = 0.5;
    const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
    while (state.beat < 19.5) step(state, stay, config.fixedDt, deps);
    expect(state.log.events.filter((e) => e.kind === 'damage' && e.attackIndex === 1)).toHaveLength(1);
    expect(state.player.hp).toBe(config.playerHp - 1);
  });
});

describe('classifyBeat', () => {
  it('表・裏・外を分ける', () => {
    expect(classifyBeat(10.05, 0.125).cls).toBe('on');
    expect(classifyBeat(10.5, 0.125).cls).toBe('off');
    expect(classifyBeat(10.3, 0.125).cls).toBe('miss');
    expect(classifyBeat(9.95, 0.125).offsetBeats).toBeCloseTo(-0.05, 9);
  });
});
