// ゲームの状態遷移。純粋に state と入力と dt だけで進み、同じ入力列なら同じ記録になる。
import type { Config } from '../config';
import {
  activeWindow,
  applyBranch,
  attackMotion,
  branchStartBeat,
  contactBeat,
  enemyPosAt,
  hitDistance,
  hitboxAt,
  incomingDir,
  resolveAttack,
  type Acceptance,
  type Attack,
  type Choreo,
  type Hitbox,
  type Outcome,
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
import { WORLD } from './world';

// 相殺の「近い」判定: 当たりの窓の終わりからこの拍数までの押下は、相殺しようとしたものとして cancel-miss を記録する
const CANCEL_NEAR_AFTER_BEATS = 0.25;
// 拍の比較の許容誤差 (固定ステップの倍数と窓の端が一致したときの浮動小数のずれ)
const BEAT_EPS = 1e-9;

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
  // 被弾した拍 (attackIndex → beat)。遅い側の相殺で被弾を取り消すときに、直前の被弾だけを対象にするため (v3 T3)
  damageBeat: Map<number, number>;
  // 各攻撃の当たりが最初に有効になった sim 時刻 (処理の遅れの計測用)
  impactAt: Map<number, number>;
  // 予告が始まった攻撃を、その瞬間のプレイヤー位置で解決した形 (attackIndex → Attack)。自機狙いはここで狙いが固定され、以後追尾しない。
  // fixed の攻撃も入るが幾何は元と同じ。入力列から決まるので決定性を壊さない
  resolved: Map<number, Attack>;
  // 相殺された攻撃 (attackIndex)。以後その当たりは被弾判定と描画で無視する。本体の動きは path どおり続く
  cancelled: Set<number>;
  // 攻撃の結果 (v4 T1)。当たりの窓の終わり + 遅い側の相殺の窓 で確定する
  outcome: Map<number, Outcome>;
  // 分岐を適用済みの攻撃 (normal も含む)
  branched: Set<number>;
  // 自機が最後に向いた向き (攻撃の aim)。分岐の「寄る」の先を決めるのに使う。初期値は右 (敵の側)
  facing: Vec;
  log: GameLog;
  finished: boolean;
  // 直前の step で起きたこと (描画・効果音用。記録は log が持つ)
  lastAttackClass: BeatClass | null;
  lastHit: boolean;
  lastDamage: boolean;
  // 直前の step で攻撃したときの向き (単位ベクトル)。描画が扇を出すために使う
  lastAim: Vec | null;
  // 直前の step で相殺が成立したとき、その攻撃と当たりの位置 (閃光と音の位置・音高を決めるため) と、消した当たりの形 (砕ける絵のため)
  lastCancel: { attackIndex: number; pos: Vec; hitbox: Hitbox } | null;
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
    damageBeat: new Map(),
    impactAt: new Map(),
    resolved: new Map(),
    cancelled: new Set(),
    outcome: new Map(),
    branched: new Set(),
    facing: { x: 1, y: 0 },
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
  settleOutcomes(state, deps);
  applyBranches(state, deps);

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

// 攻撃の結果を確定する (v4 T1)。当たりの窓の終わり + 遅い側の相殺の窓 を過ぎたら、相殺済みか被弾していなければ handled、被弾していれば hit
function settleOutcomes(state: SimState, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const choreo = effectiveChoreo(state, deps.choreo);
  const lateBeats = cfg.cancelLateMs / 1000 / grid.beatSec;
  choreo.attacks.forEach((atk, idx) => {
    if (state.outcome.has(idx)) return;
    const w = activeWindow(atk, grid.beatSec, cfg, attackMotion(choreo, atk));
    if (state.beat < w.endBeat + lateBeats) return;
    const outcome: Outcome = state.cancelled.has(idx) || !state.damagedBy.has(idx) ? 'handled' : 'hit';
    state.outcome.set(idx, outcome);
    state.log.push({ t: state.t, beat: state.beat, kind: 'outcome', attackIndex: idx, phrase: atk.phrase, outcome, branch: atk.after?.[outcome]?.move ?? 'normal' });
  });
}

// 結果に対応する分岐を、振り付けの動きが終わった拍 (path の最後) で path に反映する (v4 T1)。自機の位置と向きはその瞬間のもの
function applyBranches(state: SimState, deps: SimDeps): void {
  const choreo = effectiveChoreo(state, deps.choreo);
  choreo.attacks.forEach((atk, idx) => {
    if (state.branched.has(idx)) return;
    const outcome = state.outcome.get(idx);
    if (!outcome || state.beat < branchStartBeat(atk)) return;
    state.branched.add(idx);
    const branch = atk.after?.[outcome];
    if (!branch || branch.move === 'normal') return;
    state.resolved.set(idx, applyBranch(atk, branch, state.player, state.facing, deps.cfg, deps.cfg.enemyRestPos));
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
  state.player.x = clamp(state.player.x + input.move.x * scale * cfg.playerSpeed * dt, cfg.playerRadius, WORLD.w - cfg.playerRadius);
  state.player.y = clamp(state.player.y + input.move.y * scale * cfg.playerSpeed * dt, cfg.playerRadius, WORLD.h - cfg.playerRadius);
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
  if (aim.x !== 0 || aim.y !== 0) state.facing = aim;
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

  // 命中: 敵の中心が扇 (半径 attackRadius、角度 attackFanDeg) の中。描画も同じ扇 (見えない射程は無い。v3 T2)。扇の外なら寄せもしない
  if (!inFan(state.player, aim, cfg.attackFanDeg / 2, cfg.attackRadius, state.enemy)) return;
  const d = dist(state.player, state.enemy);
  const contact = cfg.playerRadius + cfg.enemyRadius;
  if (d > contact && d > 0) {
    // 扇の中なら接触する距離まで寄せる (concept.md「初期案」の「射程内なら当たるように少し補正する」)
    const pull = (d - contact) / d;
    state.player.x += (state.enemy.x - state.player.x) * pull;
    state.player.y += (state.enemy.y - state.player.y) * pull;
  }
  state.enemy.hp = Math.max(0, state.enemy.hp - 1);
  state.lastHit = true;
  state.log.push({ t: state.t, beat: state.beat, kind: 'hit', phrase: phraseAt(grid, state.beat)?.index });
}

// 相殺 (v2 T5、v3 T3 で窓を接触基準にした)。uncancelable でなく、まだ相殺されていない敵の攻撃について:
// 時刻: 押下 b が [接触拍 c − 早い側, c + 遅い側] にある (c = 今の自機の位置に当たりが最初に触れる拍。docs/plan/v3-phase2.md)、
//       または押した瞬間に当たりの形が扇 (半径 attackRadius、角度 attackFanDeg) と重なる (かすめる相殺。接触しない位置からでもよい)
// 向き: aim が「来る方向の逆」から ±cancelFacingDeg / 2 以内。来る方向は、時刻が合った相殺なら c の時点、かすめる相殺なら b の時点
// 両方が成り立てば cancelled に入れる。遅い側で成立し、その攻撃で既に被弾していれば HP を戻す (damage-undone)。
// 成立しなかった押下は、近い攻撃 (予告開始 〜 窓の終わり + 0.25 拍) があれば cancel-miss を 1 件だけ記録する。
// 理由: 時刻が外れ → c があれば timing、無ければ reach / 時刻は合うが向きが外れ → angle
function tryCancel(state: SimState, aim: Vec, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const choreo = effectiveChoreo(state, deps.choreo);
  const range = cfg.attackRadius;
  const half = cfg.attackFanDeg / 2;
  const msToBeat = 1 / (grid.beatSec * 1000);
  const early = cfg.cancelEarlyMs * msToBeat;
  const late = cfg.cancelLateMs * msToBeat;
  const b = state.beat;
  // 最初に見つかった不成立 (複数の攻撃が近くても記録は 1 件)
  let miss: { attackIndex: number; phrase: number; reason: CancelMissReason } | null = null;
  let cancelledAny = false;

  for (const [idx, atk] of choreo.attacks.entries()) {
    if (atk.uncancelable || state.cancelled.has(idx)) continue;
    const motion = attackMotion(choreo, atk);
    const w = activeWindow(atk, grid.beatSec, cfg, motion);
    // 押下の拍は固定ステップの倍数で、窓の端と一致しうるので浮動小数の誤差ぶんを足す
    const c = contactBeat(atk, state.player, grid.beatSec, cfg, motion);
    const timingOk = c !== null && b >= c - early - BEAT_EPS && b <= c + late + BEAT_EPS;
    const now = hitboxAt(atk, b, grid.beatSec, cfg, motion);
    const nowOk = now !== null && fanOverlapsHitbox(state.player, aim, half, range, now);
    let reason: CancelMissReason | null = null;
    if (!timingOk && !nowOk) {
      if (b < atk.telegraphBeat || b > w.endBeat + CANCEL_NEAR_AFTER_BEATS) continue; // 近くない。相殺しようとした押下ではない
      reason = c !== null ? 'timing' : 'reach';
    } else {
      const incoming = incomingDir(atk, timingOk ? c! : b, state.player, grid.beatSec, cfg, motion);
      if (angleBetweenDeg(aim, { x: -incoming.x, y: -incoming.y }) > cfg.cancelFacingDeg / 2) reason = 'angle';
    }
    if (reason) {
      miss ??= { attackIndex: idx, phrase: atk.phrase, reason };
      continue;
    }
    // 成立。消した当たりの形は、時刻が合った相殺なら接触の瞬間の形、かすめる相殺なら今の形
    const shape = (timingOk ? hitboxAt(atk, c!, grid.beatSec, cfg, motion) : null) ?? now!;
    state.cancelled.add(idx);
    cancelledAny = true;
    const pos = shape.kind === 'circle' ? { x: shape.x, y: shape.y } : closestPointOnSegment(state.player, shape.a, shape.b);
    state.lastCancel = { attackIndex: idx, pos, hitbox: shape };
    state.log.push({ t: state.t, beat: b, kind: 'cancel', attackIndex: idx, phrase: atk.phrase });
    // 遅い側: この攻撃で既に被弾していて、それが窓の中 (b − 遅い側 以降) なら取り消す。記録の damage は残し、HP だけ戻す
    const dmgBeat = state.damageBeat.get(idx);
    if (dmgBeat !== undefined && dmgBeat >= b - late - 1e-9) {
      state.player.hp = Math.min(cfg.playerHp, state.player.hp + 1);
      state.log.push({ t: state.t, beat: b, kind: 'damage-undone', attackIndex: idx, phrase: atk.phrase });
    }
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
      state.damageBeat.set(idx, state.beat);
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
