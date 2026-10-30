// 振り付け: 1 フレーズに 1 攻撃を拍グリッド上のキーフレームで書くデータ。形式は docs/choreo-format.md。
// ここでは型、時刻ごとの敵位置・当たり範囲、合否条件に照らした検査を持つ。DOM・Audio には触らない。
import type { Config } from '../config';
import type { Grid } from './grid';
import { clamp, dist, distToSegment, easeIn, easeOut, lerpVec, normalize, type Vec } from './vec';
import { WORLD, inWorld } from './world';

export type AttackType = 'dash' | 'burst' | 'shot' | 'laser';

// 狙い。fixed = データに書いた位置そのまま。player = 予告開始 (telegraphBeat) の瞬間のプレイヤー位置を狙う (v2 T4。追尾はしない)
export type Aim = 'fixed' | 'player';

// 移動と予告の補間。easeOut = 区間の最初が速い (v0)。snap = 拍の頭に向けて加速し、3 拍の移動なら最後の 1 拍で 70% 動く (v1)
export type Motion = 'easeOut' | 'snap';

// 攻撃の結果 (v4 T1)。handled = 捌けた (相殺した、または窓の終わりまでに被弾していない)、hit = 被弾した
export type Outcome = 'handled' | 'hit';

// 結果で分岐する敵の次の動き (v4 T1)。path の最後のキーフレームの後に足す。
// normal = 変えない。stop = 最後の点に beats とどまる。approach = 0.5 拍で自機の正面の間合いへ寄り beats の終わりまでとどまる。
// retreat = 0.5 拍で休憩位置へ戻り beats の終わりまでとどまる。意味づけ (何がリターンか) は v5 で決める (docs/plan/v4-phase1.md)
export type BranchMove = 'normal' | 'stop' | 'approach' | 'retreat';

export interface Branch {
  move: BranchMove;
  // とどまる長さ (拍)。省略時 1
  beats?: number;
}

export interface PathPoint extends Vec {
  beat: number;
}

export interface Attack {
  phrase: number;
  type: AttackType;
  telegraphBeat: number;
  hitBeat: number;
  activeBeats: number;
  path: PathPoint[];
  hitbox: { shape: 'circle'; r: number };
  // shot / laser のみ。弾や線の向き先
  target?: Vec;
  // 攻撃ごとの補間の上書き
  motion?: Motion;
  // 当たりの発生を hitBeat (音のアンカー) から遅らせる拍数。音のアタックが立ち上がりきった瞬間に当てるためのもの。
  // 検査 (hit-on-grid) は hitBeat で見る。実際の判定と叩きつけの着地は hitBeat + impactDelayBeats
  impactDelayBeats?: number;
  // 省略時 fixed。player なら sim が予告開始時に resolveAttack で幾何を置き換える
  aim?: Aim;
  // 省略時 false。true なら相殺 (v2 T5) の対象にならず、避けるしかない
  uncancelable?: boolean;
  // 結果別の次の動き (v4 T1)。省略時はどちらも normal
  after?: { handled?: Branch; hit?: Branch };
  // applyBranch が付ける。この拍以降の path は分岐で足した区間 (拍の揺れを乗せ、構えを分岐の種類にする)
  branchFromBeat?: number;
  branchMove?: BranchMove;
}

export interface Choreo {
  id: string;
  song: string;
  intent: string;
  idle?: { amplitude: number };
  // 振り付け全体の補間の既定。省略時は easeOut
  motion?: Motion;
  attacks: Attack[];
}

export interface Acceptance {
  sceneSeconds: number;
  telegraphLeadBeatsMin: number;
  hitOnGridToleranceMs: number;
  gridSubdivision: number;
  dodgeTimeMarginRatio: number;
  determinism: { sameInputSameLogHash: boolean };
}

export type ViolationRule =
  | 'path-order'
  | 'phrase-range'
  | 'telegraph-lead'
  | 'hit-on-grid'
  | 'dodgeable'
  | 'shot-target'
  | 'impact-delay'
  | 'in-world'
  | 'after-order'
  | 'after-overlap';

// impactDelayBeats の上限。これを超えると「音に乗っている」と言えない (acceptance.json へ移す候補)
export const IMPACT_DELAY_MAX_BEATS = 0.25;

