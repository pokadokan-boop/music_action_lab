// v3 の完了条件 (docs/plan/v3-phase1.md): 実物の振り付け v3.json と曲の拍グリッドで、初期位置に立ったまま
// 接触の前後に向きを合わせた押下を置けば dash と laser が相殺され、HP が減らないこと。Chrome の自動操作タブは描画が間引かれて
// 時刻の検証に使えない (docs/plan/v2-phase1.md 完了記録の注意) ので、ここで sim を直接回して確かめる
import { Midi } from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { attackMotion, contactBeat, incomingDir, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';

const root = resolve(__dirname, '..', '..');
const choreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v3.json'), 'utf8')) as Choreo;
const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
const deps: SimDeps = { choreo, grid, cfg: config, acceptance };
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
const dt = config.fixedDt;
const msBeat = (ms: number) => ms / 1000 / grid.beatSec;

// 「次の step で beat が target に達する」直前まで進める
function runUntil(state: SimState, target: number): void {
  while ((state.t + dt) / grid.beatSec < target) step(state, stay, dt, deps);
}

// 予告が始まった後の解決済みの攻撃と、立ったままの接触拍
function resolvedAndContact(state: SimState, idx: number) {
  const atk = effectiveChoreo(state, choreo).attacks[idx];
  const motion = attackMotion(choreo, atk);
  const c = contactBeat(atk, state.player, grid.beatSec, config, motion);
  expect(c, `attack ${idx} は立ったままだと当たる`).not.toBeNull();
  return { atk, motion, c: c! };
}

function pressFacingIncoming(state: SimState, idx: number, offsetMs: number, flip = false): { c: number } {
  const atkBefore = choreo.attacks[idx];
  runUntil(state, atkBefore.telegraphBeat + 0.05);
  const { atk, motion, c } = resolvedAndContact(state, idx);
  runUntil(state, c + msBeat(offsetMs));
  const inc = incomingDir(atk, c, state.player, grid.beatSec, config, motion);
  const sign = flip ? 1 : -1;
  step(state, { move: { x: sign * inc.x, y: sign * inc.y }, attackPressed: true }, dt, deps);
  return { c };
}

describe('v3.json で立ったまま相殺できる', () => {
  const cancelable = choreo.attacks.map((a, i) => ({ a, i })).filter(({ a }) => !a.uncancelable);

  it('相殺できる攻撃は laser と dash の 5 つ、burst は 3 つとも uncancelable', () => {
    expect(cancelable.map(({ a }) => a.type)).toEqual(['laser', 'dash', 'laser', 'dash', 'laser']);
    expect(choreo.attacks.filter((a) => a.uncancelable).map((a) => a.type)).toEqual(['burst', 'burst', 'burst']);
  });

  it.each(cancelable.map(({ i }) => i))('攻撃 %i: 接触の 60 ms 前に来る方向の逆を向いて押すと相殺され、その攻撃では被弾しない', (idx) => {
    const state = createSim(deps);
    const { c } = pressFacingIncoming(state, idx, -60);
    expect(state.cancelled.has(idx)).toBe(true);
    runUntil(state, c + 0.6);
    expect(state.damagedBy.has(idx)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'damage' && e.attackIndex === idx)).toHaveLength(0);
  });

  it('dash (攻撃 2): 接触の 30 ms 後の押下でも相殺され、受けた被弾は取り消される', () => {
    const state = createSim(deps);
    const hpBefore = () => state.player.hp;
    runUntil(state, choreo.attacks[2].telegraphBeat + 0.05);
    const { atk, motion, c } = resolvedAndContact(state, 2);
    runUntil(state, c + msBeat(30));
    const hp0 = hpBefore();
    expect(state.damagedBy.has(2)).toBe(true);
    const inc = incomingDir(atk, c, state.player, grid.beatSec, config, motion);
    step(state, { move: { x: -inc.x, y: -inc.y }, attackPressed: true }, dt, deps);
    expect(state.cancelled.has(2)).toBe(true);
    expect(state.player.hp).toBe(hp0 + 1);
    expect(state.log.events.filter((e) => e.kind === 'damage-undone' && e.attackIndex === 2)).toHaveLength(1);
  });

  it('dash (攻撃 2): 来る方向と同じ向き (背を向ける) では向き違いで相殺されず、被弾する', () => {
    const state = createSim(deps);
    const { c } = pressFacingIncoming(state, 2, -60, true);
    expect(state.cancelled.has(2)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'cancel-miss' && e.attackIndex === 2)[0]).toMatchObject({ reason: 'angle' });
    runUntil(state, c + 0.6);
    expect(state.damagedBy.has(2)).toBe(true);
  });

  it('laser (攻撃 0): 接触の 150 ms 前は窓の外 (timing) で被弾する', () => {
    const state = createSim(deps);
    const { c } = pressFacingIncoming(state, 0, -150);
    expect(state.cancelled.has(0)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'cancel-miss' && e.attackIndex === 0)[0]).toMatchObject({ reason: 'timing' });
    runUntil(state, c + 0.6);
    expect(state.damagedBy.has(0)).toBe(true);
  });

  it('dash の接触は突進の終点の拍 (18.5) の少し前で、予告の輪の収束 (cancelAnchorBeat) と 0.1 拍以内', () => {
    const state = createSim(deps);
    runUntil(state, choreo.attacks[2].telegraphBeat + 0.05);
    const { c } = resolvedAndContact(state, 2);
    expect(c).toBeGreaterThan(18.3);
    expect(c).toBeLessThanOrEqual(18.5);
  });
});
