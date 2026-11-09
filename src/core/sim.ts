// ゲームの状態遷移。純粋に state と入力と dt だけで進み、同じ入力列なら同じ記録になる。
import type { Config } from '../config';
import {
  KNOCKBACK_RESIST_DEFAULT,
  activeWindow,
  aimBeatOf,
  applyBranch,
  applyFollow,
  prevInGroup,
  attackMotion,
  branchStartBeat,
  contactBeat,
  enemyPosAt,
  hitboxAt,
  impactBeat,
  incomingDir,
  isHeavy,
  primaryHit,
  resolveAttack,
  touches,
  type Acceptance,
  type Attack,
  type Choreo,
  type Hitbox,
  type Outcome,
} from './choreo';
import { phraseAt, type Grid } from './grid';
import { GameLog, type AttackAction, type BeatClass, type CancelMissReason, type Hand } from './log';
import {
  angleBetweenDeg,
  angleDeg,
  clamp,
  closestPointOnSegment,
  dist,
  fanAngleCoversCircle,
  fanOverlapsCircle,
  fanOverlapsSegment,
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
  // 右手の攻撃ボタン (R1 / J / Space) を押している間 true。sim が立ち上がり (押下 = 通常攻撃か返し + 溜めの開始) と立ち下がり (離す = 溜めていれば放ち) を取る
  attackPressed: boolean;
  // 左手の攻撃ボタン (L1 / F。v6 T1) を押している間 true。省略は false。規則は右手と同じで、手ごとに独立に溜められる
  attackLeftPressed?: boolean;
  // 回避ボタンを押している間 true (v5 T1)。省略は false
  dodgePressed?: boolean;
}

// 手ごとの攻撃ボタンの状態 (v6 T1)。latch は前の step で押されていたか、charge は溜め
export interface HandState {
  latch: boolean;
  charge: Charge | null;
}

export const HANDS: readonly Hand[] = ['right', 'left'];

// ステップ中 (v5 T1)。startBeat から cfg.stepBeats の間、dir へ等速に動く
export interface Stepping {
  startBeat: number;
  dir: Vec;
}

// 溜め (v5 T2)。押下で startBeat を置き、押したまま閾値を超えると armed。離すと armed なら放ち。被弾で消える
export interface Charge {
  startBeat: number;
  armed: boolean;
}