export interface Violation {
  attackIndex: number;
  rule: ViolationRule;
  message: string;
}

export interface CircleHit extends Vec {
  kind: 'circle';
  r: number;
}

export interface SegmentHit {
  kind: 'segment';
  a: Vec;
  b: Vec;
  r: number;
}

export type Hitbox = CircleHit | SegmentHit;

const LASER_DEFAULT_ACTIVE_BEATS = 0.25;
// dash の進行方向を取るときに見る時間差 (sim の固定ステップと同じ 1/120 秒)
const INCOMING_DIR_DT_SEC = 1 / 120;
// 接触拍の走査の刻み (同上)
const CONTACT_SAMPLE_DT_SEC = 1 / 120;
// 分岐 (v4 T1): とどまる長さの既定、寄る・戻るの移動時間、寄ったときの間合い (接触距離に対する倍率)
const BRANCH_DEFAULT_BEATS = 1;
const BRANCH_MOVE_BEATS = 0.5;
const APPROACH_DISTANCE_RATIO = 1.5;

export function easeFor(motion: Motion): (t: number) => number {
  return motion === 'snap' ? easeIn : easeOut;
}

export function attackMotion(choreo: Choreo, attack: Attack): Motion {
  return attack.motion ?? choreo.motion ?? 'easeOut';
}

// 実際に当たりが発生する拍 (音のアンカー + 立ち上がりの遅れ)
export function impactBeat(attack: Attack): number {
  return attack.hitBeat + (attack.impactDelayBeats ?? 0);
}

// 点から当たり判定の芯 (円の中心、線分) までの距離。当たりは hitDistance <= r + プレイヤー半径
export function hitDistance(p: Vec, h: Hitbox): number {
  return h.kind === 'circle' ? dist(p, h) : distToSegment(p, h.a, h.b);
}

export function pathPosAt(path: PathPoint[], beat: number, motion: Motion = 'easeOut'): Vec {
  if (path.length === 0) throw new Error('pathPosAt: path が空');
  if (beat <= path[0].beat) return { x: path[0].x, y: path[0].y };
  const ease = easeFor(motion);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (beat <= b.beat) {
      const span = b.beat - a.beat;
      const t = span <= 0 ? 1 : (beat - a.beat) / span;
      return lerpVec(a, b, ease(t));
    }
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}

function sortedByPathStart(choreo: Choreo): Attack[] {
  return [...choreo.attacks].sort((a, b) => a.path[0].beat - b.path[0].beat);
}

// 攻撃中は path に従う。攻撃の間は前の終点から次の始点へ振り付けの補間で移る。
// 攻撃していない間は拍の頭で持ち上がり戻る小さな上下 (idle) を足し、拍を示す。
export function enemyPosAt(choreo: Choreo, beat: number, restPos: Vec): Vec {
  const attacks = sortedByPathStart(choreo);
  const gapEase = easeFor(choreo.motion ?? 'easeOut');
  let prevEnd: PathPoint | undefined;
  for (const atk of attacks) {
    const first = atk.path[0];
    const last = atk.path[atk.path.length - 1];
    if (beat >= first.beat && beat <= last.beat) {
      const p = pathPosAt(atk.path, beat, attackMotion(choreo, atk));
      // 分岐で足した区間 (止まる・寄る・戻る) には拍の揺れを乗せる (テンポ把握)
      return atk.branchFromBeat !== undefined && beat >= atk.branchFromBeat ? addIdle(p, beat, choreo) : p;
    }
    if (beat < first.beat) {
      const from: Vec = prevEnd ?? restPos;
      const fromBeat = prevEnd?.beat ?? first.beat - 2;
      const span = first.beat - fromBeat;
      const t = span <= 0 ? 1 : (beat - fromBeat) / span;
      return addIdle(lerpVec(from, first, gapEase(t)), beat, choreo);
    }
    prevEnd = last;
  }
  return addIdle(prevEnd ? { x: prevEnd.x, y: prevEnd.y } : restPos, beat, choreo);
}

function addIdle(pos: Vec, beat: number, choreo: Choreo): Vec {
  const amp = choreo.idle?.amplitude ?? 0;
  if (amp === 0) return pos;
  const frac = beat - Math.floor(beat);
  return { x: pos.x, y: pos.y - amp * (1 - easeOut(frac)) };
}

