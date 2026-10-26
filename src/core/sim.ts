// ゲームの状態遷移。純粋に state と入力と dt だけで進み、同じ入力列なら同じ記録になる。
import type { Config } from '../config';
import {
  activeWindow,
  attackMotion,
  enemyPosAt,
  hitDistance,
  hitboxAt,
  incomingDir,
  resolveAttack,
  type Acceptance,
  type Attack,
  type Choreo,
  type Hitbox,
} from './choreo';
import { phraseAt, type Grid } from './grid';
import { GameLog, type BeatClass, type CancelMissReason } from './log';
import {
  angleBetweenDeg,
  angleDeg,
  clamp,
  closestPointOnSegment,
  dist,
  fanOverlapsCircle,
  fanOverlapsSegment,
  inFan,
  normalize,
  type Vec,
} from './vec';

// 相殺の「近い」判定: 当たりの窓の終わりからこの拍数までの押下は、相殺しようとしたものとして cancel-miss を記録する
const CANCEL_NEAR_AFTER_BEATS = 0.25;

export interface InputState {
  move: Vec;
  attackPressed: boolean;
}

export interface SimState {
  t: number;
  beat: number;
  player: { x: number; y: number; hp: number };
  enemy: { x: number; y: number; hp: number };
  attackLatch: boolean;
  damagedBy: Set<number>;
  // 各攻撃の当たりが最初に有効になった sim 時刻 (処理の遅れの計測用)
  impactAt: Map<number, number>;
  // 予告が始まった攻撃を、その瞬間のプレイヤー位置で解決した形 (attackIndex → Attack)。自機狙いはここで狙いが固定され、以後追尾しない。
  // fixed の攻撃も入るが幾何は元と同じ。入力列から決まるので決定性を壊さない
  resolved: Map<number, Attack>;
  // 相殺された攻撃 (attackIndex)。以後その当たりは被弾判定と描画で無視する。本体の動きは path どおり続く
  cancelled: Set<number>;
  log: GameLog;
  finished: boolean;
  // 直前の step で起きたこと (描画・効果音用。記録は log が持つ)
  lastAttackClass: BeatClass | null;
  lastHit: boolean;
  lastDamage: boolean;
  // 直前の step で攻撃したときの向き (単位ベクトル)。描画が扇を出すために使う
  lastAim: Vec | null;
  // 直前の step で相殺が成立したとき、その攻撃と当たりの位置 (閃光と音の位置・音高を決めるため)
  lastCancel: { attackIndex: number; pos: Vec } | null;
}

export interface SimDeps {
  choreo: Choreo;
  grid: Grid;
  cfg: Config;
  acceptance: Acceptance;
}

export function createSim(deps: SimDeps): SimState {
  const { cfg, choreo } = deps;
  const enemy = enemyPosAt(choreo, 0, cfg.enemyRestPos);
  return {
    t: 0,
    beat: 0,
    player: { x: cfg.playerStartPos.x, y: cfg.playerStartPos.y, hp: cfg.playerHp },
    enemy: { x: enemy.x, y: enemy.y, hp: cfg.enemyHp },
    attackLatch: false,
    damagedBy: new Set(),
    impactAt: new Map(),
    resolved: new Map(),
    cancelled: new Set(),
    log: new GameLog(),
    finished: false,
    lastAttackClass: null,
    lastHit: false,
    lastDamage: false,
    lastAim: null,
    lastCancel: null,
  };
}

export function step(state: SimState, input: InputState, dt: number, deps: SimDeps): void {
  const { cfg, grid, choreo, acceptance } = deps;
  state.lastAttackClass = null;
  state.lastHit = false;
  state.lastDamage = false;
  state.lastAim = null;
  state.lastCancel = null;
  if (state.finished) return;

  state.t += dt;
  state.beat = state.t / grid.beatSec;

  movePlayer(state, input, dt, cfg);
  resolveStarted(state, choreo, cfg);

  const enemyPos = enemyPosAt(effectiveChoreo(state, choreo), state.beat, cfg.enemyRestPos);
  state.enemy.x = enemyPos.x;
  state.enemy.y = enemyPos.y;

  if (input.attackPressed && !state.attackLatch) playerAttack(state, input, deps);
  state.attackLatch = input.attackPressed;

  checkDamage(state, deps);

  if (state.t >= acceptance.sceneSeconds) state.finished = true;
}

