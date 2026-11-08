// v7 T4 (docs/plan/v7-phase2-enemy.md): 大技の相殺規則 (heavy) を slam 以外の型 (laser) に。
// 実物の v7.json の大上段 (小節 7 の締め。heavy の laser、連撃の 3 発目で 1 拍前に狙い直す) で、
// 通常攻撃では相殺できない / 片手の放ちで軽減 / 両手放ちで相殺とダメージ / 被弾 2 と線分から外への吹っ飛び を確かめる
import { Midi } from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { attackMotion, contactBeat, impactBeat, isHeavy, validateChoreo, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';
import { makeChoreo, makeGrid, shotAttack, sweepAttack } from './test-fixtures';

const dt = config.fixedDt;
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
const right: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
const left: InputState = { move: { x: 0, y: 0 }, attackPressed: false, attackLeftPressed: true };
const both: InputState = { move: { x: 0, y: 0 }, attackPressed: true, attackLeftPressed: true };

const root = resolve(__dirname, '..', '..');
const choreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v7.json'), 'utf8')) as Choreo;
const grid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`))));
// 立ったままだと小節 7 までに突きと dash で HP 5 が尽きるので、HP だけ増やす (他の値は既定のまま)
const cfg = { ...config, playerHp: 99 };
const deps: SimDeps = { choreo, grid, cfg, acceptance };
const HEAVY = choreo.attacks.findIndex((a) => a.heavy);
const msBeat = (ms: number) => ms / 1000 / grid.beatSec;

function runUntil(state: SimState, target: number, input: InputState = stay): void {
  while ((state.t + dt) / grid.beatSec < target) step(state, input, dt, deps);
}

// 立ったまま (狙い直しで自機を向くので、線は自機に届く)。接触拍は当たりの発生拍
function heavyContact(state: SimState): number {
  const atk0 = choreo.attacks[HEAVY];
  runUntil(state, (atk0.aimBeat ?? atk0.telegraphBeat) + 0.05);
  const atk = effectiveChoreo(state, choreo).attacks[HEAVY];
  const c = contactBeat(atk, state.player, grid.beatSec, config, attackMotion(choreo, atk));
  expect(c).not.toBeNull();
  expect(c!).toBeCloseTo(impactBeat(atk), 6);
  return c!;
}

describe('isHeavy と検査 heavy-shape', () => {
  it('slam は常に大技、heavy の laser / sweep も大技。shot / dash の heavy は違反', () => {
    const g = makeGrid();
    expect(isHeavy(sweepAttack({ heavy: true }))).toBe(true);
    expect(isHeavy(sweepAttack())).toBe(false);
    expect(isHeavy({ ...shotAttack(), type: 'slam', frameHalf: 0.3, laserR: 0.04 })).toBe(true);
    const ok = validateChoreo(makeChoreo([sweepAttack({ heavy: true })]), g, acceptance, config).filter((v) => v.rule === 'heavy-shape');
    expect(ok).toEqual([]);
    const bad = validateChoreo(makeChoreo([shotAttack({ heavy: true })]), g, acceptance, config).filter((v) => v.rule === 'heavy-shape');
    expect(bad).toHaveLength(1);
  });
});

describe('大上段 (heavy の laser)。v7.json の小節 7 の締め', () => {
  it('v7.json の大技は heavy の laser が 3 つ (小節 7 / 15 / 23)、slam は無い', () => {
    const heavies = choreo.attacks.filter((a) => isHeavy(a));
    expect(heavies.map((a) => a.type)).toEqual(['laser', 'laser', 'laser']);
    expect(heavies.map((a) => a.phrase)).toEqual([7, 15, 23]);
    expect(HEAVY).toBeGreaterThan(0);
  });

  it('通常攻撃では相殺できず cancel-miss も記録されない。被弾は 2 で、線から外へ 0.2 吹っ飛ぶ', () => {
    const state = createSim(deps);
    const c = heavyContact(state);
    runUntil(state, c - msBeat(60));
    step(state, right, dt, deps);
    expect(state.cancelled.has(HEAVY)).toBe(false);
    expect(state.log.events.filter((e) => (e.kind === 'cancel-miss' || e.kind === 'mitigate') && e.attackIndex === HEAVY)).toHaveLength(0);
    const hp0 = state.player.hp;
    while (!state.knockback && state.beat < c + 0.5) step(state, stay, dt, deps);
    expect(state.damagedBy.has(HEAVY)).toBe(true);
    expect(hp0 - state.player.hp).toBeCloseTo(config.slam.damage, 9);
    expect(state.log.events.find((e) => e.kind === 'damage' && e.attackIndex === HEAVY)).toMatchObject({ damage: 2, mitigated: false });
    expect(state.knockback).not.toBeNull();
    expect(state.knockback!.distance).toBeCloseTo(config.slam.knockback, 9);
    // 吹っ飛びの向きは線 (発生点 → 自機の向き) に対して横か、線の上なら射線の向き。どちらでも敵の方 (右) へは飛ばない
    expect(state.knockback!.dir.x).toBeLessThanOrEqual(1e-9);
  });

  it('片手の放ちが時刻と向きを満たせば mitigate (相殺しない)。被ダメは 1.6、吹っ飛びは 0.16', () => {
    const state = createSim(deps);
    const c = heavyContact(state);
    runUntil(state, c - 1);
    runUntil(state, c - msBeat(60), right);
    expect(state.hands.right.charge?.armed).toBe(true);
    step(state, stay, dt, deps);
    expect(state.log.events.filter((e) => e.kind === 'attack').at(-1)).toMatchObject({ action: 'release', hand: 'right' });
    expect(state.cancelled.has(HEAVY)).toBe(false);
    expect(state.mitigated.has(HEAVY)).toBe(true);
    const hp0 = state.player.hp;
    runUntil(state, c + msBeat(20));
    expect(hp0 - state.player.hp).toBeCloseTo(1.6, 9);
    expect(state.knockback!.distance).toBeCloseTo(0.16, 9);
  });

  it('両手放ちが窓の中なら相殺。cancel に double と just、敵の HP が減り、反動は R 0.6 で配分される', () => {
    const state = createSim(deps);
    const c = heavyContact(state);
    runUntil(state, c - 1);
    runUntil(state, c - msBeat(70), both);
    step(state, left, dt, deps);
    runUntil(state, c - msBeat(60), left);
    const hpBefore = state.enemy.hp;
    step(state, stay, dt, deps);
    expect(state.cancelled.has(HEAVY)).toBe(true);
    const cancel = state.log.events.find((e) => e.kind === 'cancel' && e.attackIndex === HEAVY)!;
    expect(cancel).toMatchObject({ double: true, strong: true, hand: 'left' });
    const j = cancel.just!;
    expect(j).toBeGreaterThan(0.5);
    expect(hpBefore - state.enemy.hp).toBeCloseTo(config.damage.release * 2 * j, 9);
    expect(cancel.recoil!.enemy).toBeCloseTo((config.slam.recoil * j) / (0.6 + j), 9);
    runUntil(state, c + 1);
    expect(state.damagedBy.has(HEAVY)).toBe(false);
  });
});
