import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { GameClock } from './clock';
import { contactBeat, hitboxAt, type Attack, type CircleHit } from './choreo';
import type { EventKind } from './log';
import { classifyBeat, createSim, effectiveChoreo, step, type InputState, type SimDeps, type SimState } from './sim';
import { burstAttack, dashAttack, makeChoreo, makeGrid, shotAttack } from './test-fixtures';
import { dist } from './vec';
import { WORLD } from './world';

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

function runScripted(seconds: number, d: SimDeps = deps) {
  const state = createSim(d);
  const clock = new GameClock(config.fixedDt);
  for (let i = 0; i < seconds * 60; i++) {
    for (const t of clock.advanceTime(1000 / 60)) step(state, scriptedInput(t), config.fixedDt, d);
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

  it('自機狙い (aim: player) を含む振り付けでも、同じ入力列なら同じハッシュになる', () => {
    const aimed: SimDeps = {
      ...deps,
      choreo: makeChoreo([dashAttack({ aim: 'player' }), burstAttack({ aim: 'player' }), shotAttack({ aim: 'player' })]),
    };
    const a = runScripted(20, aimed);
    const b = runScripted(20, aimed);
    expect(a.resolved.size).toBe(3); // 3 攻撃とも予告開始時のプレイヤー位置で解決されている
    expect(a.log.hash()).toBe(b.log.hash());
  });

  it('sceneSeconds で終了し、以後は進まない', () => {
    const state = runScripted(22);
    expect(state.finished).toBe(true);
    expect(state.t).toBeGreaterThanOrEqual(acceptance.sceneSeconds);
    expect(state.t).toBeLessThan(acceptance.sceneSeconds + 0.02);
  });

  it('プレイヤーは世界 (幅 1 × 高さ 9/16) の中に留まる', () => {
    const state = createSim(deps);
    for (let i = 0; i < 600; i++) step(state, { move: { x: -1, y: -1 }, attackPressed: false }, config.fixedDt, deps);
    expect(state.player.x).toBeCloseTo(config.playerRadius, 9);
    expect(state.player.y).toBeCloseTo(config.playerRadius, 9);
    for (let i = 0; i < 600; i++) step(state, { move: { x: 1, y: 1 }, attackPressed: false }, config.fixedDt, deps);
    expect(state.player.x).toBeCloseTo(WORLD.w - config.playerRadius, 9);
    expect(state.player.y).toBeCloseTo(WORLD.h - config.playerRadius, 9);
  });

  it('等方座標: 画面上の斜め 45 度の入力は、斜め 45 度にいる敵をまっすぐ向く (角度差 0)', () => {
    const state = createSim(deps);
    state.player.x = state.enemy.x - 0.03;
    state.player.y = state.enemy.y + 0.03; // 敵は右上 45 度
    step(state, { move: { x: 1, y: -1 }, attackPressed: true }, config.fixedDt, deps);
    const ev = state.log.events.find((e) => e.kind === 'attack')!;
    expect(ev.aimDeg).toBeCloseTo(315, 9);
    expect(ev.enemyInFan).toBe(true);
    expect(state.lastHit).toBe(true);
    // 上下左右に同じ距離の点は、判定でも同じ距離 (縦が 9/16 に潰れない)
    const o = { x: 0.5, y: 0.3 };
    const d = 0.05;
    expect(dist(o, { x: o.x, y: o.y - d })).toBeCloseTo(dist(o, { x: o.x + d, y: o.y }), 12);
  });

  it('攻撃は押した瞬間だけ記録され、拍の位置で分類される', () => {
    const state = createSim(deps);
    const held: InputState = { move: { x: 0, y: 0 }, attackPressed: true };
    for (let i = 0; i < 10; i++) step(state, held, config.fixedDt, deps);
    expect(state.log.events.filter((e) => e.kind === 'attack')).toHaveLength(1);
    expect(state.log.events[0].cls).toBe('on');
  });

  it('扇の半径の内なら接触する距離まで寄せて命中、外なら外れ', () => {
    const near = createSim(deps);
    // 接触距離 (0.054) と扇の半径 (0.0576) の間に立つ
    near.player.x = near.enemy.x - (config.playerRadius + config.enemyRadius + config.attackRadius) / 2;
    near.player.y = near.enemy.y;
    step(near, { move: { x: 0, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    expect(near.lastHit).toBe(true);
    expect(near.enemy.hp).toBe(config.enemyHp - 1);
    // 敵は拍の揺れ (idle) で少し上にいるので、距離で見る
    expect(dist(near.player, near.enemy)).toBeCloseTo(config.playerRadius + config.enemyRadius, 9);

    const far = createSim(deps);
    far.player.x = 0.1;
    step(far, { move: { x: 0, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    expect(far.lastHit).toBe(false);
    expect(far.enemy.hp).toBe(config.enemyHp);
  });

  // 敵の左 (同じ高さ) に距離 d で立った状態を作る。敵は右 (角度 0 度) にいる
  function leftOfEnemy(d: number) {
    const state = createSim(deps);
    state.player.x = state.enemy.x - d;
    state.player.y = state.enemy.y;
    return state;
  }
  const attackEvents = (state: ReturnType<typeof createSim>) => state.log.events.filter((e) => e.kind === 'attack');

  it('扇の中 (角度差 30 度) の敵に当たる', () => {
    const state = leftOfEnemy(config.attackRadius * 0.7);
    step(state, { move: { x: Math.cos(Math.PI / 6), y: -Math.sin(Math.PI / 6) }, attackPressed: true }, config.fixedDt, deps);
    expect(state.lastHit).toBe(true);
    expect(state.enemy.hp).toBe(config.enemyHp - 1);
    expect(attackEvents(state)[0].enemyInFan).toBe(true);
  });

  it('同じ距離でも角度差が 45 度を超えると外れる', () => {
    const state = leftOfEnemy(config.attackRadius * 0.7);
    step(state, { move: { x: Math.cos(Math.PI / 3), y: -Math.sin(Math.PI / 3) }, attackPressed: true }, config.fixedDt, deps);
    expect(state.lastHit).toBe(false);
    expect(state.enemy.hp).toBe(config.enemyHp);
    expect(attackEvents(state)[0].enemyInFan).toBe(false);
  });

  it('移動入力が無ければ敵の方向を向いて当たる', () => {
    const state = createSim(deps);
    state.player.x = state.enemy.x - config.attackRadius * 0.5;
    state.player.y = state.enemy.y - config.attackRadius * 0.5;
    step(state, { move: { x: 0, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    expect(state.lastHit).toBe(true);
    const toEnemy = { x: state.enemy.x - state.player.x, y: state.enemy.y - state.player.y };
    const expectedDeg = (Math.atan2(toEnemy.y, toEnemy.x) * 180) / Math.PI;
    expect(attackEvents(state)[0].aimDeg).toBeCloseTo(expectedDeg, 6);
    expect(state.lastAim).not.toBeNull();
  });

  it('寄せは扇の中だけ。扇の外では位置が動かない', () => {
    const state = leftOfEnemy((config.playerRadius + config.enemyRadius + config.attackRadius) / 2);
    const x0 = state.player.x;
    // 真上を向く: 移動で y は動くが、寄せが無ければ x は変わらない
    step(state, { move: { x: 0, y: -1 }, attackPressed: true }, config.fixedDt, deps);
    expect(state.lastHit).toBe(false);
    expect(state.player.x).toBe(x0);
    expect(Math.abs(state.enemy.x - state.player.x)).toBeGreaterThan(config.playerRadius + config.enemyRadius);
  });

  it('attack イベントに aimDeg と enemyInFan が入り、lastAim は次の step で消える', () => {
    const state = leftOfEnemy(config.attackRadius * 0.5);
    step(state, { move: { x: 1, y: 0 }, attackPressed: true }, config.fixedDt, deps);
    const [ev] = attackEvents(state);
    expect(ev.aimDeg).toBeCloseTo(0, 9);
    expect(ev.enemyInFan).toBe(true);
    expect(state.lastAim).toEqual({ x: 1, y: 0 });
    step(state, { move: { x: 1, y: 0 }, attackPressed: false }, config.fixedDt, deps);
    expect(state.lastAim).toBeNull();
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

describe('自機狙い (aim: player)', () => {
  // burst (telegraph 16、hitBeat 19、半径 0.2) だけの振り付け。元データの発生点は (0.5, 0.5)
  const aimedDeps: SimDeps = { choreo: makeChoreo([burstAttack({ aim: 'player' })]), grid: makeGrid(), cfg: config, acceptance };
  const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };

  function untilTelegraph() {
    const state = createSim(aimedDeps);
    state.player.x = 0.6;
    state.player.y = 0.3;
    while (state.beat < 16) step(state, stay, config.fixedDt, aimedDeps);
    return state;
  }

  it('予告開始時のプレイヤー位置を狙い、その後の移動には追尾しない', () => {
    const state = untilTelegraph();
    expect(state.resolved.has(0)).toBe(true);
    const resolved = effectiveChoreo(state, aimedDeps.choreo).attacks[0];
    const h = hitboxAt(resolved, 19.1, aimedDeps.grid.beatSec, config) as CircleHit;
    expect(h.x).toBeCloseTo(0.6, 9);
    expect(h.y).toBeCloseTo(0.3, 9);

    // 左下へ逃げ続ける。狙いは固定されたままで、離れていれば当たらない
    const away: InputState = { move: { x: -1, y: 1 }, attackPressed: false };
    while (state.beat < 19.5) step(state, away, config.fixedDt, aimedDeps);
    expect(effectiveChoreo(state, aimedDeps.choreo).attacks[0]).toBe(resolved);
    expect(state.player.hp).toBe(config.playerHp);
    // 元の振り付けデータは変わらない
    expect(aimedDeps.choreo.attacks[0].path[1]).toEqual({ beat: 18, x: 0.5, y: 0.5 });
  });

  it('立ち止まっていると狙われた位置で当たり、敵も解決済みの path を動く', () => {
    const state = untilTelegraph();
    while (state.beat < 18) step(state, stay, config.fixedDt, aimedDeps);
    expect(state.enemy.x).toBeCloseTo(0.6, 2);
    while (state.beat < 19.5) step(state, stay, config.fixedDt, aimedDeps);
    expect(state.player.hp).toBe(config.playerHp - 1);
  });

  it('予告が始まる前は解決されず、幾何は元のまま', () => {
    const state = createSim(aimedDeps);
    while (state.beat < 15.5) step(state, stay, config.fixedDt, aimedDeps);
    expect(state.resolved.size).toBe(0);
    expect(effectiveChoreo(state, aimedDeps.choreo)).toBe(aimedDeps.choreo);
  });
});

describe('相殺 (cancel)', () => {
  const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
  const pressRight: InputState = { move: { x: 1, y: 0 }, attackPressed: true };
  const pressLeft: InputState = { move: { x: -1, y: 0 }, attackPressed: true };
  const events = (state: SimState, kind: EventKind) => state.log.events.filter((e) => e.kind === kind);

  // dash だけの振り付け。敵は beat 10 に (0.3, 0.5) に着き、10.5 まで左 (0.2, 0.5) へ抜ける (右から来る)。当たりの窓は 10〜10.25。
  // プレイヤー (x 0.15) から見て、本体 (r 0.06) が扇 (半径 attackRadius ≈ 0.058) に重なるのは 10.06 拍以降、接触 (r + 自機の半径) は 10.15 拍
  function dashDeps(over: Partial<Attack> = {}): SimDeps {
    return { choreo: makeChoreo([dashAttack(over)]), grid: makeGrid(), cfg: config, acceptance };
  }
  // プレイヤーを (x, y) に置き、「次の step で beat が targetBeat に達する」直前まで進める。
  // 押下をその step に乗せると、当たりの窓に入った最初の step で相殺を試せる (step と同じ計算で次の beat を出す)
  function runTo(d: SimDeps, x: number, targetBeat: number, y = 0.5): SimState {
    const state = createSim(d);
    state.player.x = x;
    state.player.y = y;
    while ((state.t + config.fixedDt) / d.grid.beatSec < targetBeat) step(state, stay, config.fixedDt, d);
    return state;
  }

  it('対照: 何もしなければ dash に当たる', () => {
    const d = dashDeps();
    const state = runTo(d, 0.15, 10.5);
    expect(state.player.hp).toBe(config.playerHp - 1);
    expect(events(state, 'cancel')).toHaveLength(0);
  });

  it('右から来る dash に右向きの攻撃で相殺が成立し、以後その攻撃で被弾しない', () => {
    const d = dashDeps();
    const state = runTo(d, 0.15, 10.1);
    step(state, pressRight, config.fixedDt, d);
    expect(state.cancelled.has(0)).toBe(true);
    expect(state.lastCancel?.attackIndex).toBe(0);
    // 閃光の位置は当たりの中心 (= dash の本体)。時刻が合った相殺なので接触の瞬間 (10.15 拍) の本体の位置
    expect(state.lastCancel?.pos.y).toBeCloseTo(0.5, 9);
    expect(state.lastCancel?.pos.x).toBeGreaterThan(0.2);
    expect(state.lastCancel?.pos.x).toBeLessThan(0.3);
    expect(state.lastCancel?.hitbox.kind).toBe('circle');
    expect(events(state, 'cancel')).toHaveLength(1);
    expect(events(state, 'cancel')[0]).toMatchObject({ attackIndex: 0, phrase: 1 });
    expect(events(state, 'cancel-miss')).toHaveLength(0);

    while (state.beat < 10.5) step(state, stay, config.fixedDt, d);
    expect(state.player.hp).toBe(config.playerHp);
    expect(events(state, 'damage')).toHaveLength(0);
    expect(state.lastCancel).toBeNull(); // 次の step で消える
    // 本体の動きは path どおり続く
    expect(state.enemy.x).toBeCloseTo(0.2, 9);
  });

  it('向きが合わない (扇は重なるが来る方向の逆から 50 度ずれ) と cancel-miss angle', () => {
    const d = dashDeps();
    const state = runTo(d, 0.15, 10.1);
    const rad = (50 * Math.PI) / 180;
    step(state, { move: { x: Math.cos(rad), y: Math.sin(rad) }, attackPressed: true }, config.fixedDt, d);
    expect(state.cancelled.size).toBe(0);
    expect(events(state, 'cancel-miss')).toHaveLength(1);
    expect(events(state, 'cancel-miss')[0]).toMatchObject({ attackIndex: 0, phrase: 1, reason: 'angle' });
  });

  it('左向き (敵に背を向ける) は、時刻は接触の窓の中なので向きの問題 (angle) として記録される', () => {
    const d = dashDeps();
    const state = runTo(d, 0.15, 10.1);
    step(state, pressLeft, config.fixedDt, d);
    expect(state.cancelled.size).toBe(0);
    expect(events(state, 'cancel-miss')[0]).toMatchObject({ reason: 'angle' });
  });

  it('窓の前 (予告中) に押すと cancel-miss timing', () => {
    const d = dashDeps();
    const state = runTo(d, 0.15, 9);
    step(state, pressRight, config.fixedDt, d);
    expect(state.cancelled.size).toBe(0);
    expect(events(state, 'cancel-miss')).toHaveLength(1);
    expect(events(state, 'cancel-miss')[0]).toMatchObject({ attackIndex: 0, reason: 'timing' });
  });

  it('予告の前や窓の終わり + 0.25 拍より後の押下は相殺の試みとみなさない (記録なし)', () => {
    const d = dashDeps();
    const early = runTo(d, 0.15, 5);
    step(early, pressRight, config.fixedDt, d);
    expect(events(early, 'cancel-miss')).toHaveLength(0);
    const late = runTo(d, 0.1, 10.6);
    step(late, pressRight, config.fixedDt, d);
    expect(events(late, 'cancel-miss')).toHaveLength(0);
  });

  it('届かない距離だと cancel-miss reach', () => {
    const d = dashDeps();
    const state = runTo(d, 0.04, 10);
    step(state, pressRight, config.fixedDt, d);
    expect(state.cancelled.size).toBe(0);
    expect(events(state, 'cancel-miss')[0]).toMatchObject({ reason: 'reach' });
  });

  it('uncancelable は相殺されず、cancel-miss も記録されない', () => {
    const d = dashDeps({ uncancelable: true });
    const state = runTo(d, 0.15, 10);
    step(state, pressRight, config.fixedDt, d);
    expect(state.cancelled.size).toBe(0);
    expect(state.lastCancel).toBeNull();
    expect(events(state, 'cancel')).toHaveLength(0);
    expect(events(state, 'cancel-miss')).toHaveLength(0);
    while (state.beat < 10.5) step(state, stay, config.fixedDt, d);
    expect(state.player.hp).toBe(config.playerHp - 1);
  });

  describe('laser', () => {
    // 右 (0.8, 0.3) から左へ y = 0.3 を走る線。窓は 26〜26.25。プレイヤーは線の 0.05 下 (太さ 0.03 + 半径 0.04 の内なので当たる)
    const laserDeps = (): SimDeps => ({
      choreo: makeChoreo([shotAttack({ type: 'laser', activeBeats: 0.25 })]),
      grid: makeGrid(),
      cfg: config,
      acceptance,
    });

    it('対照: 何もしなければ当たる', () => {
      const d = laserDeps();
      const state = runTo(d, 0.4, 26.3, 0.35);
      expect(state.player.hp).toBe(config.playerHp - 1);
    });

    it('射線の逆 (右) を向けば相殺でき、閃光は線上の最も近い点', () => {
      const d = laserDeps();
      const state = runTo(d, 0.4, 26, 0.35);
      step(state, pressRight, config.fixedDt, d);
      expect(state.cancelled.has(0)).toBe(true);
      expect(state.lastCancel?.pos.x).toBeCloseTo(state.player.x, 9);
      expect(state.lastCancel?.pos.y).toBeCloseTo(0.3, 9);
      while (state.beat < 26.3) step(state, stay, config.fixedDt, d);
      expect(state.player.hp).toBe(config.playerHp);
    });

    it('射線と同じ向き (左) では向きが合わず angle', () => {
      const d = laserDeps();
      const state = runTo(d, 0.4, 26, 0.35);
      step(state, pressLeft, config.fixedDt, d);
      expect(state.cancelled.size).toBe(0);
      expect(events(state, 'cancel-miss')[0]).toMatchObject({ reason: 'angle' });
    });
  });

  describe('接触基準の窓 (v3 T3: 接触の前 100 ms 〜 後 50 ms)', () => {
    const msBeat = (ms: number, d: SimDeps) => ms / 1000 / d.grid.beatSec;
    const contactOf = (d: SimDeps, x: number, y = 0.5) => contactBeat(d.choreo.attacks[0], { x, y }, d.grid.beatSec, config);

    it('dash: 立ったまま (接触 10.15 拍) の −100 ms 〜 +40 ms のどの押下でも相殺され、HP が減らない', () => {
      const d = dashDeps();
      const c = contactOf(d, 0.15)!;
      expect(c).toBeGreaterThan(10.1);
      expect(c).toBeLessThan(10.2);
      // 押下は目標の拍から 1 step (8.3 ms) 以内に遅れるので、遅い側は 40 ms まで見る
      for (let ms = -100; ms <= 40; ms += 10) {
        const state = runTo(d, 0.15, c + msBeat(ms, d));
        step(state, pressRight, config.fixedDt, d);
        expect(state.cancelled.has(0), `${ms} ms`).toBe(true);
        while (state.beat < 10.6) step(state, stay, config.fixedDt, d);
        expect(state.player.hp, `${ms} ms`).toBe(config.playerHp);
      }
    });

    it('dash: 窓の外 (−150 ms) は timing で被弾、+100 ms も被弾のまま', () => {
      const d = dashDeps();
      const c = contactOf(d, 0.15)!;
      const early = runTo(d, 0.15, c + msBeat(-150, d));
      step(early, pressRight, config.fixedDt, d);
      expect(early.cancelled.size).toBe(0);
      expect(events(early, 'cancel-miss')[0]).toMatchObject({ reason: 'timing' });
      while (early.beat < 10.6) step(early, stay, config.fixedDt, d);
      expect(early.player.hp).toBe(config.playerHp - 1);

      const late = runTo(d, 0.15, c + msBeat(100, d));
      expect(late.player.hp).toBe(config.playerHp - 1);
      step(late, pressRight, config.fixedDt, d);
      expect(late.cancelled.size).toBe(0);
      expect(late.player.hp).toBe(config.playerHp - 1);
      expect(events(late, 'damage-undone')).toHaveLength(0);
    });

    it('dash: 接触の後 (遅い側) の押下は、既に受けた被弾を取り消す (HP が戻り、記録に damage-undone が残る)', () => {
      const d = dashDeps();
      const c = contactOf(d, 0.15)!;
      const state = runTo(d, 0.15, c + msBeat(30, d));
      expect(state.player.hp).toBe(config.playerHp - 1); // 既に被弾している
      step(state, pressRight, config.fixedDt, d);
      expect(state.cancelled.has(0)).toBe(true);
      expect(state.player.hp).toBe(config.playerHp);
      expect(events(state, 'damage')).toHaveLength(1);
      expect(events(state, 'damage-undone')).toHaveLength(1);
      expect(events(state, 'damage-undone')[0]).toMatchObject({ attackIndex: 0, phrase: 1 });
      const text = state.log.summary({ choreoId: 't', song: 'f', date: '2026-10-29' });
      expect(text).toContain('被弾 1 回 (取り消し 1 回): 攻撃0(phrase 1, 取り消し)');
    });

    it('laser: 接触 (窓の始まり) の 100 ms 前に射線の逆を向いて押せば、当たりが出る前に相殺される', () => {
      const d: SimDeps = { choreo: makeChoreo([shotAttack({ type: 'laser', activeBeats: 0.25 })]), grid: makeGrid(), cfg: config, acceptance };
      expect(contactOf(d, 0.4, 0.35)).toBeCloseTo(26, 9);
      const state = runTo(d, 0.4, 26 + msBeat(-100, d), 0.35);
      step(state, pressRight, config.fixedDt, d);
      expect(state.cancelled.has(0)).toBe(true);
      expect(state.lastCancel?.hitbox.kind).toBe('segment');
      while (state.beat < 26.3) step(state, stay, config.fixedDt, d);
      expect(state.player.hp).toBe(config.playerHp);
      expect(events(state, 'damage')).toHaveLength(0);
    });

    it('かすめる相殺: 接触しない位置でも、押した瞬間に当たりが扇に重なっていれば相殺できる', () => {
      const d = dashDeps();
      // 本体 (y 0.5) の 0.1 上。接触距離 (0.06 + 0.024) より離れているので当たらない
      expect(contactOf(d, 0.2, 0.4)).toBeNull();
      const state = runTo(d, 0.2, 10.1, 0.4);
      step(state, pressRight, config.fixedDt, d);
      expect(state.cancelled.has(0)).toBe(true);
      expect(events(state, 'cancel')).toHaveLength(1);
    });
  });

  it('決定性: 同じ入力なら同じハッシュで、相殺の有無でハッシュが変わる', () => {
    const run = (d: SimDeps) => {
      const state = runTo(d, 0.15, 10.1);
      step(state, pressRight, config.fixedDt, d);
      while (state.beat < 10.5) step(state, stay, config.fixedDt, d);
      return state.log.hash();
    };
    expect(run(dashDeps())).toBe(run(dashDeps()));
    expect(run(dashDeps())).not.toBe(run(dashDeps({ uncancelable: true })));
  });
});

describe('結果の確定と分岐 (v4 T1)', () => {
  const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
  const pressRight: InputState = { move: { x: 1, y: 0 }, attackPressed: true };
  const events = (state: SimState, kind: EventKind) => state.log.events.filter((e) => e.kind === kind);
  // dash (path は 10.5 に (0.2, 0.5) で終わる) の後、shot の始点 (24 拍、(0.5, 0.5)) へ補間で移る振り付け。
  // dash を捌けたら 1 拍止まる
  function branchDeps(): SimDeps {
    return {
      choreo: makeChoreo([dashAttack({ after: { handled: { move: 'stop', beats: 1 } } }), shotAttack()]),
      grid: makeGrid(),
      cfg: config,
      acceptance,
    };
  }
  function runTo(d: SimDeps, x: number, targetBeat: number): SimState {
    const state = createSim(d);
    state.player.x = x;
    state.player.y = 0.5;
    while ((state.t + config.fixedDt) / d.grid.beatSec < targetBeat) step(state, stay, config.fixedDt, d);
    return state;
  }

  it('相殺した dash は handled になり、path の最後 (10.5) から 1 拍、敵がその場 (x 0.2) にとどまる', () => {
    const d = branchDeps();
    const state = runTo(d, 0.15, 10.1);
    step(state, pressRight, config.fixedDt, d);
    expect(state.cancelled.has(0)).toBe(true);
    while (state.beat < 10.4) step(state, stay, config.fixedDt, d);
    expect(state.outcome.get(0)).toBe('handled');
    expect(events(state, 'outcome')[0]).toMatchObject({ attackIndex: 0, phrase: 1, outcome: 'handled', branch: 'stop' });
    while (state.beat < 11.4) step(state, stay, config.fixedDt, d);
    expect(state.branched.has(0)).toBe(true);
    expect(state.enemy.x).toBeCloseTo(0.2, 9); // 止まっている (y は拍の揺れが乗る)
    while (state.beat < 12.5) step(state, stay, config.fixedDt, d);
    expect(state.enemy.x).toBeGreaterThan(0.2); // 止まる区間が終わると次の始点へ動き出す
  });

  it('被弾した dash は hit になり (hit の分岐は無い)、10.5 以降はすぐ次の始点へ動く', () => {
    const d = branchDeps();
    const state = runTo(d, 0.15, 10.6);
    expect(state.player.hp).toBe(config.playerHp - 1);
    while (state.beat < 11.4) step(state, stay, config.fixedDt, d);
    expect(state.outcome.get(0)).toBe('hit');
    expect(events(state, 'outcome')[0]).toMatchObject({ outcome: 'hit', branch: 'normal' });
    expect(state.branched.has(0)).toBe(true);
    expect(effectiveChoreo(state, d.choreo).attacks[0].branchFromBeat).toBeUndefined(); // normal は path を変えない
    expect(state.enemy.x).toBeGreaterThan(0.2);
  });

  it('相殺できない burst も、避ければ handled', () => {
    const d: SimDeps = { choreo: makeChoreo([burstAttack({ uncancelable: true })]), grid: makeGrid(), cfg: config, acceptance };
    const state = runTo(d, 0.1, 19.5);
    expect(state.player.hp).toBe(config.playerHp);
    expect(state.outcome.get(0)).toBe('handled');
  });

  it('要約に「捌けた n / 被弾 m」と phrase 表の結果列が出る', () => {
    const d = branchDeps();
    const state = runTo(d, 0.15, 10.1);
    step(state, pressRight, config.fixedDt, d);
    while (state.beat < 11) step(state, stay, config.fixedDt, d);
    const text = state.log.summary({ choreoId: 't', song: 'f', date: '2026-10-30' });
    expect(text).toContain('捌けた 1 / 被弾 0 (結果の出た攻撃 1、分岐した 1)');
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
