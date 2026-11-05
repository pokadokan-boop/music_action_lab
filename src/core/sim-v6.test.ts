// v6 セッション A (docs/plan/v6-phase2-hands.md): 両手独立 (右 R1 / 左 L1) と両手放ちの窓を sim を直接回して確かめる。
// 位置と拍はテスト用の Grid (120 BPM、1 拍 0.5 秒)。相殺は実物の v6.json の laser (攻撃 2) で見る
import { Midi } from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { attackMotion, contactBeat, incomingDir, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { armedHands, createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';
import { makeChoreo, makeGrid } from './test-fixtures';

const dt = config.fixedDt;
const grid = makeGrid();
const deps: SimDeps = { choreo: makeChoreo(), grid, cfg: config, acceptance };
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
const right: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
const left: InputState = { move: { x: 0, y: 0 }, attackPressed: false, attackLeftPressed: true };
const both: InputState = { move: { x: 0, y: 0 }, attackPressed: true, attackLeftPressed: true };
const beatsToSteps = (beats: number) => Math.round((beats * grid.beatSec) / dt);

// 回しながら持続音の始まり・終わりの回数を数える
function run(state: SimState, input: InputState, steps: number, d: SimDeps = deps): { begins: number; ends: number } {
  let begins = 0;
  let ends = 0;
  for (let i = 0; i < steps; i++) {
    step(state, input, dt, d);
    if (state.lastChargeBegin) begins++;
    if (state.lastChargeEnd) ends++;
  }
  return { begins, ends };
}

function attacks(state: SimState) {
  return state.log.events.filter((e) => e.kind === 'attack');
}

// 敵の正面 (扇の中、接触距離より少し外) に自機を置く
function nearEnemy(): SimState {
  const state = createSim(deps);
  run(state, stay, 10);
  state.player.x = state.enemy.x - (config.playerRadius + config.enemyRadius) * 1.2;
  state.player.y = state.enemy.y;
  return state;
}

describe('両手独立 (T1)', () => {
  it('左手の押下は左手の通常攻撃 (hand: left)。両手を別々に溜められ、持続音の始まりは最初の手だけ、終わりは最後の手だけ', () => {
    const state = nearEnemy();
    // 右を押して 0.6 拍: 右が溜め状態、持続音が始まる
    const a = run(state, right, beatsToSteps(0.6));
    expect(attacks(state).at(-1)).toMatchObject({ action: 'normal', hand: 'right' });
    expect(state.hands.right.charge?.armed).toBe(true);
    expect(a.begins).toBe(1);
    // 左も押して 0.6 拍: 左も溜め状態になるが、持続音は既に鳴っているので始まりは立たない
    const b = run(state, both, beatsToSteps(0.6));
    expect(attacks(state).at(-1)).toMatchObject({ action: 'normal', hand: 'left' });
    expect(state.hands.left.charge?.armed).toBe(true);
    expect(armedHands(state)).toBe(2);
    expect(b.begins).toBe(0);
    expect(state.log.events.filter((e) => e.kind === 'charge').map((e) => e.hand)).toEqual(['right', 'left']);
    // 右を離す: 右手の放ち。左がまだ溜め中なので持続音は終わらない
    const c = run(state, left, 1);
    expect(attacks(state).at(-1)).toMatchObject({ action: 'release', hand: 'right' });
    expect(state.hands.right.charge).toBeNull();
    expect(c.ends).toBe(0);
    // 左も離す: 左手の放ち。持続音が終わる
    const d = run(state, stay, 1);
    expect(attacks(state).at(-1)).toMatchObject({ action: 'release', hand: 'left' });
    expect(d.ends).toBe(1);
    expect(armedHands(state)).toBe(0);
  });

  it('被弾で両手とも解除され、charge-break が手ごとに 1 件、持続音の終わりは 1 回', () => {
    // v5 のテストと同じ: 自機を dash の終点に置き、予告の間に両手で溜めておく
    const state = createSim(deps);
    run(state, stay, beatsToSteps(8.5));
    state.player.x = 0.3;
    state.player.y = 0.5;
    run(state, both, beatsToSteps(0.7));
    expect(armedHands(state)).toBe(2);
    const r = run(state, both, beatsToSteps(1.2));
    expect(state.damagedBy.has(0)).toBe(true);
    expect(state.hands.right.charge).toBeNull();
    expect(state.hands.left.charge).toBeNull();
    expect(state.log.events.filter((e) => e.kind === 'charge-break').map((e) => e.hand).sort()).toEqual(['left', 'right']);
    expect(r.ends).toBe(1);
    // 離しても放たない
    run(state, stay, 1);
    expect(attacks(state).filter((e) => e.action === 'release')).toHaveLength(0);
  });

  it('attackLeftPressed を省いた入力では左手は何もしない (既存のテストとの互換)', () => {
    const state = nearEnemy();
    run(state, right, beatsToSteps(0.6));
    expect(state.hands.left.charge).toBeNull();
    expect(attacks(state).every((e) => e.hand === 'right')).toBe(true);
  });
});

describe('両手放ちの窓 (T2)', () => {
  // 両手を 0.6 拍溜めてから、右を離し、gapBeats 後に左を離す
  function releasePair(gapBeats: number): SimState {
    const state = nearEnemy();
    run(state, both, beatsToSteps(0.6));
    run(state, left, 1);
    run(state, left, beatsToSteps(gapBeats) - 1);
    run(state, stay, 1);
    return state;
  }

  it('0.2 拍差なら 2 つ目の放ちに double と pairMs (100 ms)。先の放ちには付かない', () => {
    const state = releasePair(0.2);
    const releases = attacks(state).filter((e) => e.action === 'release');
    expect(releases).toHaveLength(2);
    expect(releases[0]).toMatchObject({ hand: 'right' });
    expect(releases[0].double).toBeUndefined();
    expect(releases[1]).toMatchObject({ hand: 'left', double: true });
    expect(releases[1].pairMs).toBeCloseTo(100, 0);
    // 命中も両手放ちの印を持つ (要約の内訳用)
    expect(state.log.events.filter((e) => e.kind === 'hit' && e.action === 'release').map((e) => !!e.double)).toEqual([false, true]);
    expect(state.lastRelease).toBeNull();
  });

  it('0.3 拍差なら付かない (窓は 0.25 拍)', () => {
    const state = releasePair(0.3);
    const releases = attacks(state).filter((e) => e.action === 'release');
    expect(releases).toHaveLength(2);
    expect(releases[1].double).toBeUndefined();
    expect(state.lastRelease).toMatchObject({ hand: 'left' });
  });

  it('同じ手の放ちが続いても両手放ちにならない', () => {
    const state = nearEnemy();
    run(state, right, beatsToSteps(0.6));
    run(state, stay, 1);
    run(state, right, beatsToSteps(0.6));
    run(state, stay, 1);
    const releases = attacks(state).filter((e) => e.action === 'release');
    expect(releases).toHaveLength(2);
    expect(releases.every((e) => !e.double)).toBe(true);
  });
});

// 実物の振り付けで「片手が溜め中でも他方で相殺できる」を見る
const root = resolve(__dirname, '..', '..');
const realChoreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v6.json'), 'utf8')) as Choreo;
const realGrid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${realChoreo.song}.mid`))));
const realDeps: SimDeps = { choreo: realChoreo, grid: realGrid, cfg: config, acceptance };
const msBeatReal = (ms: number) => ms / 1000 / realGrid.beatSec;

function runUntil(state: SimState, target: number, input: InputState = stay): void {
  while ((state.t + dt) / realGrid.beatSec < target) step(state, input, dt, realDeps);
}

describe('片手で溜めながら他方で捌く (T1)。v6.json の laser (攻撃 2)', () => {
  it('左手が溜め中でも右手の押下で相殺でき、左手の溜めは切れない。相殺の記録は右手', () => {
    const state = createSim(realDeps);
    runUntil(state, realChoreo.attacks[2].telegraphBeat + 0.05);
    const atk = effectiveChoreo(state, realChoreo).attacks[2];
    const motion = attackMotion(realChoreo, atk);
    const c = contactBeat(atk, state.player, realGrid.beatSec, config, motion)!;
    const inc = incomingDir(atk, c, state.player, realGrid.beatSec, config, motion);
    const facing = { x: -inc.x, y: -inc.y };
    // 接触の 1 拍前から左手を押し続ける (左手の通常攻撃 1 回のあと溜め)
    runUntil(state, c - 1);
    runUntil(state, c - msBeatReal(60), left);
    expect(state.hands.left.charge?.armed).toBe(true);
    // 右手で来る方向の逆を向いて押す: 相殺
    step(state, { move: facing, attackPressed: true, attackLeftPressed: true }, dt, realDeps);
    expect(state.cancelled.has(2)).toBe(true);
    expect(state.log.events.find((e) => e.kind === 'cancel' && e.attackIndex === 2)).toMatchObject({ hand: 'right' });
    expect(state.hands.left.charge?.armed).toBe(true);
    expect(armedHands(state)).toBe(1);
  });
});