export interface ActiveWindow {
  startBeat: number;
  endBeat: number;
}

export function activeWindow(attack: Attack, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): ActiveWindow {
  const start = impactBeat(attack);
  if (attack.type === 'shot') {
    const origin = pathPosAt(attack.path, start, motion);
    const lifetimeSec = exitDistance(origin, shotDir(attack, origin), cfg.shotRadius) / cfg.shotSpeed;
    return { startBeat: start, endBeat: start + lifetimeSec / beatSec };
  }
  if (attack.type === 'laser') {
    const active = attack.activeBeats > 0 ? attack.activeBeats : LASER_DEFAULT_ACTIVE_BEATS;
    return { startBeat: start, endBeat: start + active };
  }
  return { startBeat: start, endBeat: start + attack.activeBeats };
}

// shot / laser の射線の向き (単位ベクトル)。target が無ければ左へ
export function shotDir(attack: Attack, origin: Vec): Vec {
  const target = attack.target ?? { x: 0, y: origin.y };
  const d = dist(origin, target);
  if (d === 0) return { x: -1, y: 0 };
  return { x: (target.x - origin.x) / d, y: (target.y - origin.y) / d };
}

// origin から dir へ進んで世界の外 (margin の余白つき) に出るまでの距離
function exitDistance(origin: Vec, dir: Vec, margin: number): number {
  let s = Infinity;
  if (dir.x > 0) s = Math.min(s, (WORLD.w + margin - origin.x) / dir.x);
  if (dir.x < 0) s = Math.min(s, (-margin - origin.x) / dir.x);
  if (dir.y > 0) s = Math.min(s, (WORLD.h + margin - origin.y) / dir.y);
  if (dir.y < 0) s = Math.min(s, (-margin - origin.y) / dir.y);
  return Number.isFinite(s) ? s : 2;
}

// その拍に当たり判定があれば形を返す。無ければ null
export function hitboxAt(attack: Attack, beat: number, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): Hitbox | null {
  const w = activeWindow(attack, beatSec, cfg, motion);
  if (beat < w.startBeat || beat > w.endBeat) return null;
  switch (attack.type) {
    case 'dash': {
      const p = pathPosAt(attack.path, beat, motion);
      return { kind: 'circle', x: p.x, y: p.y, r: attack.hitbox.r };
    }
    case 'burst': {
      // 当たりが発生する時点の位置で発生する (path の最後ではない。叩きつけた後に戻る動きを path に書けるように)
      const p = pathPosAt(attack.path, w.startBeat, motion);
      return { kind: 'circle', x: p.x, y: p.y, r: attack.hitbox.r };
    }
    case 'shot': {
      const origin = pathPosAt(attack.path, w.startBeat, motion);
      const dir = shotDir(attack, origin);
      const s = (beat - w.startBeat) * beatSec * cfg.shotSpeed;
      return { kind: 'circle', x: origin.x + dir.x * s, y: origin.y + dir.y * s, r: attack.hitbox.r };
    }
    case 'laser': {
      const origin = pathPosAt(attack.path, w.startBeat, motion);
      const dir = shotDir(attack, origin);
      const s = exitDistance(origin, dir, attack.hitbox.r);
      return { kind: 'segment', a: origin, b: { x: origin.x + dir.x * s, y: origin.y + dir.y * s }, r: attack.hitbox.r };
    }
  }
}