export interface SimState {
  t: number;
  beat: number;
  player: { x: number; y: number; hp: number };
  enemy: { x: number; y: number; hp: number };
  // 手ごとの攻撃ボタンの状態 (v6 T1)。v5 までの attackLatch / charge は hands.right に相当
  hands: Record<Hand, HandState>;
  dodgeLatch: boolean;
  stepping: Stepping | null;
  // 直近の相殺の拍。返しの窓 (cfg.riposteWindowBeats) の基準 (v5 T3)
  lastCancelBeat: number | null;
  // 直近の放ち (両手放ちの窓の基準。v6 T2)。もう片方の手が cfg.doubleWindowBeats 以内に放てば両手放ちになり、消費される
  lastRelease: { hand: Hand; beat: number } | null;
  damagedBy: Set<number>;
  // 被弾した拍 (attackIndex → beat)。遅い側の相殺で被弾を取り消すときに、直前の被弾だけを対象にするため (v3 T3)
  damageBeat: Map<number, number>;
  // 被弾のダメージ量 (attackIndex → 量)。取り消すときに同じ量を戻す (v6。大技は 2 か 1.6)
  damageAmount: Map<number, number>;
  // 片手の放ちで軽減した大技 (v6 T5)。以後その攻撃の被ダメと吹っ飛びが cfg.slam.mitigateRatio 倍
  mitigated: Set<number>;
  // 自機の吹っ飛び・反動 (v6 T5): startBeat から cfg.slam.knockbackBeats の間、dir へ distance を等速に動き、入力を受けない
  knockback: { startBeat: number; dir: Vec; distance: number } | null;
  // 敵の反動 (v6 T5): 振り付けの位置に乗せる差分。dir × distance × (1 − 経過 / cfg.slam.recoilDecayBeats)
  enemyRecoil: { startBeat: number; dir: Vec; distance: number } | null;
  // 各攻撃の当たりが最初に有効になった sim 時刻 (処理の遅れの計測用)
  impactAt: Map<number, number>;
  // 予告が始まった攻撃を、その瞬間のプレイヤー位置で解決した形 (attackIndex → Attack)。自機狙いはここで狙いが固定され、以後追尾しない。
  // fixed の攻撃も入るが幾何は元と同じ。入力列から決まるので決定性を壊さない
  resolved: Map<number, Attack>;
  // aimBeat で狙い直し済みの攻撃 (v7 T3)
  reaimed: Set<number>;
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
  // 直前の step の攻撃の種類と手 (lastAttackClass と一緒に立つ)。同じ step で両手が押されたら後の手 (左) のものが残る。
  // lastAttackDouble は両手放ちの 2 つ目の放ち (音を double にする)
  lastAction: AttackAction | null;
  lastAttackHand: Hand | null;
  lastAttackDouble: boolean;
  // 直前の step でステップが始まった (拍の判定と向き)
  lastStep: { cls: BeatClass; dir: Vec } | null;
  // 直前の step で溜めが閾値を超えた / 溜めが終わった (放ちか解除。持続音を止める)
  lastChargeBegin: boolean;
  lastChargeEnd: boolean;
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
    hands: { right: { latch: false, charge: null }, left: { latch: false, charge: null } },
    dodgeLatch: false,
    stepping: null,
    lastCancelBeat: null,
    lastRelease: null,
    damagedBy: new Set(),
    damageBeat: new Map(),
    damageAmount: new Map(),
    mitigated: new Set(),
    knockback: null,
    enemyRecoil: null,
    impactAt: new Map(),
    resolved: new Map(),
    reaimed: new Set(),
    cancelled: new Set(),
    outcome: new Map(),
    branched: new Set(),
    facing: { x: 1, y: 0 },
    log: new GameLog(),
    finished: false,
    lastAttackClass: null,
    lastAction: null,
    lastAttackHand: null,
    lastAttackDouble: false,
    lastStep: null,
    lastChargeBegin: false,
    lastChargeEnd: false,
    lastHit: false,
    lastDamage: false,
    lastAim: null,
    lastCancel: null,
  };
}

export function step(state: SimState, input: InputState, dt: number, deps: SimDeps): void {
  const { cfg, grid, choreo, acceptance } = deps;
  state.lastAttackClass = null;
  state.lastAction = null;
  state.lastAttackHand = null;
  state.lastAttackDouble = false;
  state.lastStep = null;
  state.lastChargeBegin = false;
  state.lastChargeEnd = false;
  state.lastHit = false;
  state.lastDamage = false;
  state.lastAim = null;
  state.lastCancel = null;
  if (state.finished) return;

  state.t += dt;
  state.beat = state.t / grid.beatSec;

  movePlayer(state, input, dt, cfg, grid.beatSec);
  resolveStarted(state, choreo, cfg, grid.beatSec);
  settleOutcomes(state, deps);
  applyBranches(state, deps);

  const enemyPos = enemyPosAt(effectiveChoreo(state, choreo), state.beat, cfg.enemyRestPos);
  const recoil = enemyRecoilOffset(state, cfg);
  state.enemy.x = enemyPos.x + recoil.x;
  state.enemy.y = enemyPos.y + recoil.y;

  const dodge = input.dodgePressed ?? false;
  if (dodge && !state.dodgeLatch) startStep(state, input, deps);
  state.dodgeLatch = dodge;

  // 両手 (v6 T1)。右 → 左の順。同じ step で両方押されたら記録もこの順
  handleAttackButton(state, 'right', input.attackPressed, input, deps);
  handleAttackButton(state, 'left', input.attackLeftPressed ?? false, input, deps);

  checkDamage(state, deps);

  if (state.t >= acceptance.sceneSeconds) state.finished = true;
}

