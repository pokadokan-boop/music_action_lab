// 振り付け: 1 フレーズに 1 攻撃を拍グリッド上のキーフレームで書くデータ。形式は docs/choreo-format.md。
// ここでは型、時刻ごとの敵位置・当たり範囲、合否条件に照らした検査を持つ。DOM・Audio には触らない。
import type { Config } from '../config';
import type { Grid } from './grid';
import { clamp, dist, distToSegment, easeIn, easeOut, lerpVec, normalize, type Vec } from './vec';
import { WORLD, inWorld } from './world';

// slam (v6 T4): 大技。telegraphBeat (1 音目) で飛び上がり発射装置 4 つが円を囲む正方形の 4 隅へ飛び、impactBeat (2 音目) で叩きつけの円と 4 辺のレーザーが同時に出る。
// 相殺は両手放ちだけ、片手の放ちは軽減 (sim.tryCancel)。逃げ場は円の外かつ枠の内側の帯か、撃たれる前に枠の外 (docs/plan/v6-phase1.md)
// sweep (v7 T3): 薙ぎ払い。発生点から長さ length の線 (太さ hitbox.r) が、target の向きを中心に sweepDeg の角度を activeBeats かけて回る
export type AttackType = 'dash' | 'burst' | 'shot' | 'laser' | 'slam' | 'sweep';

// 敵の姿 (v7 T5): teardrop = 1 体目の雫形 (省略時)、duelist = 2 体目の決闘者 (src/render/duelist.ts)
export type EnemyFigure = 'teardrop' | 'duelist';

// 姿の動きの名前 (v7 T5)。攻撃の型から決まる既定を Attack.move で上書きできる (短い laser = 突き、長い laser = 振り下ろし、など)。
// 絵の側 (figures / duelist) はこの名前で鍵フレームの組を選ぶ
export type EnemyMove = 'thrust' | 'chop' | 'heavyChop' | 'sweep' | 'dash' | 'shot' | 'slam' | 'burst';

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
  // 連なる攻撃 (v5 T6): 同じフレーズの 2 つ目の攻撃に付ける印。検査 chain-order と、1 つ目の予告の二重の輪に使う。予告の先行は 2 拍のまま
  chained?: boolean;
  // slam のみ (v6 T4): 円を囲む正方形の半幅と、4 辺のレーザーの太さ (半径)。frameHalf > hitbox.r + laserR (検査 slam-shape)
  frameHalf?: number;
  laserR?: number;
  // v7 T3 (docs/plan/v7-phase2-enemy.md)
  // 連撃の束の名前。同じ名前の攻撃は 1 つの行動。束の中で hitBeat が最小のものが 1 発目
  group?: string;
  // 自機の位置を狙い直す拍 (省略時 telegraphBeat)。telegraphBeat より後に置けるのは group の 2 発目以降だけ (検査 aim-beat)
  aimBeat?: number;
  // 踏み込み: 当たりの beats 拍前から狙い先へ最大 distance 寄る。keep は自機との間に残す距離 (省略時 接触距離 × 1.5)。shot / laser / sweep 用
  approach?: { beats: number; distance: number; keep?: number };
  // 攻撃が乗る声部 (トラック名。省略時 melody)
  track?: string;
  // laser / sweep の線の長さの上限 (laser で省略時は画面端まで)
  length?: number;
  // sweep の回る角度 (度。負なら逆回り)
  sweepDeg?: number;
  // 大技の相殺規則 (v7 T4): true なら slam と同じく、両手放ちだけで相殺でき、片手の放ちは軽減、被弾はダメージ 2 と吹っ飛び。
  // laser / sweep / slam にだけ付けられる (検査 heavy-shape)。slam は常に大技 (isHeavy)
  heavy?: boolean;
  // 姿の動きの名前 (v7 T5)。省略時は型から (moveOf)
  move?: EnemyMove;
  // v7.1: 自機狙い (dash / burst / slam) で動かすキーフレームを hitBeat より後に限る (省略時は telegraphBeat より後)。
  // 予告から出発までの構えの位置は固定され、出発点が固定・着点が自機になる。前の攻撃の終点から構える path (v7) で、予告の瞬間に敵が跳ばないため
  windupFixed?: boolean;
  // v7.1: 同じ group の直前の攻撃の (解決済みの) path の終点に、この攻撃の path の最初の点を合わせて平行移動する (当たりの窓の終わりまでの点。戻りは動かさない)。
  // 突進の後に、着地した場所から薙ぎ払う、など。group の 2 発目以降だけ (検査 follow-shape)。sim が解決のたびに applyFollow で当てる
  followPrev?: boolean;
}