// 相殺 (v2 T5) で使う「攻撃が来る方向」(単位ベクトル)。プレイヤーはこの逆を向いていれば相殺できる。型ごとに:
// dash = その拍の敵の進行方向 (1/120 秒前との差)。止まっていればプレイヤーから当たりの中心への向きで代える。
// laser = 射線の向き。burst / shot = 当たりの中心からプレイヤーへの向き。向きが定まらなければ零ベクトル
export function incomingDir(attack: Attack, beat: number, playerPos: Vec, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): Vec {
  const w = activeWindow(attack, beatSec, cfg, motion);
  const origin = pathPosAt(attack.path, w.startBeat, motion);
  switch (attack.type) {
    case 'dash': {
      const now = pathPosAt(attack.path, beat, motion);
      const before = pathPosAt(attack.path, beat - INCOMING_DIR_DT_SEC / beatSec, motion);
      const v = normalize({ x: now.x - before.x, y: now.y - before.y });
      if (v.x !== 0 || v.y !== 0) return v;
      return normalize({ x: now.x - playerPos.x, y: now.y - playerPos.y });
    }
    case 'laser':
      return shotDir(attack, origin);
    case 'burst':
    case 'shot': {
      const h = hitboxAt(attack, beat, beatSec, cfg, motion);
      const c = h && h.kind === 'circle' ? h : origin;
      return normalize({ x: playerPos.x - c.x, y: playerPos.y - c.y });
    }
  }
}

// 相殺の基準 (v3 T3): 自機 (位置 playerPos、半径 cfg.playerRadius) に、この攻撃の当たりが最初に触れる拍。
// active 区間を 1/120 秒刻みで走査する。自機が動かなければ、この拍に checkDamage と同じ条件で被弾する。触れなければ null
export function contactBeat(attack: Attack, playerPos: Vec, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): number | null {
  const w = activeWindow(attack, beatSec, cfg, motion);
  const dtBeat = CONTACT_SAMPLE_DT_SEC / beatSec;
  for (let b = w.startBeat; b <= w.endBeat + 1e-9; b += dtBeat) {
    const h = hitboxAt(attack, b, beatSec, cfg, motion);
    if (h && hitDistance(playerPos, h) <= h.r + cfg.playerRadius) return b;
  }
  return null;
}

// 予告の輪が収束する拍 (v3 T3)。dash は突進の終点 (hitBeat より後の最初のキーフレーム) の拍 = 自機の位置に届く瞬間。
// 他は当たりの発生 (impactBeat)。hitBeat は音のアンカーのまま検査に使う (docs/plan/v3-phase2.md「既定値の決め」)
export function cancelAnchorBeat(attack: Attack): number {
  if (attack.type === 'dash') {
    const after = attack.path.find((p) => p.beat > attack.hitBeat);
    if (after) return after.beat;
  }
  return impactBeat(attack);
}

// 予告の線 (shot / laser の射線) の始点と向き先。描画用
export function aimLine(attack: Attack, motion: Motion = 'easeOut'): { origin: Vec; end: Vec } | null {
  if ((attack.type !== 'shot' && attack.type !== 'laser') || !attack.target) return null;
  const origin = pathPosAt(attack.path, impactBeat(attack), motion);
  const dir = shotDir(attack, origin);
  const s = exitDistance(origin, dir, attack.hitbox.r);
  return { origin, end: { x: origin.x + dir.x * s, y: origin.y + dir.y * s } };
}

// 自機狙い (aim: player) の攻撃を、target (予告開始時のプレイヤー位置) を狙う形に置き換えた Attack を返す。純粋関数。
// dash / burst は基準点 (dash = 突進の終点、burst = 発生点) が target に重なるよう、telegraphBeat より後のキーフレームを
// 平行移動する。telegraphBeat 以前の点は変えないので、予告開始時点の敵の位置は飛ばない。移動後の点は画面内に収める。
// laser / shot は本体を動かさず、狙い先 target を置き換える。fixed はそのまま返す
export function resolveAttack(attack: Attack, target: Vec, cfg: Config, motion: Motion = 'easeOut'): Attack {
  if ((attack.aim ?? 'fixed') === 'fixed') return attack;
  if (attack.type === 'laser' || attack.type === 'shot') return { ...attack, target: { x: target.x, y: target.y } };
  const anchor = attack.type === 'dash' ? dashEnd(attack) : pathPosAt(attack.path, impactBeat(attack), motion);
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const lo = cfg.enemyRadius;
  const hiX = WORLD.w - cfg.enemyRadius;
  const hiY = WORLD.h - cfg.enemyRadius;
  const path = attack.path.map((p) =>
    p.beat <= attack.telegraphBeat ? p : { beat: p.beat, x: clamp(p.x + dx, lo, hiX), y: clamp(p.y + dy, lo, hiY) },
  );
  return { ...attack, path };
}