// 攻撃ボタン (v5 T2、v6 T1 で手ごとに): 押した瞬間は通常攻撃 (相殺から 1 拍以内なら返し) と溜めの開始。押したまま閾値を超えると溜め状態。
// 離した瞬間に溜め状態なら放つ。閾値未満で離せば何も起きない。被弾による解除は checkDamage。
// 持続音は手で区別しない (本人): lastChargeBegin は溜め状態の手が 0 → 1 になったとき、lastChargeEnd は 1 → 0 になったときだけ立つ
function handleAttackButton(state: SimState, hand: Hand, pressed: boolean, input: InputState, deps: SimDeps): void {
  const { cfg } = deps;
  const h = state.hands[hand];
  if (pressed && !h.latch) {
    const riposte = state.lastCancelBeat !== null && state.beat - state.lastCancelBeat <= cfg.riposteWindowBeats + BEAT_EPS;
    playerAttack(state, input, deps, riposte ? 'riposte' : 'normal', hand);
    h.charge = { startBeat: state.beat, armed: false };
  } else if (pressed && h.charge && !h.charge.armed && state.beat - h.charge.startBeat >= cfg.chargeThresholdBeats - BEAT_EPS) {
    const wasCharging = armedHands(state) > 0;
    h.charge.armed = true;
    if (!wasCharging) state.lastChargeBegin = true;
    state.log.push({ t: state.t, beat: state.beat, kind: 'charge', hand });
  } else if (!pressed && h.latch && h.charge) {
    if (h.charge.armed) {
      h.charge = null;
      if (armedHands(state) === 0) state.lastChargeEnd = true;
      playerAttack(state, input, deps, 'release', hand);
    }
    h.charge = null;
  }
  h.latch = pressed;
}

// 溜め状態 (armed) の手の数
export function armedHands(state: SimState): number {
  return HANDS.filter((hand) => state.hands[hand].charge?.armed).length;
}

// ステップ (v5 T1): スティックの向き (無入力なら敵と逆) へ cfg.stepDistance を cfg.stepBeats で動く。無敵は無い。
// ステップ中でも cfg.stepRetriggerBeats 以上たっていれば新しいステップに置き換わる (16 分の連打)。溜めは切れない。
// 拍の判定は 16 分の格子 (0.25 拍) に ±cfg.stepWindowMs
function startStep(state: SimState, input: InputState, deps: SimDeps): void {
  const { cfg, grid } = deps;
  if (state.stepping && state.beat - state.stepping.startBeat < cfg.stepRetriggerBeats - BEAT_EPS) return;
  const away: Vec = { x: state.player.x - state.enemy.x, y: state.player.y - state.enemy.y };
  let dir = Math.hypot(input.move.x, input.move.y) > 0 ? normalize(input.move) : normalize(away);
  if (dir.x === 0 && dir.y === 0) dir = { x: -1, y: 0 };
  const { on, offsetBeats } = classifyGrid(state.beat, 0.25, cfg.stepWindowMs / 1000 / grid.beatSec);
  const cls: BeatClass = on ? 'on' : 'miss';
  state.stepping = { startBeat: state.beat, dir };
  state.lastStep = { cls, dir };
  state.log.push({ t: state.t, beat: state.beat, kind: 'step', cls, offsetMs: offsetBeats * grid.beatSec * 1000 });
}