// 予告が始まった (beat >= telegraphBeat) 未解決の攻撃を、この瞬間のプレイヤー位置で解決して固定する。
// 移動の後に行うので「予告開始時点で見えている位置」を狙う。以後プレイヤーが動いても狙いは変わらない
function resolveStarted(state: SimState, choreo: Choreo, cfg: Config): void {
  choreo.attacks.forEach((atk, idx) => {
    if (state.resolved.has(idx) || state.beat < atk.telegraphBeat) return;
    state.resolved.set(idx, resolveAttack(atk, state.player, cfg, attackMotion(choreo, atk)));
  });
}

// resolved で置き換えた攻撃一覧を持つ振り付け。当たり・敵位置・描画はこれを使う。未解決の攻撃は元のまま (まだ始まっていない)
export function effectiveChoreo(state: SimState, choreo: Choreo): Choreo {
  if (state.resolved.size === 0) return choreo;
  return { ...choreo, attacks: choreo.attacks.map((atk, idx) => state.resolved.get(idx) ?? atk) };
}

function movePlayer(state: SimState, input: InputState, dt: number, cfg: Config): void {
  const len = Math.hypot(input.move.x, input.move.y);
  const scale = len > 1 ? 1 / len : 1;
  state.player.x = clamp(state.player.x + input.move.x * scale * cfg.playerSpeed * dt, cfg.playerRadius, 1 - cfg.playerRadius);
  state.player.y = clamp(state.player.y + input.move.y * scale * cfg.playerSpeed * dt, cfg.playerRadius, 1 - cfg.playerRadius);
}

// 攻撃した拍の位置を分類する。表 (最寄りの拍)、裏 (最寄りの半拍)、それ以外
export function classifyBeat(beat: number, windowBeats: number): { cls: BeatClass; offsetBeats: number } {
  const nearest = Math.round(beat);
  const offsetBeats = beat - nearest;
  if (Math.abs(offsetBeats) <= windowBeats) return { cls: 'on', offsetBeats };
  const nearestHalf = Math.round(beat * 2) / 2;
  if (Math.abs(beat - nearestHalf) <= windowBeats) return { cls: 'off', offsetBeats };
  return { cls: 'miss', offsetBeats };
}

function playerAttack(state: SimState, input: InputState, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const { cls, offsetBeats } = classifyBeat(state.beat, cfg.onBeatWindowBeats);
  state.lastAttackClass = cls;

  // 攻撃の向き: 移動入力があればその向き (丸めない)、無ければ敵の方向 (docs/plan/v2-phase2.md「既定値の決め」)
  const toEnemy: Vec = { x: state.enemy.x - state.player.x, y: state.enemy.y - state.player.y };
  const aim = Math.hypot(input.move.x, input.move.y) > 0 ? normalize(input.move) : normalize(toEnemy);
  state.lastAim = aim;
  // 扇の角度の条件だけを記録する (距離込みだと命中と同じ値になり、「向きが合っていたか」が読めなくなる)
  const enemyInFan = angleBetweenDeg(aim, toEnemy) <= cfg.attackFanDeg / 2;
  state.log.push({
    t: state.t,
    beat: state.beat,
    kind: 'attack',
    cls,
    offsetMs: offsetBeats * grid.beatSec * 1000,
    aimDeg: angleDeg(aim),
    enemyInFan,
  });

  // 相殺は命中と独立に判定する (両方起きてよい)。寄せで位置が動く前の、押した瞬間の位置で見る
  tryCancel(state, aim, deps);

  // 命中: 射程 + 補正距離の内、かつ扇の中 (inFan は T5 の相殺と共用)。扇の外なら寄せもしない
  if (!inFan(state.player, aim, cfg.attackFanDeg / 2, cfg.meleeRange + cfg.rangeAssist, state.enemy)) return;
  const d = dist(state.player, state.enemy);
  if (d > cfg.meleeRange && d > 0) {
    // 射程内なら当たるように少し寄せる (concept.md「初期案」)
    const pull = (d - cfg.meleeRange) / d;
    state.player.x += (state.enemy.x - state.player.x) * pull;
    state.player.y += (state.enemy.y - state.player.y) * pull;
  }
  state.enemy.hp = Math.max(0, state.enemy.hp - 1);
  state.lastHit = true;
  state.log.push({ t: state.t, beat: state.beat, kind: 'hit', phrase: phraseAt(grid, state.beat)?.index });
}