// 分岐の開始の拍 = 振り付けの動きが終わった所 (path の最後のキーフレーム)
export function branchStartBeat(attack: Attack): number {
  return attack.path[attack.path.length - 1].beat;
}

// 分岐の終わりの拍。normal (または無し) なら開始と同じ
export function branchEndBeat(attack: Attack, branch: Branch | undefined): number {
  if (!branch || branch.move === 'normal') return branchStartBeat(attack);
  return branchStartBeat(attack) + (branch.beats ?? BRANCH_DEFAULT_BEATS);
}

// 分岐を path に反映した Attack を返す (純粋関数。v4 T1)。path の最後の点の後にキーフレームを足す。
// playerPos と facing (自機が向いている側の単位ベクトル) は分岐を適用する瞬間のもの。restPos は休憩位置
export function applyBranch(attack: Attack, branch: Branch | undefined, playerPos: Vec, facing: Vec, cfg: Config, restPos: Vec): Attack {
  if (!branch || branch.move === 'normal') return attack;
  const start = branchStartBeat(attack);
  const last = attack.path[attack.path.length - 1];
  const end = start + (branch.beats ?? BRANCH_DEFAULT_BEATS);
  const added: PathPoint[] = [];
  if (branch.move === 'stop') {
    added.push({ beat: end, x: last.x, y: last.y });
  } else {
    const target = branch.move === 'approach' ? approachPoint(playerPos, facing, cfg) : restPos;
    const arrive = Math.min(end, start + BRANCH_MOVE_BEATS);
    added.push({ beat: arrive, x: target.x, y: target.y });
    if (end > arrive + 1e-9) added.push({ beat: end, x: target.x, y: target.y });
  }
  return { ...attack, path: [...attack.path, ...added], branchFromBeat: start, branchMove: branch.move };
}

// 寄る先: 自機の正面 (facing の側) に、接触距離 × 1.5 離れた点。世界の中に収める
function approachPoint(playerPos: Vec, facing: Vec, cfg: Config): Vec {
  const dir = normalize(facing);
  const d = dir.x === 0 && dir.y === 0 ? { x: 1, y: 0 } : dir;
  const dist = (cfg.playerRadius + cfg.enemyRadius) * APPROACH_DISTANCE_RATIO;
  return {
    x: clamp(playerPos.x + d.x * dist, cfg.enemyRadius, WORLD.w - cfg.enemyRadius),
    y: clamp(playerPos.y + d.y * dist, cfg.enemyRadius, WORLD.h - cfg.enemyRadius),
  };
}

// dash の突進の終点: hitBeat より後の最初のキーフレーム。無ければ最後のキーフレーム
function dashEnd(attack: Attack): Vec {
  const after = attack.path.find((p) => p.beat > attack.hitBeat);
  const p = after ?? attack.path[attack.path.length - 1];
  return { x: p.x, y: p.y };
}

// 避けられる位置の格子。世界は 16:9 なので 16 × 9 (v2 までの 12 × 12 と同じ密度)
const DODGE_GRID_X = 16;
const DODGE_GRID_Y = 9;
const DODGE_SAMPLE_DT_SEC = 1 / 120;

