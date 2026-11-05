// v6 セッション B (docs/plan/v6-phase2-enemy.md): 大技 slam の当たりの形、片手軽減、両手相殺とジャスト率、反動の配分、吹っ飛びを確かめる。
// 形はテスト用の slam (狙い固定) で、相殺は実物の v6.json の slam (phrase 2、攻撃 3) で見る
import { Midi } from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { attackMotion, contactBeat, hitboxAt, impactBeat, touches, validateChoreo, type Attack, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { createSim, effectiveChoreo, justRate, splitRecoil, step, type InputState, type SimDeps, type SimState } from './sim';
import { makeChoreo, makeGrid } from './test-fixtures';

const dt = config.fixedDt;
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };

function slamAttack(over: Partial<Attack> = {}): Attack {
  return {
    phrase: 1,
    type: 'slam',
    telegraphBeat: 8,
    hitBeat: 10.5,
    activeBeats: 0.5,
    frameHalf: 0.3,
    laserR: 0.04,
    path: [
      { beat: 8, x: 0.7, y: 0.28 },
      { beat: 8.25, x: 0.5, y: 0.28 },
      { beat: 10.5, x: 0.5, y: 0.28 },
    ],
    hitbox: { shape: 'circle', r: 0.16 },
    ...over,
  };
}

describe('slam の当たりの形 (T4)', () => {
  const grid = makeGrid();
  const atk = slamAttack();
  const h = hitboxAt(atk, impactBeat(atk) + 0.1, grid.beatSec, config)!;
  const c = { x: 0.5, y: 0.28 };
  const r = config.playerRadius;

  it('円 1 つ + 4 辺の group。円の中は当たり、帯 (円の外・枠の内側) は当たらず、辺の上は当たり、枠の外は当たらない', () => {
    expect(h.kind).toBe('group');
    expect(h.kind === 'group' && h.parts).toHaveLength(5);
    expect(touches(c, h, r)).toBe(true);
    expect(touches({ x: c.x + 0.22, y: c.y }, h, r)).toBe(false);
    expect(touches({ x: c.x + 0.3, y: c.y }, h, r)).toBe(true);
    expect(touches({ x: c.x + 0.3, y: c.y + 0.3 }, h, r)).toBe(true); // 隅
    expect(touches({ x: c.x + 0.4, y: c.y }, h, r)).toBe(false);
    // 帯に立っていれば接触拍は無い
    expect(contactBeat(atk, { x: c.x + 0.22, y: c.y }, grid.beatSec, config)).toBeNull();
    expect(contactBeat(atk, c, grid.beatSec, config)).toBeCloseTo(impactBeat(atk), 9);
  });

  it('検査 slam-shape: frameHalf が円 + 辺の太さより小さいと違反、無ければ違反', () => {
    const ok = validateChoreo(makeChoreo([slamAttack()]), grid, acceptance, config).filter((v) => v.rule === 'slam-shape');
    expect(ok).toEqual([]);
    const bad = validateChoreo(makeChoreo([slamAttack({ frameHalf: 0.19 })]), grid, acceptance, config).filter((v) => v.rule === 'slam-shape');
    expect(bad).toHaveLength(1);
    const missing = validateChoreo(makeChoreo([slamAttack({ frameHalf: undefined, laserR: undefined })]), grid, acceptance, config).filter(
      (v) => v.rule === 'slam-shape',
    );
    expect(missing).toHaveLength(1);
  });
});

describe('ジャスト率と反動の配分 (純粋関数)', () => {
  it('justRate: 基準で 1、早い側の端で 0、遅い側の端で 0、外は 0、幅 0 の側はぴったりだけ 1', () => {
    expect(justRate(10, 10, 0.2, 0.1)).toBe(1);
    expect(justRate(9.9, 10, 0.2, 0.1)).toBeCloseTo(0.5, 9);
    expect(justRate(9.8, 10, 0.2, 0.1)).toBeCloseTo(0, 9);
    expect(justRate(10.05, 10, 0.2, 0.1)).toBeCloseTo(0.5, 9);
    expect(justRate(10.2, 10, 0.2, 0.1)).toBe(0);
    expect(justRate(10, 10, 0, 0)).toBe(1);
    expect(justRate(10.01, 10, 0.2, 0)).toBe(0);
  });

  it('splitRecoil: 総量は変わらず、敵 j / (R + j)、自機 R / (R + j)。R + j = 0 なら敵 0 自機 全部', () => {
    const a = splitRecoil(0.2, 1, 0.5);
    expect(a.enemy).toBeCloseTo(0.2 * (1 / 1.5), 9);
    expect(a.player).toBeCloseTo(0.2 * (0.5 / 1.5), 9);
    expect(a.enemy + a.player).toBeCloseTo(0.2, 9);
    expect(splitRecoil(0.2, 0, 0.5)).toEqual({ enemy: 0, player: 0.2 });
    expect(splitRecoil(0.2, 0, 0)).toEqual({ enemy: 0, player: 0.2 });
    expect(splitRecoil(0.2, 1, 0)).toEqual({ enemy: 0.2, player: 0 });
  });
});