// 攻撃の動きの名前 (v7 T5): 書いてあればそれ、無ければ型から。laser は長さ 0.4 未満を突き、以上を振り下ろし (heavy なら大上段)
export function moveOf(attack: Attack): EnemyMove {
  if (attack.move) return attack.move;
  switch (attack.type) {
    case 'laser':
      return attack.heavy ? 'heavyChop' : (attack.length ?? Infinity) < 0.4 ? 'thrust' : 'chop';
    case 'sweep':
      return 'sweep';
    case 'dash':
      return 'dash';
    case 'shot':
      return 'shot';
    case 'slam':
      return 'slam';
    case 'burst':
      return 'burst';
  }
}

// 大技か (v7 T4): slam か、heavy の付いた laser / sweep。相殺・被弾・色・要約の分岐はこれで見る
export function isHeavy(attack: Attack): boolean {
  return attack.type === 'slam' || attack.heavy === true;
}

export const APPROACH_KEEP_RATIO = 1.5;

// 自機の位置を狙う拍 (v7 T3)。省略時は予告開始
export function aimBeatOf(attack: Attack): number {
  return attack.aimBeat ?? attack.telegraphBeat;
}

// 連撃の 1 発目か (v7 T3): group が無いか、同じ group で自分より hitBeat が小さい攻撃が無い
export function isGroupLead(choreo: Choreo, attack: Attack): boolean {
  if (!attack.group) return true;
  return !choreo.attacks.some((a) => a !== attack && a.group === attack.group && a.hitBeat < attack.hitBeat);
}

export interface Choreo {
  id: string;
  song: string;
  intent: string;
  idle?: { amplitude: number };
  // 振り付け全体の補間の既定。省略時は easeOut
  motion?: Motion;
  // 敵の反動耐性 R (0〜1。v6 T5)。両手相殺の反動の総量を敵 j / (R + j)、自機 R / (R + j) で分ける。省略時 0.5
  knockbackResist?: number;
  // シーンごとの値 (v7 T2。docs/plan/v7-phase2-song.md)。省略時は acceptance.sceneSeconds (20) と config.enemyHp (12)。
  // 1 曲目 (v6.json) は書かないので v6.1 と同じ記録になる
  sceneSeconds?: number;
  enemyHp?: number;
  // 敵の姿 (v7 T5)。省略時 teardrop (1 体目)
  figure?: EnemyFigure;
  attacks: Attack[];
}

export const KNOCKBACK_RESIST_DEFAULT = 0.5;

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
  | 'after-overlap'
  | 'chain-order'
  | 'slam-shape'
  | 'aim-beat'
  | 'approach-shape'
  | 'sweep-shape'
  | 'track-known'
  | 'heavy-shape'
  | 'follow-shape';

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

// 複数の形の集まり (v6 T4。slam の円 + 4 辺)。距離は部品の最小、扇との重なりは部品のどれか。parts[0] が主 (閃光の位置に使う円)
export interface GroupHit {
  kind: 'group';
  parts: (CircleHit | SegmentHit)[];
}

export type Hitbox = CircleHit | SegmentHit | GroupHit;

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

// 点が当たりに触れているか (芯までの距離 ≤ r + margin)。group は部品のどれかに触れていれば触れている。
// 部品ごとに r が違うので、距離と r を別々に比べる
export function touches(p: Vec, h: Hitbox, margin: number): boolean {
  if (h.kind === 'group') return h.parts.some((part) => touches(p, part, margin));
  return hitDistance(p, h) <= h.r + margin;
}

// 点から当たり判定の芯 (円の中心、線分) までの距離。group は部品の最小 (r の違いは見ないので、当たりの判定は touches を使う)
export function hitDistance(p: Vec, h: Hitbox): number {
  if (h.kind === 'group') return Math.min(...h.parts.map((part) => hitDistance(p, part)));
  return h.kind === 'circle' ? dist(p, h) : distToSegment(p, h.a, h.b);
}