export function validateChoreo(choreo: Choreo, grid: Grid, acceptance: Acceptance, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const tolBeats = acceptance.hitOnGridToleranceMs / 1000 / grid.beatSec;
  const sub = 1 / acceptance.gridSubdivision;

  choreo.attacks.forEach((atk, i) => {
    if (atk.path.length === 0 || atk.path.some((p, k) => k > 0 && p.beat <= atk.path[k - 1].beat)) {
      out.push({ attackIndex: i, rule: 'path-order', message: 'path の beat は単調増加で 1 点以上' });
    }
    const phrase = grid.phrases[atk.phrase];
    if (!phrase) {
      out.push({ attackIndex: i, rule: 'phrase-range', message: `phrase ${atk.phrase} はグリッドに無い` });
    }
    if (atk.hitBeat - atk.telegraphBeat < acceptance.telegraphLeadBeatsMin - 1e-9) {
      out.push({
        attackIndex: i,
        rule: 'telegraph-lead',
        message: `予告が ${atk.hitBeat - atk.telegraphBeat} 拍前。${acceptance.telegraphLeadBeatsMin} 拍以上要る`,
      });
    }
    const onGrid = Math.abs(atk.hitBeat / sub - Math.round(atk.hitBeat / sub)) * sub <= tolBeats;
    const onNote = phrase?.noteBeats.some((nb) => Math.abs(nb - atk.hitBeat) <= tolBeats) ?? false;
    if (!onGrid && !onNote) {
      out.push({ attackIndex: i, rule: 'hit-on-grid', message: `hitBeat ${atk.hitBeat} が拍・半拍・フレーズの音に乗っていない` });
    }
    if ((atk.type === 'shot' || atk.type === 'laser') && !atk.target) {
      out.push({ attackIndex: i, rule: 'shot-target', message: `${atk.type} には target が要る` });
    }
    const delay = atk.impactDelayBeats ?? 0;
    if (delay < 0 || delay > IMPACT_DELAY_MAX_BEATS) {
      out.push({ attackIndex: i, rule: 'impact-delay', message: `impactDelayBeats ${delay} は 0〜${IMPACT_DELAY_MAX_BEATS} 拍の範囲` });
    }
    // 位置が世界座標の中にあること。v2 までの正規化座標 (y が 0.5625 を超える) をそのまま使うとここで弾かれる
    const outside = [...atk.path, ...(atk.target ? [atk.target] : [])].filter((p) => !inWorld(p));
    if (outside.length > 0) {
      const ex = outside[0];
      out.push({
        attackIndex: i,
        rule: 'in-world',
        message: `位置 (${ex.x}, ${ex.y}) が世界 (x 0〜${WORLD.w}、y 0〜${WORLD.h}) の外。${outside.length} 点`,
      });
    }
  });

  if (out.some((v) => v.rule === 'path-order' || v.rule === 'shot-target')) return out;
  out.push(...checkBranches(choreo, grid, cfg));
  out.push(...checkDodgeable(choreo, grid, acceptance, cfg));
  return out;
}

// 分岐 (after) の検査 (v4 T1): 開始 (path の最後) が結果の確定 (窓の終わり + 遅い側の相殺の窓) より前でないこと、
// 終わりが次の攻撃の予告開始より後でないこと
function checkBranches(choreo: Choreo, grid: Grid, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const lateBeats = cfg.cancelLateMs / 1000 / grid.beatSec;
  choreo.attacks.forEach((atk, i) => {
    if (!atk.after) return;
    const w = activeWindow(atk, grid.beatSec, cfg, attackMotion(choreo, atk));
    const settle = w.endBeat + lateBeats;
    const start = branchStartBeat(atk);
    if (start < settle - 1e-9) {
      out.push({ attackIndex: i, rule: 'after-order', message: `分岐の開始 (path の最後 ${start}) が結果の確定 ${settle.toFixed(3)} 拍より前` });
    }
    const next = choreo.attacks.filter((a) => a.telegraphBeat > atk.telegraphBeat).sort((a, b) => a.telegraphBeat - b.telegraphBeat)[0];
    const end = Math.max(branchEndBeat(atk, atk.after.handled), branchEndBeat(atk, atk.after.hit));
    if (next && end > next.telegraphBeat + 1e-9) {
      out.push({ attackIndex: i, rule: 'after-overlap', message: `分岐の終わり ${end} が次の攻撃の予告開始 ${next.telegraphBeat} より後` });
    }
  });
  return out;
}