// 実物の v6.json の slam (phrase 2、攻撃 3)。立ったまま (自機狙いなので円の中心に自機がいる)
const root = resolve(__dirname, '..', '..');
const choreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v6.json'), 'utf8')) as Choreo;
const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
const deps: SimDeps = { choreo, grid, cfg: config, acceptance };
const SLAM_P2 = 3;
const msBeat = (ms: number) => ms / 1000 / grid.beatSec;
const right: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
const left: InputState = { move: { x: 0, y: 0 }, attackPressed: false, attackLeftPressed: true };
const both: InputState = { move: { x: 0, y: 0 }, attackPressed: true, attackLeftPressed: true };

function runUntil(state: SimState, target: number, input: InputState = stay): void {
  while ((state.t + dt) / grid.beatSec < target) step(state, input, dt, deps);
}

// 予告が始まった後の接触拍 (立ったまま = 円の中心なので当たりの発生拍)
function slamContact(state: SimState): number {
  runUntil(state, choreo.attacks[SLAM_P2].telegraphBeat + 0.05);
  const atk = effectiveChoreo(state, choreo).attacks[SLAM_P2];
  const c = contactBeat(atk, state.player, grid.beatSec, config, attackMotion(choreo, atk));
  expect(c).not.toBeNull();
  expect(c!).toBeCloseTo(impactBeat(atk), 6);
  return c!;
}