// 相殺 (v2 T5)。その瞬間に当たりがあり、uncancelable でなく、まだ相殺されていない敵の攻撃について、
// 条件 1 (重なり): 扇 (半径 meleeRange + rangeAssist、角度 attackFanDeg) と当たりの形が重なる
// 条件 2 (向き): aim が「来る方向の逆」から ±cancelFacingDeg / 2 以内
// の両方が成り立てば cancelled に入れる。成立しなかった押下は、近い攻撃 (予告開始 〜 窓の終わり + 0.25 拍) が
// あれば cancel-miss を 1 件だけ記録する。理由の優先順: timing → reach → angle
function tryCancel(state: SimState, aim: Vec, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const choreo = effectiveChoreo(state, deps.choreo);
  const range = cfg.meleeRange + cfg.rangeAssist;
  const half = cfg.attackFanDeg / 2;
  // 最初に見つかった不成立 (複数の攻撃が近くても記録は 1 件)
  let miss: { attackIndex: number; phrase: number; reason: CancelMissReason } | null = null;
  let cancelledAny = false;

  for (const [idx, atk] of choreo.attacks.entries()) {
    if (atk.uncancelable || state.cancelled.has(idx)) continue;
    const motion = attackMotion(choreo, atk);
    const h = hitboxAt(atk, state.beat, grid.beatSec, cfg, motion);
    let reason: CancelMissReason | null = null;
    if (!h) {
      const w = activeWindow(atk, grid.beatSec, cfg, motion);
      if (state.beat < atk.telegraphBeat || state.beat > w.endBeat + CANCEL_NEAR_AFTER_BEATS) continue; // 近くない。相殺しようとした押下ではない
      reason = 'timing';
    } else if (!fanOverlapsHitbox(state.player, aim, half, range, h)) {
      reason = 'reach';
    } else {
      const incoming = incomingDir(atk, state.beat, state.player, grid.beatSec, cfg, motion);
      if (angleBetweenDeg(aim, { x: -incoming.x, y: -incoming.y }) > cfg.cancelFacingDeg / 2) reason = 'angle';
    }
    if (reason) {
      miss ??= { attackIndex: idx, phrase: atk.phrase, reason };
      continue;
    }
    const hit = h!;
    state.cancelled.add(idx);
    cancelledAny = true;
    state.lastCancel = { attackIndex: idx, pos: hit.kind === 'circle' ? { x: hit.x, y: hit.y } : closestPointOnSegment(state.player, hit.a, hit.b) };
    state.log.push({ t: state.t, beat: state.beat, kind: 'cancel', attackIndex: idx, phrase: atk.phrase });
  }

  // 何かを相殺できた押下は失敗ではない
  if (!cancelledAny && miss) {
    state.log.push({ t: state.t, beat: state.beat, kind: 'cancel-miss', attackIndex: miss.attackIndex, phrase: miss.phrase, reason: miss.reason });
  }
}

function fanOverlapsHitbox(origin: Vec, aim: Vec, halfDeg: number, range: number, h: Hitbox): boolean {
  return h.kind === 'circle'
    ? fanOverlapsCircle(origin, aim, halfDeg, range, h, h.r)
    : fanOverlapsSegment(origin, aim, halfDeg, range, h.a, h.b, h.r);
}

function checkDamage(state: SimState, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const choreo = effectiveChoreo(state, deps.choreo);
  choreo.attacks.forEach((atk, idx) => {
    const c = hitboxAt(atk, state.beat, grid.beatSec, cfg, attackMotion(choreo, atk));
    if (!c) return;
    if (!state.impactAt.has(idx)) state.impactAt.set(idx, state.t);
    // 相殺された当たりは消えている (本体の動きだけ続く)
    if (state.damagedBy.has(idx) || state.cancelled.has(idx)) return;
    if (hitDistance(state.player, c) <= c.r + cfg.playerRadius) {
      state.damagedBy.add(idx);
      state.player.hp = Math.max(0, state.player.hp - 1);
      state.lastDamage = true;
      state.log.push({ t: state.t, beat: state.beat, kind: 'damage', attackIndex: idx, phrase: atk.phrase });
    }
  });
}

export function renderToText(state: SimState): string {
  return [
    `t=${state.t.toFixed(3)} beat=${state.beat.toFixed(2)} finished=${state.finished}`,
    `player x=${state.player.x.toFixed(3)} y=${state.player.y.toFixed(3)} hp=${state.player.hp}`,
    `enemy x=${state.enemy.x.toFixed(3)} y=${state.enemy.y.toFixed(3)} hp=${state.enemy.hp}`,
    `events=${state.log.events.length} damagedBy=[${[...state.damagedBy].join(',')}] cancelled=[${[...state.cancelled].join(',')}]`,
  ].join('\n');
}