// 当たりの主の部品 (閃光の位置・来る方向の基準)。group は parts[0]
export function primaryHit(h: Hitbox): CircleHit | SegmentHit {
  return h.kind === 'group' ? h.parts[0] : h;
}

// slam の形 (v6 T4): 中心 c の円 (hitbox.r) と、c を囲む半幅 frameHalf の正方形の 4 辺 (太さ laserR)。corners は左上から時計回り
export function slamShape(attack: Attack, c: Vec): { circle: CircleHit; corners: Vec[]; edges: SegmentHit[] } {
  const half = attack.frameHalf ?? 0;
  const r = attack.laserR ?? 0;
  const corners: Vec[] = [
    { x: c.x - half, y: c.y - half },
    { x: c.x + half, y: c.y - half },
    { x: c.x + half, y: c.y + half },
    { x: c.x - half, y: c.y + half },
  ];
  const edges: SegmentHit[] = corners.map((a, i) => ({ kind: 'segment', a, b: corners[(i + 1) % 4], r }));
  return { circle: { kind: 'circle', x: c.x, y: c.y, r: attack.hitbox.r }, corners, edges };
}

// slam の叩きつけの中心 (当たりが発生する時点の敵の位置。burst と同じ)
export function slamCenter(attack: Attack, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): Vec {
  return pathPosAt(attack.path, activeWindow(attack, beatSec, cfg, motion).startBeat, motion);
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
// 「前の終点」は拍が最大の終点 (v5 T6)。単一キーフレームの攻撃 (shot / laser) を別の攻撃の path の中に入れ子にしたとき、
// 並び順で最後に見た (拍の古い) 終点へ戻る動きが出ないようにするため
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
    if (!prevEnd || last.beat > prevEnd.beat) prevEnd = last;
  }
  return addIdle(prevEnd ? { x: prevEnd.x, y: prevEnd.y } : restPos, beat, choreo);
}