describe('大技 slam (T5)。v6.json の phrase 2 (攻撃 3)', () => {
  it('通常攻撃では相殺できず、cancel-miss も記録されない。被弾は 2 で、円の中心から外へ 0.2 吹っ飛び、その間スティックは無視される', () => {
    const state = createSim(deps);
    const c = slamContact(state);
    runUntil(state, c - msBeat(60));
    step(state, right, dt, deps);
    expect(state.cancelled.has(SLAM_P2)).toBe(false);
    expect(state.log.events.filter((e) => (e.kind === 'cancel-miss' || e.kind === 'mitigate') && e.attackIndex === SLAM_P2)).toHaveLength(0);
    const hp0 = state.player.hp;
    // 被弾の step まで 1 step ずつ進め、吹っ飛びが始まった瞬間の位置を取る (その step では位置はまだ動いていない)
    while (!state.knockback && state.beat < c + 0.5) step(state, stay, dt, deps);
    expect(state.damagedBy.has(SLAM_P2)).toBe(true);
    expect(hp0 - state.player.hp).toBeCloseTo(config.slam.damage, 9);
    expect(state.log.events.find((e) => e.kind === 'damage' && e.attackIndex === SLAM_P2)).toMatchObject({ damage: 2, mitigated: false });
    expect(state.knockback).not.toBeNull();
    // 吹っ飛びの間 (0.5 拍)、敵の方へ倒したスティックは無視され、吹っ飛びの向きへ knockback だけ動く
    const p0 = { x: state.player.x, y: state.player.y };
    const dir = state.knockback!.dir;
    const start = state.knockback!.startBeat;
    const toEnemy = { x: Math.sign(state.enemy.x - state.player.x) || 1, y: 0 };
    runUntil(state, start + config.slam.knockbackBeats, { move: toEnemy, attackPressed: false });
    const moved = { x: state.player.x - p0.x, y: state.player.y - p0.y };
    const along = moved.x * dir.x + moved.y * dir.y;
    const across = Math.abs(moved.x * dir.y - moved.y * dir.x);
    expect(along).toBeGreaterThan(config.slam.knockback * 0.95);
    expect(along).toBeLessThanOrEqual(config.slam.knockback + 1e-6);
    expect(across).toBeLessThan(1e-6);
    expect(state.knockback).not.toBeNull();
    // 吹っ飛びが終わればスティックが効く
    runUntil(state, start + config.slam.knockbackBeats + 0.1, { move: toEnemy, attackPressed: false });
    expect(state.knockback).toBeNull();
  });

  it('片手の放ちが時刻と向きを満たせば mitigate (相殺しない)。被ダメは 2 × 0.8 = 1.6、吹っ飛びは 0.16', () => {
    const state = createSim(deps);
    const c = slamContact(state);
    // 接触の 1 拍前から右手を押し続け (通常攻撃 1 回 → 溜め)、60 ms 前に離す
    runUntil(state, c - 1);
    runUntil(state, c - msBeat(60), right);
    expect(state.hands.right.charge?.armed).toBe(true);
    step(state, stay, dt, deps);
    expect(state.log.events.filter((e) => e.kind === 'attack').at(-1)).toMatchObject({ action: 'release', hand: 'right' });
    expect(state.cancelled.has(SLAM_P2)).toBe(false);
    expect(state.log.events.find((e) => e.kind === 'mitigate' && e.attackIndex === SLAM_P2)).toMatchObject({ hand: 'right' });
    expect(state.mitigated.has(SLAM_P2)).toBe(true);
    const hp0 = state.player.hp;
    runUntil(state, c + msBeat(20));
    expect(hp0 - state.player.hp).toBeCloseTo(1.6, 9);
    expect(state.log.events.find((e) => e.kind === 'damage' && e.attackIndex === SLAM_P2)).toMatchObject({ damage: 1.6, mitigated: true });
    expect(state.knockback!.distance).toBeCloseTo(0.16, 9);
  });

  it('両手放ち (10 ms 差) が窓の中なら相殺。cancel に double と just、敵の HP が 6 × j 減り、反動は R 0.5 と j で配分される', () => {
    const state = createSim(deps);
    const c = slamContact(state);
    // 接触の 1 拍前から両手を押し続け、右を 70 ms 前、左を 60 ms 前に離す
    runUntil(state, c - 1);
    runUntil(state, c - msBeat(70), both);
    expect(state.hands.right.charge?.armed && state.hands.left.charge?.armed).toBe(true);
    step(state, left, dt, deps);
    const afterRight = state.log.events.filter((e) => e.kind === 'attack').at(-1)!;
    expect(afterRight).toMatchObject({ action: 'release', hand: 'right' });
    expect(afterRight.double).toBeUndefined();
    // 右の放ちは片手の軽減として記録される
    expect(state.log.events.some((e) => e.kind === 'mitigate' && e.attackIndex === SLAM_P2)).toBe(true);
    runUntil(state, c - msBeat(60), left);
    const hpBefore = state.enemy.hp;
    step(state, stay, dt, deps);
    const release = state.log.events.filter((e) => e.kind === 'attack').at(-1)!;
    expect(release).toMatchObject({ action: 'release', hand: 'left', double: true });
    expect(state.cancelled.has(SLAM_P2)).toBe(true);
    const cancel = state.log.events.find((e) => e.kind === 'cancel' && e.attackIndex === SLAM_P2)!;
    expect(cancel).toMatchObject({ double: true, strong: true, hand: 'left' });
    // 押下は当たりの発生拍の約 60 ms 前 → j ≈ 1 − 60 / 100 = 0.4 (step の刻みぶんの誤差を許す)
    const j = cancel.just!;
    expect(j).toBeGreaterThan(0.3);
    expect(j).toBeLessThan(0.5);
    expect(hpBefore - state.enemy.hp).toBeCloseTo(config.damage.release * 2 * j, 9);
    const split = splitRecoil(config.slam.recoil, j, 0.5);
    expect(cancel.recoil!.enemy).toBeCloseTo(split.enemy, 9);
    expect(cancel.recoil!.player).toBeCloseTo(split.player, 9);
    expect(state.knockback!.distance).toBeCloseTo(split.player, 9);
    expect(state.enemyRecoil!.distance).toBeCloseTo(split.enemy, 9);
    // 相殺したので被弾しない。敵の反動は 1 拍で消える
    runUntil(state, c + 1.2);
    expect(state.damagedBy.has(SLAM_P2)).toBe(false);
    expect(state.enemyRecoil).toBeNull();
  });

  it('両手放ちでも窓の外 (150 ms 前) なら相殺されず timing の失敗として記録される', () => {
    const state = createSim(deps);
    const c = slamContact(state);
    runUntil(state, c - 1);
    runUntil(state, c - msBeat(160), both);
    step(state, left, dt, deps);
    runUntil(state, c - msBeat(150), left);
    step(state, stay, dt, deps);
    expect(state.cancelled.has(SLAM_P2)).toBe(false);
    expect(state.log.events.filter((e) => e.kind === 'cancel-miss' && e.attackIndex === SLAM_P2).map((e) => e.reason)).toEqual(['timing', 'timing']);
  });
});