// 予告が始まった (beat >= telegraphBeat) 未解決の攻撃を、この瞬間のプレイヤー位置で解決して固定する。
// 移動の後に行うので「予告開始時点で見えている位置」を狙う。以後プレイヤーが動いても狙いは変わらない。
// v7 T3: aimBeat が telegraphBeat より後の攻撃 (連撃の 2 発目以降) は、aimBeat でもう一度その瞬間の位置に狙い直す (元の攻撃から解決し直す)
// v7.1: followPrev の攻撃は、解決のたびに同じ group の直前の攻撃 (解決済み) の終点へ path を合わせる (applyFollow)
function resolveStarted(state: SimState, choreo: Choreo, cfg: Config, beatSec: number): void {
  choreo.attacks.forEach((atk, idx) => {
    if (state.beat < atk.telegraphBeat) return;
    const motion = attackMotion(choreo, atk);
    const resolve = () => {
      const r = resolveAttack(atk, state.player, cfg, motion);
      if (!atk.followPrev) return r;
      const pi = prevInGroup(choreo, idx);
      if (pi < 0) return r;
      const prev = state.resolved.get(pi) ?? choreo.attacks[pi];
      const end = prev.path[prev.path.length - 1];
      return applyFollow(r, { x: end.x, y: end.y }, beatSec, cfg, motion);
    };
    if (!state.resolved.has(idx)) state.resolved.set(idx, resolve());
    const aimBeat = aimBeatOf(atk);
    if (aimBeat > atk.telegraphBeat && state.beat >= aimBeat && !state.reaimed.has(idx) && !state.branched.has(idx)) {
      state.reaimed.add(idx);
      state.resolved.set(idx, resolve());
    }
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

// 移動。ステップ中はスティックを無視して stepDistance / stepBeats の等速で dir へ。
// 押した step は動かず (開始は移動の後)、以後 stepBeats ぶんの step で stepDistance をちょうど動き、その次の step から素の移動。
// 吹っ飛び・反動 (v6 T5) 中はステップとスティックを無視して knockback の dir へ等速に動く
function movePlayer(state: SimState, input: InputState, dt: number, cfg: Config, beatSec: number): void {
  if (state.knockback && state.beat - state.knockback.startBeat > cfg.slam.knockbackBeats + BEAT_EPS) state.knockback = null;
  if (state.stepping && state.beat - state.stepping.startBeat > cfg.stepBeats + BEAT_EPS) state.stepping = null;
  let vx: number;
  let vy: number;
  if (state.knockback) {
    const speed = state.knockback.distance / (cfg.slam.knockbackBeats * beatSec);
    vx = state.knockback.dir.x * speed;
    vy = state.knockback.dir.y * speed;
  } else if (state.stepping) {
    const speed = cfg.stepDistance / (cfg.stepBeats * beatSec);
    vx = state.stepping.dir.x * speed;
    vy = state.stepping.dir.y * speed;
  } else {
    const len = Math.hypot(input.move.x, input.move.y);
    const scale = len > 1 ? 1 / len : 1;
    vx = input.move.x * scale * cfg.playerSpeed;
    vy = input.move.y * scale * cfg.playerSpeed;
  }
  state.player.x = clamp(state.player.x + vx * dt, cfg.playerRadius, WORLD.w - cfg.playerRadius);
  state.player.y = clamp(state.player.y + vy * dt, cfg.playerRadius, WORLD.h - cfg.playerRadius);
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

// 任意の格子 (gridBeats 刻み) に乗っているか (v5 T3。ステップは 16 分 = 0.25 拍)。offsetBeats は最寄りの格子点からのずれ
export function classifyGrid(beat: number, gridBeats: number, windowBeats: number): { on: boolean; offsetBeats: number } {
  const nearest = Math.round(beat / gridBeats) * gridBeats;
  const offsetBeats = beat - nearest;
  return { on: Math.abs(offsetBeats) <= windowBeats + BEAT_EPS, offsetBeats };
}

// 攻撃の押下 (v5 で 3 種に): normal = 通常、riposte = 相殺から 1 拍以内の押下 (スティック入力があれば踏み込む)、release = 溜めの放ち。
// どれも 拍の分類 → 記録 → 相殺の判定 (押した瞬間の位置) → (返しなら踏み込み) → 扇の命中、の順。
// v6: hand は押した手。放ちは、他方の手の放ちが cfg.doubleWindowBeats 以内にあれば両手放ち (double) として記録する (大技の相殺はセッション B)
function playerAttack(state: SimState, input: InputState, deps: SimDeps, action: AttackAction, hand: Hand): void {
  const { cfg, grid } = deps;
  const { cls, offsetBeats } = classifyBeat(state.beat, cfg.onBeatWindowBeats);
  state.lastAttackClass = cls;
  state.lastAction = action;
  state.lastAttackHand = hand;
  let double = false;
  let pairMs: number | undefined;
  if (action === 'release') {
    const prev = state.lastRelease;
    if (prev && prev.hand !== hand && state.beat - prev.beat <= cfg.doubleWindowBeats + BEAT_EPS) {
      double = true;
      pairMs = (state.beat - prev.beat) * grid.beatSec * 1000;
      state.lastRelease = null;
    } else {
      state.lastRelease = { hand, beat: state.beat };
    }
  }
  state.lastAttackDouble = double;

  // 攻撃の向き: 移動入力があればその向き (丸めない)、無ければ敵の方向 (docs/plan/v2-phase2.md「既定値の決め」)
  const hasMove = Math.hypot(input.move.x, input.move.y) > 0;
  const toEnemy: Vec = { x: state.enemy.x - state.player.x, y: state.enemy.y - state.player.y };
  const aim = hasMove ? normalize(input.move) : normalize(toEnemy);
  state.lastAim = aim;
  if (aim.x !== 0 || aim.y !== 0) state.facing = aim;
  // 扇の角度の条件だけを記録する (距離込みだと命中と同じ値になり、「向きが合っていたか」が読めなくなる)。
  // v6.1: 命中と同じく敵の体 (半径 enemyRadius) で見る。中心が扇の角度の外でも体が縁にかかる向きなら扇内
  const enemyInFan = fanAngleCoversCircle(state.player, aim, cfg.attackFanDeg / 2, state.enemy, cfg.enemyRadius);
  const lunge = action === 'riposte' && hasMove;
  const contact = cfg.playerRadius + cfg.enemyRadius;
  state.log.push({
    t: state.t,
    beat: state.beat,
    kind: 'attack',
    cls,
    offsetMs: offsetBeats * grid.beatSec * 1000,
    aimDeg: angleDeg(aim),
    enemyInFan,
    action,
    hand,
    ...(action === 'riposte' ? { lunge } : {}),
    ...(double ? { double, pairMs } : {}),
  });

  // 相殺は命中と独立に判定する (両方起きてよい)。寄せや踏み込みで位置が動く前の、押した瞬間の位置で見る。
  // 放ちで成立すれば強い相殺: 敵にダメージ (扇の命中と二重にはしない)。大技の両手相殺のダメージは tryCancel の中で入れる (6 × j)
  const damage = cfg.damage[action];
  const res = tryCancel(state, aim, deps, action === 'release', hand, double);
  const strong = res.cancelled && action === 'release';
  if (strong && !res.damageApplied) {
    state.enemy.hp = Math.max(0, state.enemy.hp - damage);
    state.lastHit = true;
  }

  // 返しの踏み込み (v5 T3。v6.1 で補正): 敵が扇の向きに入っていれば、敵へ向かって接触距離まで踏み込む (最大 lungeDistance。通り過ぎない)。
  // 入っていなければスティックの向きへ lungeDistance。無入力なら踏み込まない。
  // 理由: v6 不満「大体の角度 (扇の角度) が合っていれば当たる位置に補正してほしい」。v5〜v6 はスティックの向きへ常に 0.1 で、
  // 扇の半径 (0.077) より長いので近い敵を通り過ぎて外れることがあった
  if (lunge) {
    let dir = aim;
    let amount = cfg.lungeDistance;
    if (enemyInFan) {
      dir = normalize(toEnemy);
      amount = Math.min(cfg.lungeDistance, Math.max(0, dist(state.player, state.enemy) - contact));
    }
    state.player.x = clamp(state.player.x + dir.x * amount, cfg.playerRadius, WORLD.w - cfg.playerRadius);
    state.player.y = clamp(state.player.y + dir.y * amount, cfg.playerRadius, WORLD.h - cfg.playerRadius);
  }

  // 命中 (v6.1): 敵の体 (半径 enemyRadius) が扇 (半径 attackRadius、角度 attackFanDeg) に重なる。描画の扇が敵に触れて見えれば当たる。
  // v3 T2〜v6 は「敵の中心が扇の中」で、扇の縁から敵の半径ぶん (0.03) 内側まで入らないと当たらなかった (v6 不満「扇が敵に被っているのに当たらない」)。
  // 相殺の重なり (fanOverlapsCircle) と同じ条件にした。描画は同じ扇 (見えない射程は無い)。扇の外なら寄せもしない
  if (!fanOverlapsCircle(state.player, aim, cfg.attackFanDeg / 2, cfg.attackRadius, state.enemy, cfg.enemyRadius)) return;
  const d = dist(state.player, state.enemy);
  if (d > contact && d > 0) {
    // 扇の中なら接触する距離まで寄せる (concept.md「初期案」の「射程内なら当たるように少し補正する」)
    const pull = (d - contact) / d;
    state.player.x += (state.enemy.x - state.player.x) * pull;
    state.player.y += (state.enemy.y - state.player.y) * pull;
  }
  if (strong) return; // 放ちのダメージは強い相殺で入れた
  state.enemy.hp = Math.max(0, state.enemy.hp - damage);
  state.lastHit = true;
  state.log.push({ t: state.t, beat: state.beat, kind: 'hit', phrase: phraseAt(grid, state.beat)?.index, action, damage, hand, ...(double ? { double } : {}) });
}

// 相殺 (v2 T5、v3 T3 で窓を接触基準にした)。uncancelable でなく、まだ相殺されていない敵の攻撃について:
// 時刻: 押下 b が [接触拍 c − 早い側, c + 遅い側] にある (c = 今の自機の位置に当たりが最初に触れる拍。docs/plan/v3-phase2.md)、
//       または押した瞬間に当たりの形が扇 (半径 attackRadius、角度 attackFanDeg) と重なる (かすめる相殺。接触しない位置からでもよい)
// 向き: aim が「来る方向の逆」から ±cancelFacingDeg / 2 以内。来る方向は、時刻が合った相殺なら c の時点、かすめる相殺なら b の時点
// 両方が成り立てば cancelled に入れる。遅い側で成立し、その攻撃で既に被弾していれば HP を戻す (damage-undone)。
// 成立しなかった押下は、近い攻撃 (予告開始 〜 窓の終わり + 0.25 拍) があれば cancel-miss を 1 件だけ記録する。
// 理由: 時刻が外れ → c があれば timing、無ければ reach / 時刻は合うが向きが外れ → angle
// 戻り値は何かを相殺できたか (cancelled) と、敵へのダメージを中で入れたか (damageApplied。大技の両手相殺だけ)。
// strong は放ちによる押下 (cancel の記録に残す。通常のダメージは呼ぶ側)。hand は押した手 (記録用)。double は両手放ちの 2 つ目の放ち (v6 T2)。
// 大技 (slam。v6 T5): 通常攻撃と返しでは対象にならない。片手の放ちが時刻と向きを満たせば mitigate (相殺はしない)、
// 両手放ちが満たせば相殺 + 敵に damage.release × 2 × j + 反動の配分 (j はジャスト率、R は敵の反動耐性)
function tryCancel(state: SimState, aim: Vec, deps: SimDeps, strong: boolean, hand: Hand, double = false): { cancelled: boolean; damageApplied: boolean } {
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
  let damageApplied = false;

  for (const [idx, atk] of choreo.attacks.entries()) {
    if (atk.uncancelable || state.cancelled.has(idx)) continue;
    // 大技 (slam か heavy。v7 T4) は放ちだけが対象 (通常攻撃と返しは cancel-miss も記録しない)
    const heavy = isHeavy(atk);
    if (heavy && !strong) continue;
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
    // 大技を片手の放ちで: 軽減だけ (相殺しない)。既に軽減済みなら何もしない
    if (heavy && !double) {
      if (!state.mitigated.has(idx)) {
        state.mitigated.add(idx);
        state.log.push({ t: state.t, beat: b, kind: 'mitigate', attackIndex: idx, phrase: atk.phrase, hand });
      }
      continue;
    }
    // 成立。消した当たりの形は、時刻が合った相殺なら接触の瞬間の形、かすめる相殺なら今の形
    const shape = (timingOk ? hitboxAt(atk, c!, grid.beatSec, cfg, motion) : null) ?? now!;
    state.cancelled.add(idx);
    cancelledAny = true;
    state.lastCancelBeat = b;
    const main = primaryHit(shape);
    const pos = main.kind === 'circle' ? { x: main.x, y: main.y } : closestPointOnSegment(state.player, main.a, main.b);
    state.lastCancel = { attackIndex: idx, pos, hitbox: shape };
    if (heavy) {
      // 両手相殺 (v6 T5): ジャスト率 j は当たりの発生拍を基準に。敵に damage.release × 2 × j、反動の総量を R と j で配分
      const j = justRate(b, impactBeat(atk), early, late);
      const split = splitRecoil(cfg.slam.recoil, j, deps.choreo.knockbackResist ?? KNOCKBACK_RESIST_DEFAULT);
      state.enemy.hp = Math.max(0, state.enemy.hp - cfg.damage.release * 2 * j);
      state.lastHit = true;
      damageApplied = true;
      const away = awayFrom(state.player, pos);
      if (split.player > 0) {
        state.knockback = { startBeat: b, dir: away, distance: split.player };
        state.stepping = null;
      }
      if (split.enemy > 0) state.enemyRecoil = { startBeat: b, dir: awayFrom(state.enemy, state.player), distance: split.enemy };
      state.log.push({ t: state.t, beat: b, kind: 'cancel', attackIndex: idx, phrase: atk.phrase, hand, strong: true, double: true, just: j, recoil: split });
    } else {
      state.log.push({ t: state.t, beat: b, kind: 'cancel', attackIndex: idx, phrase: atk.phrase, hand, ...(strong ? { strong: true } : {}) });
    }
    // 遅い側: この攻撃で既に被弾していて、それが窓の中 (b − 遅い側 以降) なら取り消す。記録の damage は残し、HP だけ戻す (受けた量ぶん)
    const dmgBeat = state.damageBeat.get(idx);
    if (dmgBeat !== undefined && dmgBeat >= b - late - 1e-9) {
      state.player.hp = Math.min(cfg.playerHp, state.player.hp + (state.damageAmount.get(idx) ?? 1));
      state.log.push({ t: state.t, beat: b, kind: 'damage-undone', attackIndex: idx, phrase: atk.phrase });
    }
  }

  // 何かを相殺できた押下は失敗ではない
  if (!cancelledAny && miss) {
    state.log.push({ t: state.t, beat: state.beat, kind: 'cancel-miss', attackIndex: miss.attackIndex, phrase: miss.phrase, reason: miss.reason });
  }
  return { cancelled: cancelledAny, damageApplied };
}

// ジャスト率 (v6 T5): 押下 b が基準の拍 anchor にどれだけ近いか。窓の中心で 1、端 (早い側 early、遅い側 late。拍) で 0。範囲外は 0。
// 窓の幅が 0 の側では、ぴったりなら 1、それ以外 0
export function justRate(b: number, anchor: number, early: number, late: number): number {
  const offset = b - anchor;
  const side = offset < 0 ? early : late;
  if (side <= 0) return Math.abs(offset) <= BEAT_EPS ? 1 : 0;
  return clamp(1 - Math.abs(offset) / side, 0, 1);
}

// 反動の配分 (v6 T5。本人の式): 総量 total を敵 j / (R + j)、自機 R / (R + j) で分ける。R + j = 0 なら敵 0、自機 全部
export function splitRecoil(total: number, j: number, resist: number): { enemy: number; player: number } {
  const denom = resist + j;
  if (denom <= 0) return { enemy: 0, player: total };
  return { enemy: (total * j) / denom, player: (total * resist) / denom };
}

// p から見て from の反対へ向く単位ベクトル。同じ点なら左 (敵と逆側の既定)
function awayFrom(p: Vec, from: Vec): Vec {
  const d = normalize({ x: p.x - from.x, y: p.y - from.y });
  return d.x === 0 && d.y === 0 ? { x: -1, y: 0 } : d;
}

// 敵の反動の差分 (v6 T5)。dir × distance × (1 − 経過 / recoilDecayBeats)。消えたら null にする
function enemyRecoilOffset(state: SimState, cfg: Config): Vec {
  const r = state.enemyRecoil;
  if (!r) return { x: 0, y: 0 };
  const k = 1 - (state.beat - r.startBeat) / cfg.slam.recoilDecayBeats;
  if (k <= 0) {
    state.enemyRecoil = null;
    return { x: 0, y: 0 };
  }
  return { x: r.dir.x * r.distance * k, y: r.dir.y * r.distance * k };
}

function fanOverlapsHitbox(origin: Vec, aim: Vec, halfDeg: number, range: number, h: Hitbox): boolean {
  if (h.kind === 'group') return h.parts.some((part) => fanOverlapsHitbox(origin, aim, halfDeg, range, part));
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
    if (touches(state.player, c, cfg.playerRadius)) {
      // 大技 (v6 T5。v7 T4 で heavy の laser / sweep も): 被ダメ cfg.slam.damage、片手で軽減済みなら ×mitigateRatio。
      // 吹っ飛びは円なら中心から外、線分なら射線の向き (敵から遠ざかる)。その間は入力を受けない
      const slam = isHeavy(atk);
      const mitigated = slam && state.mitigated.has(idx);
      const ratio = mitigated ? cfg.slam.mitigateRatio : 1;
      const dmg = slam ? cfg.slam.damage * ratio : 1;
      state.damagedBy.add(idx);
      state.damageBeat.set(idx, state.beat);
      state.damageAmount.set(idx, dmg);
      state.player.hp = Math.max(0, state.player.hp - dmg);
      state.lastDamage = true;
      state.log.push({ t: state.t, beat: state.beat, kind: 'damage', attackIndex: idx, phrase: atk.phrase, ...(slam ? { damage: dmg, mitigated } : {}) });
      if (slam) {
        const main = primaryHit(c);
        let dir: Vec;
        if (main.kind === 'circle') {
          dir = awayFrom(state.player, main);
        } else {
          // 線分 (大上段) は射線の向き = 敵から遠ざかる向きへ (v7.1 の見直し: 最寄り点から外へだと、線の上にいるときに
          // ほぼ零のベクトルの正規化で向きが誤差任せになり、敵の方へ飛ばされることがあった)
          const along = normalize({ x: main.b.x - main.a.x, y: main.b.y - main.a.y });
          dir = along.x === 0 && along.y === 0 ? awayFrom(state.player, state.enemy) : along;
        }
        state.knockback = { startBeat: state.beat, dir, distance: cfg.slam.knockback * ratio };
        state.stepping = null;
      }
      breakCharge(state);
    }
  });
}

// 被弾で溜めは解除される (v5 T2。本人の指定)。両手とも (v6)。溜め状態の手があれば手ごとに記録し、持続音を止める。離して押し直すまで溜め直せない
function breakCharge(state: SimState): void {
  const wasCharging = armedHands(state) > 0;
  for (const hand of HANDS) {
    const h = state.hands[hand];
    if (!h.charge) continue;
    if (h.charge.armed) state.log.push({ t: state.t, beat: state.beat, kind: 'charge-break', hand });
    h.charge = null;
  }
  if (wasCharging) state.lastChargeEnd = true;
}

export function renderToText(state: SimState): string {
  return [
    `t=${state.t.toFixed(3)} beat=${state.beat.toFixed(2)} finished=${state.finished}`,
    `player x=${state.player.x.toFixed(3)} y=${state.player.y.toFixed(3)} hp=${+state.player.hp.toFixed(2)}`,
    `enemy x=${state.enemy.x.toFixed(3)} y=${state.enemy.y.toFixed(3)} hp=${+state.enemy.hp.toFixed(2)}`,
    `events=${state.log.events.length} damagedBy=[${[...state.damagedBy].join(',')}] cancelled=[${[...state.cancelled].join(',')}]`,
  ].join('\n');
}
