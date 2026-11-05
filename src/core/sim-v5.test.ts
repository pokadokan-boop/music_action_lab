// v5 セッション A (docs/plan/v5-phase2-player.md): ステップ・溜め・放ち・強い相殺・返しを sim を直接回して確かめる。
// 位置と拍はテスト用の Grid (120 BPM、1 拍 0.5 秒、1 step = 1/60 拍)。強い相殺と返しは実物の v5.json の dash (phrase 3) と laser (phrase 1) で見る
import { Midi } from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { attackMotion, contactBeat, incomingDir, type Choreo } from './choreo';
import { buildGrid } from './grid';
import { classifyGrid, createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';
import { dashAttack, makeChoreo, makeGrid } from './test-fixtures';

const dt = config.fixedDt;
const grid = makeGrid();
const deps: SimDeps = { choreo: makeChoreo(), grid, cfg: config, acceptance };
const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
const beatsToSteps = (beats: number) => Math.round((beats * grid.beatSec) / dt);

function run(state: SimState, input: InputState, steps: number, d: SimDeps = deps): void {
  for (let i = 0; i < steps; i++) step(state, input, dt, d);
}

function events(state: SimState, kind: string) {
  return state.log.events.filter((e) => e.kind === kind);
}

describe('ステップ (T1)', () => {
  it('回避の押下で 0.5 拍の間、スティックの向きへ stepDistance 動き、その間スティックの移動は無視される', () => {
    const state = createSim(deps);
    run(state, stay, 10);
    const x0 = state.player.x;
    const y0 = state.player.y;
    // 右下へステップ。押した step は素の移動 (スティック (1,1) で a ずつ) をしてから始まり、以後 0.5 拍 (30 step) で stepDistance 動く。
    // その間、横だけのスティックは無視される
    step(state, { move: { x: 1, y: 1 }, attackPressed: false, dodgePressed: true }, dt, deps);
    expect(state.stepping).not.toBeNull();
    expect(events(state, 'step')).toHaveLength(1);
    run(state, { move: { x: 1, y: 0 }, attackPressed: false, dodgePressed: true }, beatsToSteps(0.5));
    // 向きは (1,1) を正規化したもの。x も y も stepDistance / √2 (+ 押した step の素の移動 a) だけ動く
    const d = config.stepDistance / Math.SQRT2;
    const a = (config.playerSpeed * dt) / Math.SQRT2;
    expect(state.player.x - x0).toBeCloseTo(d + a, 6);
    expect(state.player.y - y0).toBeCloseTo(d + a, 6);
    // ステップが終わると素の移動に戻る
    step(state, { move: { x: 1, y: 0 }, attackPressed: false, dodgePressed: true }, dt, deps);
    expect(state.stepping).toBeNull();
    expect(state.player.x - x0).toBeCloseTo(d + a + config.playerSpeed * dt, 6);
    expect(state.player.y - y0).toBeCloseTo(d + a, 6);
  });

  it('スティック無入力なら敵と逆の向きへ', () => {
    const state = createSim(deps);
    run(state, stay, 10);
    const x0 = state.player.x;
    step(state, { ...stay, dodgePressed: true }, dt, deps);
    run(state, { ...stay, dodgePressed: true }, beatsToSteps(0.5));
    expect(state.player.x).toBeCloseTo(x0 - config.stepDistance, 3);
  });

  it('ステップ中の押し直しは 0.25 拍たつまで無視され、たてば新しいステップに置き換わる', () => {
    const state = createSim(deps);
    run(state, stay, 10);
    step(state, { move: { x: 0, y: 1 }, attackPressed: false, dodgePressed: true }, dt, deps);
    run(state, stay, beatsToSteps(0.1) - 1);
    step(state, { move: { x: 0, y: -1 }, attackPressed: false, dodgePressed: true }, dt, deps);
    expect(events(state, 'step')).toHaveLength(1);
    expect(state.stepping!.dir.y).toBe(1);
    run(state, stay, beatsToSteps(0.2));
    step(state, { move: { x: 0, y: -1 }, attackPressed: false, dodgePressed: true }, dt, deps);
    expect(events(state, 'step')).toHaveLength(2);
    expect(state.stepping!.dir.y).toBe(-1);
  });

  it('拍の判定は 16 分の格子に ±40 ms (拍 2.0 は乗った、拍 2.1 = 50 ms ずれは外)', () => {
    const on = createSim(deps);
    run(on, stay, beatsToSteps(2) - 1);
    step(on, { ...stay, dodgePressed: true }, dt, deps);
    expect(on.beat).toBeCloseTo(2, 9);
    expect(events(on, 'step')[0]).toMatchObject({ cls: 'on' });
    const off = createSim(deps);
    run(off, stay, beatsToSteps(2.1) - 1);
    step(off, { ...stay, dodgePressed: true }, dt, deps);
    expect(events(off, 'step')[0]).toMatchObject({ cls: 'miss' });
    expect(Math.abs(events(off, 'step')[0].offsetMs!)).toBeCloseTo(50, 0);
    // classifyGrid 単体: 16 分の格子 (0.25) の上は on、窓の外は off
    expect(classifyGrid(2.25, 0.25, 0.08).on).toBe(true);
    expect(classifyGrid(2.37, 0.25, 0.08).on).toBe(false);
  });

  it('溜め中にステップしても溜めは切れない', () => {
    const state = createSim(deps);
    run(state, stay, 10);
    const hold: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    run(state, hold, beatsToSteps(0.6));
    expect(state.hands.right.charge?.armed).toBe(true);
    step(state, { ...hold, dodgePressed: true }, dt, deps);
    run(state, hold, beatsToSteps(0.5));
    expect(state.hands.right.charge?.armed).toBe(true);
    expect(events(state, 'step')).toHaveLength(1);
  });
});

describe('溜めと放ち (T2)', () => {
  // 敵の正面 (扇の中、接触距離より少し外) に自機を置く
  function nearEnemy(): SimState {
    const state = createSim(deps);
    run(state, stay, 10);
    state.player.x = state.enemy.x - (config.playerRadius + config.enemyRadius) * 1.2;
    state.player.y = state.enemy.y;
    return state;
  }

  it('押した瞬間に通常攻撃、0.5 拍押し続けると溜め (charge)、離すと放ち (release) で敵 HP が 3 減る', () => {
    const state = nearEnemy();
    const hold: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    step(state, hold, dt, deps);
    expect(events(state, 'attack')[0]).toMatchObject({ action: 'normal' });
    expect(state.enemy.hp).toBe(config.enemyHp - 1);
    expect(state.hands.right.charge).toMatchObject({ armed: false });
    run(state, hold, beatsToSteps(0.5) - 1);
    expect(state.hands.right.charge?.armed).toBe(false);
    step(state, hold, dt, deps);
    expect(state.hands.right.charge?.armed).toBe(true);
    expect(state.lastChargeBegin).toBe(true);
    expect(events(state, 'charge')).toHaveLength(1);
    run(state, hold, beatsToSteps(0.5));
    step(state, stay, dt, deps);
    expect(state.lastChargeEnd).toBe(true);
    expect(state.hands.right.charge).toBeNull();
    const attacks = events(state, 'attack');
    expect(attacks).toHaveLength(2);
    expect(attacks[1]).toMatchObject({ action: 'release' });
    expect(state.enemy.hp).toBe(config.enemyHp - 1 - config.damage.release);
    expect(events(state, 'hit')[1]).toMatchObject({ action: 'release', damage: 3 });
  });

  it('閾値未満で離すと何も起きない (通常攻撃 1 回だけ)', () => {
    const state = nearEnemy();
    const hold: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    run(state, hold, beatsToSteps(0.25));
    step(state, stay, dt, deps);
    expect(events(state, 'attack')).toHaveLength(1);
    expect(events(state, 'charge')).toHaveLength(0);
    expect(state.hands.right.charge).toBeNull();
  });

  it('被弾で溜めは解除され (charge-break)、その後離しても放たない', () => {
    // 自機を dash の終点 (0.3, 0.5) に置き、予告の間に溜めておく。dash は 10 拍で届く
    const state = createSim(deps);
    run(state, stay, beatsToSteps(8.5));
    state.player.x = 0.3;
    state.player.y = 0.5;
    const hold: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    run(state, hold, beatsToSteps(0.7));
    expect(state.hands.right.charge?.armed).toBe(true);
    run(state, hold, beatsToSteps(1.2));
    expect(state.damagedBy.has(0)).toBe(true);
    expect(events(state, 'charge-break')).toHaveLength(1);
    expect(state.hands.right.charge).toBeNull();
    // 押したままでは溜め直せない (押し直しが要る)
    run(state, hold, beatsToSteps(1));
    expect(state.hands.right.charge).toBeNull();
    // 離しても放たない
    step(state, stay, dt, deps);
    expect(events(state, 'attack').filter((e) => e.action === 'release')).toHaveLength(0);
    // 押し直せば溜め直せる
    step(state, hold, dt, deps);
    expect(state.hands.right.charge).toMatchObject({ armed: false });
  });
});

// 実物の振り付けで強い相殺と返しを見る
const root = resolve(__dirname, '..', '..');
const realChoreo = JSON.parse(readFileSync(resolve(root, 'assets', 'choreo', 'v6.json'), 'utf8')) as Choreo;
const realGrid = buildGrid(new Midi(readFileSync(resolve(root, 'assets', 'midi', `${realChoreo.song}.mid`))));
const realDeps: SimDeps = { choreo: realChoreo, grid: realGrid, cfg: config, acceptance };
const msBeatReal = (ms: number) => ms / 1000 / realGrid.beatSec;

function runUntil(state: SimState, target: number, input: InputState = stay): void {
  while ((state.t + dt) / realGrid.beatSec < target) step(state, input, dt, realDeps);
}

function resolvedContact(state: SimState, idx: number) {
  const atk = effectiveChoreo(state, realChoreo).attacks[idx];
  const motion = attackMotion(realChoreo, atk);
  const c = contactBeat(atk, state.player, realGrid.beatSec, config, motion);
  expect(c).not.toBeNull();
  const inc = incomingDir(atk, c!, state.player, realGrid.beatSec, config, motion);
  return { c: c!, facing: { x: -inc.x, y: -inc.y } };
}

describe('強い相殺 (T2) と返し (T3)。v6.json の dash (攻撃 5。v5.json では 6) と laser (攻撃 2)', () => {
  it('溜めの放ちで dash を相殺すると cancel に strong が付き、敵 HP が 3 減る。通常の相殺では減らない', () => {
    const state = createSim(realDeps);
    runUntil(state, realChoreo.attacks[5].telegraphBeat + 0.05);
    const { c, facing } = resolvedContact(state, 5);
    // 接触の 1 拍前に押して (通常攻撃 1 回。空振り)、押したまま待ち、接触の 60 ms 前に来る方向の逆を向いて離す
    runUntil(state, c - 1);
    step(state, { move: { x: 0, y: 0 }, attackPressed: true }, dt, realDeps);
    runUntil(state, c - msBeatReal(60), { move: { x: 0, y: 0 }, attackPressed: true });
    expect(state.hands.right.charge?.armed).toBe(true);
    step(state, { move: facing, attackPressed: false }, dt, realDeps);
    expect(state.cancelled.has(5)).toBe(true);
    const cancel = state.log.events.find((e) => e.kind === 'cancel' && e.attackIndex === 5);
    expect(cancel).toMatchObject({ strong: true });
    expect(state.enemy.hp).toBe(config.enemyHp - config.damage.release);
    expect(state.log.events.filter((e) => e.kind === 'attack').at(-1)).toMatchObject({ action: 'release' });

    // 通常の相殺 (別の走り)
    const plain = createSim(realDeps);
    runUntil(plain, realChoreo.attacks[5].telegraphBeat + 0.05);
    const p = resolvedContact(plain, 5);
    runUntil(plain, p.c - msBeatReal(60));
    step(plain, { move: p.facing, attackPressed: true }, dt, realDeps);
    expect(plain.cancelled.has(5)).toBe(true);
    expect(plain.log.events.find((e) => e.kind === 'cancel' && e.attackIndex === 5)).not.toHaveProperty('strong');
    expect(plain.enemy.hp).toBe(config.enemyHp);
  });

  it('相殺から 1 拍以内の押下は返し (riposte)。スティックがあればその向きへ 0.1 踏み込み、無ければ踏み込まない。1 拍を過ぎれば通常', () => {
    const withStick = createSim(realDeps);
    runUntil(withStick, realChoreo.attacks[2].telegraphBeat + 0.05);
    const a = resolvedContact(withStick, 2);
    runUntil(withStick, a.c - msBeatReal(60));
    step(withStick, { move: a.facing, attackPressed: true }, dt, realDeps);
    expect(withStick.cancelled.has(2)).toBe(true);
    step(withStick, stay, dt, realDeps);
    runUntil(withStick, withStick.lastCancelBeat! + 0.5);
    const x0 = withStick.player.x;
    const y0 = withStick.player.y;
    // 上へ倒して押す: 素の移動 (1 step) + 踏み込み 0.1
    step(withStick, { move: { x: 0, y: -1 }, attackPressed: true }, dt, realDeps);
    const riposte = withStick.log.events.filter((e) => e.kind === 'attack').at(-1);
    expect(riposte).toMatchObject({ action: 'riposte', lunge: true });
    expect(withStick.player.x).toBeCloseTo(x0, 9);
    expect(y0 - withStick.player.y).toBeCloseTo(config.lungeDistance + config.playerSpeed * dt, 6);

    const noStick = createSim(realDeps);
    runUntil(noStick, realChoreo.attacks[2].telegraphBeat + 0.05);
    const b = resolvedContact(noStick, 2);
    runUntil(noStick, b.c - msBeatReal(60));
    step(noStick, { move: b.facing, attackPressed: true }, dt, realDeps);
    step(noStick, stay, dt, realDeps);
    runUntil(noStick, noStick.lastCancelBeat! + 0.5);
    const nx = noStick.player.x;
    step(noStick, { move: { x: 0, y: 0 }, attackPressed: true }, dt, realDeps);
    expect(noStick.log.events.filter((e) => e.kind === 'attack').at(-1)).toMatchObject({ action: 'riposte', lunge: false });
    expect(noStick.player.x).toBeCloseTo(nx, 9);

    const late = createSim(realDeps);
    runUntil(late, realChoreo.attacks[2].telegraphBeat + 0.05);
    const l = resolvedContact(late, 2);
    runUntil(late, l.c - msBeatReal(60));
    step(late, { move: l.facing, attackPressed: true }, dt, realDeps);
    step(late, stay, dt, realDeps);
    runUntil(late, late.lastCancelBeat! + 1.1);
    step(late, { move: { x: 0, y: -1 }, attackPressed: true }, dt, realDeps);
    expect(late.log.events.filter((e) => e.kind === 'attack').at(-1)).toMatchObject({ action: 'normal' });
  });

  it('dodgePressed を省いた入力でも今までどおり動く (既存のテストとの互換)', () => {
    const state = createSim(realDeps);
    runUntil(state, 2);
    expect(state.stepping).toBeNull();
    expect(events(state, 'step')).toHaveLength(0);
  });
});

describe('フィクスチャの dash で溜めの解除が起きる前提 (自機が終点に立っていれば当たる)', () => {
  it('dashAttack の終点は (0.2, 0.5) で、path は 10.5 拍まで', () => {
    const atk = dashAttack();
    expect(atk.path.at(-1)).toMatchObject({ beat: 10.5, x: 0.2, y: 0.5 });
  });
});