// 連続する当たり i-1, i について、i の active 区間で一度も当たらない格子点 p と
// i-1 で当たらない点 q があり、プレイヤー速度で余裕を残して q → p へ移れること
function checkDodgeable(choreo: Choreo, grid: Grid, acceptance: Acceptance, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const order = choreo.attacks.map((_a, i) => i).sort((a, b) => choreo.attacks[a].hitBeat - choreo.attacks[b].hitBeat);
  const points = gridPoints();
  let prevSafe: Vec[] | null = null;
  let prevHitBeat = -Infinity;
  for (const idx of order) {
    const atk = choreo.attacks[idx];
    const motion = attackMotion(choreo, atk);
    let safe: Vec[];
    if ((atk.aim ?? 'fixed') === 'player') {
      const r = playerAimedSafe(atk, points, grid, acceptance, cfg, motion);
      if (r.failedAt) {
        out.push({
          attackIndex: idx,
          rule: 'dodgeable',
          message: `自機狙い: 予告開始時に (${r.failedAt.x.toFixed(3)}, ${r.failedAt.y.toFixed(3)}) にいると ${r.reach.toFixed(3)} 以内に安全位置が無い`,
        });
      }
      safe = r.union;
    } else {
      const samples = hitboxSamples(atk, grid.beatSec, cfg, motion);
      safe = points.filter((p) => !everHit(p, samples, cfg));
    }
    if (safe.length === 0) {
      out.push({ attackIndex: idx, rule: 'dodgeable', message: '当たらない位置が無い' });
    } else if (prevSafe) {
      const dtSec = (atk.hitBeat - prevHitBeat) * grid.beatSec;
      const reach = cfg.playerSpeed * dtSec * (1 - acceptance.dodgeTimeMarginRatio);
      const ok = safe.some((p) => prevSafe!.some((q) => dist(p, q) <= reach));
      if (!ok) {
        out.push({ attackIndex: idx, rule: 'dodgeable', message: `前の攻撃の安全位置から ${reach.toFixed(3)} 以内に安全位置が無い` });
      }
    }
    prevSafe = safe;
    prevHitBeat = atk.hitBeat;
  }
  return out;
}

function gridPoints(): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < DODGE_GRID_X; i++) {
    for (let j = 0; j < DODGE_GRID_Y; j++) {
      pts.push({ x: ((i + 0.5) / DODGE_GRID_X) * WORLD.w, y: ((j + 0.5) / DODGE_GRID_Y) * WORLD.h });
    }
  }
  return pts;
}

// 自機狙いの攻撃の安全位置。予告開始時のプレイヤー位置は遊ぶまで分からないので、格子点 p の全てを候補にする:
// p ごとに p を狙った形に解決し、予告の間 (telegraphBeat → impactBeat) に余裕を残して走れる距離の内に、
// その攻撃で一度も当たらない格子点があること。1 つでも成り立たない p があれば failedAt にその例を返す。
// union は全 p の安全位置の和集合。次の攻撃への連鎖 (prevSafe) にはこれを使う。実際の p によっては
// 和集合の一部しか安全でないので緩い側の割り切り (v0 の「同時回避は見ない」と同じ扱い。docs/choreo-format.md)。
// 格子は 16 × 9 = 144 点なので計算量は v2 の 12 × 12 と同じ
function playerAimedSafe(
  atk: Attack,
  points: Vec[],
  grid: Grid,
  acceptance: Acceptance,
  cfg: Config,
  motion: Motion,
): { union: Vec[]; reach: number; failedAt: Vec | null } {
  const reach = cfg.playerSpeed * (impactBeat(atk) - atk.telegraphBeat) * grid.beatSec * (1 - acceptance.dodgeTimeMarginRatio);
  const union = new Set<Vec>();
  let failedAt: Vec | null = null;
  for (const p of points) {
    const resolved = resolveAttack(atk, p, cfg, motion);
    const samples = hitboxSamples(resolved, grid.beatSec, cfg, motion);
    let found = false;
    for (const q of points) {
      if (dist(p, q) > reach || everHit(q, samples, cfg)) continue;
      union.add(q);
      found = true;
    }
    if (!found && !failedAt) failedAt = p;
  }
  return { union: [...union], reach, failedAt };
}

// active 区間を 1/120 秒刻みで走査した当たりの形の列。格子点ごとに hitboxAt を呼び直さないための前計算
function hitboxSamples(atk: Attack, beatSec: number, cfg: Config, motion: Motion): Hitbox[] {
  const w = activeWindow(atk, beatSec, cfg, motion);
  const dtBeat = DODGE_SAMPLE_DT_SEC / beatSec;
  const out: Hitbox[] = [];
  for (let b = w.startBeat; b <= w.endBeat + 1e-9; b += dtBeat) {
    const h = hitboxAt(atk, b, beatSec, cfg, motion);
    if (h) out.push(h);
  }
  return out;
}

function everHit(p: Vec, samples: Hitbox[], cfg: Config): boolean {
  return samples.some((h) => hitDistance(p, h) <= h.r + cfg.playerRadius);
}