// 連なる攻撃の 1 つ目か (v5 T6): 同じフレーズに、自分より後に当たる chained の攻撃がある。予告の二重の輪に使う
export function leadsChain(choreo: Choreo, attack: Attack): boolean {
  return choreo.attacks.some((a) => a.chained && a.phrase === attack.phrase && a.hitBeat > attack.hitBeat);
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
      // length (v7 T3) があれば線をそこで切る (突き・刺し)
      const s = Math.min(exitDistance(origin, dir, attack.hitbox.r), attack.length ?? Infinity);
      return { kind: 'segment', a: origin, b: { x: origin.x + dir.x * s, y: origin.y + dir.y * s }, r: attack.hitbox.r };
    }
    case 'sweep': {
      // 薙ぎ払い (v7 T3): 狙いの向きを中心に sweepDeg を activeBeats かけて回る線
      const arc = sweepArc(attack, motion);
      const u = w.endBeat > w.startBeat ? (beat - w.startBeat) / (w.endBeat - w.startBeat) : 1;
      const ang = arc.fromRad + (arc.toRad - arc.fromRad) * clamp(u, 0, 1);
      return { kind: 'segment', a: arc.origin, b: { x: arc.origin.x + Math.cos(ang) * arc.length, y: arc.origin.y + Math.sin(ang) * arc.length }, r: attack.hitbox.r };
    }
    case 'slam': {
      // 円と 4 辺が同時に出て、同時に消える (v6 T4)
      const shape = slamShape(attack, pathPosAt(attack.path, w.startBeat, motion));
      return { kind: 'group', parts: [shape.circle, ...shape.edges] };
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
    case 'sweep':
      // 薙ぎ払いは発生点から自機へ (刃の接線で見ると向きが一瞬で変わり、押す側が合わせられない。docs/plan/v7-phase2-enemy.md)
      return normalize({ x: playerPos.x - origin.x, y: playerPos.y - origin.y });
    case 'burst':
    case 'shot':
    case 'slam': {
      // slam は円の中心から自機へ (burst と同じ。4 辺は中心を囲むので、来る方向は中心から)
      const h = hitboxAt(attack, beat, beatSec, cfg, motion);
      const main = h ? primaryHit(h) : null;
      const c = main && main.kind === 'circle' ? main : origin;
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
    if (h && touches(playerPos, h, cfg.playerRadius)) return b;
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

// 予告の線 (shot / laser の射線) の始点と向き先。描画用。laser の length があればそこまで
export function aimLine(attack: Attack, motion: Motion = 'easeOut'): { origin: Vec; end: Vec } | null {
  if ((attack.type !== 'shot' && attack.type !== 'laser') || !attack.target) return null;
  const origin = pathPosAt(attack.path, impactBeat(attack), motion);
  const dir = shotDir(attack, origin);
  const s = Math.min(exitDistance(origin, dir, attack.hitbox.r), attack.type === 'laser' ? (attack.length ?? Infinity) : Infinity);
  return { origin, end: { x: origin.x + dir.x * s, y: origin.y + dir.y * s } };
}

// 薙ぎ払いの弧 (v7 T3): 発生点、長さ、回り始めと回り終わりの角度 (ラジアン。画面座標なので時計回りが正)。描画と hitboxAt で共用
export function sweepArc(attack: Attack, motion: Motion = 'easeOut'): { origin: Vec; length: number; fromRad: number; toRad: number } {
  const origin = pathPosAt(attack.path, impactBeat(attack), motion);
  const dir = shotDir(attack, origin);
  const base = Math.atan2(dir.y, dir.x);
  const half = ((attack.sweepDeg ?? 0) * Math.PI) / 180 / 2;
  return { origin, length: attack.length ?? 0, fromRad: base - half, toRad: base + half };
}

// 自機狙い (aim: player) の攻撃を、target (予告開始時のプレイヤー位置) を狙う形に置き換えた Attack を返す。純粋関数。
// dash / burst は基準点 (dash = 突進の終点、burst = 発生点) が target に重なるよう、telegraphBeat より後のキーフレームを
// 平行移動する。telegraphBeat 以前の点は変えないので、予告開始時点の敵の位置は飛ばない。移動後の点は画面内に収める。
// laser / shot / sweep は本体を動かさず、狙い先 target を置き換える。fixed はそのまま返す (踏み込みだけは書いてあれば JSON の target へ)。
// v7 T3: 踏み込み (approach) があれば、狙い先へ寄るキーフレームを path に足す (applyApproach)
export function resolveAttack(attack: Attack, target: Vec, cfg: Config, motion: Motion = 'easeOut'): Attack {
  if ((attack.aim ?? 'fixed') === 'fixed') return attack.approach && attack.target ? applyApproach(attack, attack.target, cfg, motion) : attack;
  if (attack.type === 'laser' || attack.type === 'shot' || attack.type === 'sweep') {
    const aimed = { ...attack, target: { x: target.x, y: target.y } };
    return attack.approach ? applyApproach(aimed, target, cfg, motion) : aimed;
  }
  const anchor = attack.type === 'dash' ? dashEnd(attack) : pathPosAt(attack.path, impactBeat(attack), motion);
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const lo = cfg.enemyRadius;
  const hiX = WORLD.w - cfg.enemyRadius;
  const hiY = WORLD.h - cfg.enemyRadius;
  // v7.1: windupFixed なら出発 (hitBeat) までの点は動かさない
  const fixedUntil = attack.windupFixed ? attack.hitBeat : attack.telegraphBeat;
  const path = attack.path.map((p) =>
    p.beat <= fixedUntil + 1e-9 ? p : { beat: p.beat, x: clamp(p.x + dx, lo, hiX), y: clamp(p.y + dy, lo, hiY) },
  );
  return { ...attack, path };
}

// 前の攻撃の終点に続く (v7.1): path の最初の点が prevEnd に重なるよう、当たりの窓の終わりまでの点を平行移動する。
// それより後の点 (次の構えへの戻り) は動かさないので、着地した場所から振って元の構えへ戻る。画面内に収める
export function applyFollow(attack: Attack, prevEnd: Vec, beatSec: number, cfg: Config, motion: Motion = 'easeOut'): Attack {
  if (attack.path.length === 0) return attack;
  const first = attack.path[0];
  const dx = prevEnd.x - first.x;
  const dy = prevEnd.y - first.y;
  const until = activeWindow(attack, beatSec, cfg, motion).endBeat;
  const lo = cfg.enemyRadius;
  const path = attack.path.map((p) =>
    p.beat <= until + 1e-9 ? { beat: p.beat, x: clamp(p.x + dx, lo, WORLD.w - lo), y: clamp(p.y + dy, lo, WORLD.h - lo) } : p,
  );
  return { ...attack, path };
}

// 同じ group の直前の攻撃 (hitBeat が自分より小さい中で最大) の添字。無ければ -1
export function prevInGroup(choreo: Choreo, index: number): number {
  const me = choreo.attacks[index];
  if (!me.group) return -1;
  let best = -1;
  choreo.attacks.forEach((a, i) => {
    if (i === index || a.group !== me.group || a.hitBeat >= me.hitBeat) return;
    if (best < 0 || a.hitBeat > choreo.attacks[best].hitBeat) best = i;
  });
  return best;
}

// 踏み込み (v7 T3): 当たりの approach.beats 拍前の位置から、target へ向かって最大 approach.distance 寄る (自機との間に keep を残す)。
// 踏み込みの区間にあった元のキーフレームは捨て、当たりより後のキーフレーム (戻り) はそのまま。寄った先は画面内に収める
export function applyApproach(attack: Attack, target: Vec, cfg: Config, motion: Motion = 'easeOut'): Attack {
  const ap = attack.approach;
  if (!ap) return attack;
  const impact = impactBeat(attack);
  const startBeat = impact - ap.beats;
  const start = pathPosAt(attack.path, startBeat, motion);
  const d = dist(start, target);
  const keep = ap.keep ?? (cfg.playerRadius + cfg.enemyRadius) * APPROACH_KEEP_RATIO;
  const move = Math.min(ap.distance, Math.max(0, d - keep));
  const dir = d > 0 ? { x: (target.x - start.x) / d, y: (target.y - start.y) / d } : { x: 0, y: 0 };
  const end = {
    x: clamp(start.x + dir.x * move, cfg.enemyRadius, WORLD.w - cfg.enemyRadius),
    y: clamp(start.y + dir.y * move, cfg.enemyRadius, WORLD.h - cfg.enemyRadius),
  };
  const eps = 1e-9;
  const path: PathPoint[] = [
    ...attack.path.filter((p) => p.beat < startBeat - eps),
    { beat: startBeat, x: start.x, y: start.y },
    { beat: impact, x: end.x, y: end.y },
    ...attack.path.filter((p) => p.beat > impact + eps),
  ];
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
    // 声部 (v7 T3): track が melody 以外ならその声部の音で見る
    const track = atk.track ?? 'melody';
    if (atk.track && !grid.trackOnsets[atk.track]) {
      out.push({ attackIndex: i, rule: 'track-known', message: `声部 ${atk.track} はグリッドに無い (${Object.keys(grid.trackOnsets).join(', ')})` });
    }
    const noteBeats = track === 'melody' ? (phrase?.noteBeats ?? []) : (grid.trackOnsets[track] ?? []);
    const onNote = noteBeats.some((nb) => Math.abs(nb - atk.hitBeat) <= tolBeats);
    if (!onGrid && !onNote) {
      out.push({ attackIndex: i, rule: 'hit-on-grid', message: `hitBeat ${atk.hitBeat} が拍・半拍・${track === 'melody' ? 'フレーズ' : track}の音に乗っていない` });
    }
    if ((atk.type === 'shot' || atk.type === 'laser' || atk.type === 'sweep') && !atk.target) {
      out.push({ attackIndex: i, rule: 'shot-target', message: `${atk.type} には target が要る` });
    }
    // 狙い直し (v7 T3): telegraphBeat ≤ aimBeat ≤ 当たりの発生拍。telegraphBeat より後は連撃 (group) の 2 発目以降だけ
    if (atk.aimBeat !== undefined) {
      if (atk.aimBeat < atk.telegraphBeat - 1e-9 || atk.aimBeat > impactBeat(atk) + 1e-9) {
        out.push({ attackIndex: i, rule: 'aim-beat', message: `aimBeat ${atk.aimBeat} は telegraphBeat ${atk.telegraphBeat} 〜 当たり ${impactBeat(atk)} の範囲` });
      } else if (atk.aimBeat > atk.telegraphBeat + 1e-9 && isGroupLead(choreo, atk)) {
        out.push({ attackIndex: i, rule: 'aim-beat', message: `aimBeat を telegraphBeat より後に置けるのは連撃 (group) の 2 発目以降だけ` });
      }
    }
    // 踏み込み (v7 T3)
    if (atk.approach) {
      const ap = atk.approach;
      const okType = atk.type === 'shot' || atk.type === 'laser' || atk.type === 'sweep';
      if (!okType || !(ap.beats > 0) || !(ap.distance > 0) || impactBeat(atk) - ap.beats < atk.telegraphBeat - 1e-9) {
        out.push({ attackIndex: i, rule: 'approach-shape', message: `approach は shot / laser / sweep に、beats > 0、distance > 0、当たり − beats ≥ telegraphBeat で (${atk.type}, ${ap.beats}, ${ap.distance})` });
      }
    }
    // 薙ぎ払い (v7 T3)
    if (atk.type === 'sweep' && (!(atk.length !== undefined && atk.length > 0) || !atk.sweepDeg)) {
      out.push({ attackIndex: i, rule: 'sweep-shape', message: `sweep には length > 0 と sweepDeg ≠ 0 が要る (${atk.length}, ${atk.sweepDeg})` });
    }
    if (atk.type === 'laser' && atk.length !== undefined && !(atk.length > 0)) {
      out.push({ attackIndex: i, rule: 'sweep-shape', message: `laser の length は > 0 (${atk.length})` });
    }
    // 大技の印 (v7 T4): heavy は laser / sweep / slam にだけ。dash と shot の相殺は本体や弾の形で見ていて、両手放ちの「叩き落とす」感じに合わない
    if (atk.heavy && atk.type !== 'laser' && atk.type !== 'sweep' && atk.type !== 'slam') {
      out.push({ attackIndex: i, rule: 'heavy-shape', message: `heavy を付けられるのは laser / sweep / slam だけ (${atk.type})` });
    }
    // 前の攻撃の終点に続く (v7.1): 連撃 (group) の 2 発目以降だけ
    if (atk.followPrev && prevInGroup(choreo, i) < 0) {
      out.push({ attackIndex: i, rule: 'follow-shape', message: 'followPrev は group の 2 発目以降だけ (直前の攻撃が要る)' });
    }
    const delay = atk.impactDelayBeats ?? 0;
    if (delay < 0 || delay > IMPACT_DELAY_MAX_BEATS) {
      out.push({ attackIndex: i, rule: 'impact-delay', message: `impactDelayBeats ${delay} は 0〜${IMPACT_DELAY_MAX_BEATS} 拍の範囲` });
    }
    // 連なる攻撃 (v5 T6): chained は同じフレーズに自分より先に当たる chained でない攻撃を持つこと
    if (atk.chained && !choreo.attacks.some((a) => !a.chained && a.phrase === atk.phrase && a.hitBeat < atk.hitBeat)) {
      out.push({ attackIndex: i, rule: 'chain-order', message: `chained だが phrase ${atk.phrase} に先に当たる 1 つ目の攻撃が無い` });
    }
    // slam (v6 T4): 枠と辺の太さがあり、円の外に帯が残ること
    if (atk.type === 'slam') {
      const half = atk.frameHalf ?? 0;
      const lr = atk.laserR ?? 0;
      if (!(half > 0) || !(lr > 0) || half <= atk.hitbox.r + lr) {
        out.push({ attackIndex: i, rule: 'slam-shape', message: `slam には frameHalf (${half}) > hitbox.r (${atk.hitbox.r}) + laserR (${lr}) が要る` });
      }
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
          message: `自機狙い: 狙いが決まる拍 ${aimBeatOf(atk)} に (${r.failedAt.x.toFixed(3)}, ${r.failedAt.y.toFixed(3)}) にいると ${r.reach.toFixed(3)} 以内に安全位置が無い`,
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
  // 走れる時間は狙いが決まる拍 (aimBeat。省略時 telegraphBeat) から当たりまで (v7 T3: 連撃の狙い直しは短い)
  const reach = cfg.playerSpeed * (impactBeat(atk) - aimBeatOf(atk)) * grid.beatSec * (1 - acceptance.dodgeTimeMarginRatio);
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
  return samples.some((h) => touches(p, h, cfg.playerRadius));
}
