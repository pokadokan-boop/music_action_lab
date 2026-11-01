// v3 の完了条件 (docs/plan/v3-phase1.md) を実物の振り付けで保つ: 曲の拍グリッドで、初期位置に立ったまま接触の前後に向きを合わせた
// 押下を置けば、相殺できる攻撃 (dash / laser / shot) が相殺され、HP が減らないこと。Chrome の自動操作タブは描画が間引かれて
// 時刻の検証に使えない (docs/plan/v2-phase1.md 完了記録の注意) ので、ここで sim を直接回して確かめる。
// v5 (docs/plan/v5-phase2-enemy.md) で振り付けは v5.json (17 攻撃、burst 3 つだけ相殺不可) になった。v4 の分岐の試し (dash の後に止まる) は外した
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
const choreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v5.json'), 'utf8')) as Choreo;
const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
const deps: SimDeps = { choreo, grid, cfg: config, acceptance };
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
const dt = config.fixedDt;
const msBeat = (ms: number) => ms / 1000 / grid.beatSec;
// v5.json の番号: 0 dash (phrase 0) / 1 shot, 2 laser (phrase 1) / 3 laser, 4 burst (phrase 2) / 5 shot, 6 dash (phrase 3) / ...
const DASH_P3 = 6;
const LASER_P1 = 2;

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

describe('v5.json で立ったまま相殺できる (v3 の完了条件を v5 で保つ)', () => {
  const cancelable = choreo.attacks.map((a, i) => ({ a, i })).filter(({ a }) => !a.uncancelable);

  it('相殺できる攻撃は 14 (dash 3, shot 5, laser 6)、burst は 3 つとも uncancelable', () => {
    const count = (t: string) => cancelable.filter(({ a }) => a.type === t).length;
    expect(cancelable).toHaveLength(14);
    expect([count('dash'), count('shot'), count('laser')]).toEqual([3, 5, 6]);
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

  it('dash (phrase 3): 接触の 30 ms 後の押下でも相殺され、受けた被弾は取り消される', () => {
    const state = createSim(deps);
    runUntil(state, choreo.attacks[DASH_P3].telegraphBeat + 0.05);
    const { atk, motion, c } = resolvedAndContact(state, DASH_P3);
    runUntil(state, c + msBeat(30));
    const hp0 = state.player.hp;
    expect(state.damagedBy.has(DASH_P3)).toBe(true);
    const inc = incomingDir(atk, c, state.player, grid.beatSec, config, motion);
    step(state, { move: { x: -inc.x, y: -inc.y }, attackPressed: true }, dt, deps);
    expect(state.cancelled.has(DASH_P3)).toBe(true);
    expect(state.player.hp).toBe(hp0 + 1);
    expect(state.log.events.filter((e) => e.kind === 'damage-undone' && e.attackIndex === DASH_P3)).toHaveLength(1);
  });

  it('dash (phrase 3): 来る方向と同じ向き (背を向ける) では向き違いで相殺されず、被弾する', () => {
    const state = createSim(deps);
    const { c } = pressFacingIncoming(state, DASH_P3, -60, true);
    expect(state.cancelled.has(DASH_P3)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'cancel-miss' && e.attackIndex === DASH_P3)[0]).toMatchObject({ reason: 'angle' });
    runUntil(state, c + 0.6);
    expect(state.damagedBy.has(DASH_P3)).toBe(true);
  });

  it('laser (phrase 1): 接触の 150 ms 前は窓の外 (timing) で被弾する', () => {
    const state = createSim(deps);
    const { c } = pressFacingIncoming(state, LASER_P1, -150);
    expect(state.cancelled.has(LASER_P1)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'cancel-miss' && e.attackIndex === LASER_P1)[0]).toMatchObject({ reason: 'timing' });
    runUntil(state, c + 0.6);
    expect(state.damagedBy.has(LASER_P1)).toBe(true);
  });

  it('dash の接触は突進の終点の拍 (18.5) の少し前で、予告の輪の収束 (cancelAnchorBeat) と 0.1 拍以内', () => {
    const state = createSim(deps);
    runUntil(state, choreo.attacks[DASH_P3].telegraphBeat + 0.05);
    const { c } = resolvedAndContact(state, DASH_P3);
    expect(c).toBeGreaterThan(18.3);
    expect(c).toBeLessThanOrEqual(18.5);
  });
});

describe('v5.json の連なる攻撃 (docs/plan/v5-phase2-enemy.md T6)', () => {
  it('立ったままだと 17 攻撃の全てに被弾する (全てが自機を狙い、予告の重なりで当たりが消えない)', () => {
    const state = createSim(deps);
    // シーンは 20 秒 (46.7 拍) で終わり、以後 step は進まない (runUntil が止まらなくなる) ので、最後の当たり (42.7 拍) の後の 45 拍まで
    runUntil(state, 45);
    expect(state.damagedBy.size).toBe(17);
  });

  it('敵の位置は入れ子の単一キーフレーム (shot / laser) で飛ばない: 6.5 → 8 は同じ点にとどまり、3 → 4 は着地点から laser の始点へ', () => {
    const state = createSim(deps);
    runUntil(state, 7.0);
    const a = { ...state.enemy };
    runUntil(state, 7.9);
    expect(state.enemy.x).toBeCloseTo(a.x, 9);
    // 拍の揺れ (idle) だけが y に乗る
    expect(Math.abs(state.enemy.y - a.y)).toBeLessThan(0.03);
    // 3.5 拍: 自機狙いで平行移動した dash の終点 (path の最後) と laser の始点 (0.3) の間にいる
    const s = createSim(deps);
    runUntil(s, 3.5);
    const dashLast = effectiveChoreo(s, choreo).attacks[0].path.at(-1)!;
    expect(s.enemy.x).toBeGreaterThan(Math.min(dashLast.x, 0.3));
    expect(s.enemy.x).toBeLessThan(Math.max(dashLast.x, 0.3));
  });
});
