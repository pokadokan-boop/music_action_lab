// 2 体目の敵の姿: 決闘者 (v7 T5、v7.2 で作り直し。docs/decisions/v7-feedback.md 2026-11-10 の指摘 a〜e)。線と面だけで描く半身の剣士。画像ファイルは使わない。
// 半身 (e): 肩と腰を奥行きで前後にずらし (奥側は少し後ろ・上、暗く)、面頬は顔の前半分、足先は前向き。格ゲーの立ち絵の向き。
// 体の厚み (a): 胸当て・腹の帯・腰の草摺・膝当て・籠手・長靴・マント。手足は太さを持つ帯 (暗い縁)。
// 剣 (b): 柄頭・柄・鍔・刃 (樋と刃筋) を握りの位置に。大上段は奥の手も柄を握る (2 関節の IK)。
// 動き (c): 鍵フレームに重心 (腰の前後 shift) と体のひねり (胴の幅 twist) を持ち、予備動作と余韻、構えの揺れ (剣先の小さな円)、マントの遅れ。
// 浮遊剣 (d): 本体の剣と同じ形の 0.8 倍で統一。構えでは背の上で扇に並び、打点では攻撃の向きへそろい、飛ぶ剣の弾は浮遊剣そのものが飛ぶ (drawFlyingSword)。
// 形態 (曲の段): 段 1 = 軽装 (剣 1 本) → 段 2 = 鎧 (肩当て・胸当て・草摺・マント) と 2 本目の剣 → 段 3 = 浮遊剣が背後に並び、鎧と面が光る。
// 段の中の進みで 肩当ての大きさ・光の強さ・浮遊剣の広がり が連続で変わり、段の切り替わり (小節 8 / 16 の頭) で部品が一気に出る。
// 動きの位相は core (pose.ts の enemyMotion: pre / post) から。攻撃の向き (上下) は打点の鍵フレームに効く重みで腕を回し、顔と上体はその半分ほど追う。
// 作法は docs/decisions/v6-feedback.md 2026-11-07 (膝は両脚とも前、薙ぎ払いは一息で 120 度で止めて顔を背中側へ、腕は顔に被らない、帯で描く)。
// 単位 U は人型の身長 約 95、長さの単位は r (当たりの半径) の 1/20。角度は「下から前へ」(手足。0 = 真下、90 = 前、180 = 真上) と「上から前へ」(胴・首。0 = 真上、90 = 前)。前 = +x、下 = +y
import type { EnemyMotion } from '../core/pose';
import type { StageInfo } from '../core/stage';
import type { EnemyMove } from '../core/choreo';
import { clamp, lerp, type Vec } from '../core/vec';

const INK = '#101014';
const BLADE = '#dcdce8';
const BLADE_EDGE = '#ffffff';
const GOLD = '#e2c36b';
const GRIP = '#3a2a30';
const GLOW = '#ff9ad6';
const GLOW_PALE = '#ffd6f0';
const DARKEN = 'rgba(0, 0, 0, 0.35)';
const DARKEN_SOFT = 'rgba(0, 0, 0, 0.18)';
const LIGHTEN = 'rgba(255, 255, 255, 0.4)';

// 鍵フレームの構え。hipH = 腰の高さ (38 が立位)、lean = 上体の前傾 (上から前へ)、neck = 首、tilt = 顔の傾き (正で鼻先が下)。
// aF / aB = 手前 / 奥の腕 [上腕の角度 (下から前へ), 前腕の相対角]。lF / lB = 脚 [太ももの角度, すねの相対角 (0 以下 = 膝が前)]。
// swF / swB = 手前 / 奥の剣の、前腕に対する角度 (0 で前腕の延長)。shift = 腰の前後 (重心。+ で前)。twist = 胴の幅の倍率 (1 が半身。小さいと背を向け、大きいと開く)。
// twoHand = 奥の手も柄を握る (大上段)
interface Pose {
  hipH: number;
  lean: number;
  neck: number;
  tilt: number;
  aF: [number, number];
  aB: [number, number];
  lF: [number, number];
  lB: [number, number];
  swF: number;
  swB: number;
  shift: number;
  twist: number;
  twoHand: boolean;
}

type PoseName = 'guard' | 'draw' | 'thrust' | 'raise' | 'down' | 'raiseBoth' | 'downBoth' | 'windup' | 'follow' | 'crouch' | 'lunge' | 'cast' | 'castReady' | 'low';

const P = (
  hipH: number, lean: number, neck: number, tilt: number,
  aF: [number, number], aB: [number, number], lF: [number, number], lB: [number, number],
  swF: number, swB: number, shift: number, twist: number, twoHand = false,
): Pose => ({ hipH, lean, neck, tilt, aF, aB, lF, lB, swF, swB, shift, twist, twoHand });

const POSES: Record<PoseName, Pose> = {
  // 中段の構え: 剣先を前へ。奥の腕は後ろで軽く曲げる。足は前後に開く
  guard: P(36, 6, 0, 0, [58, 30], [-20, 34], [22, -16], [-24, -10], 2, -10, 0, 1),
  // 突きの引き: 柄を腰の横まで引き、剣先は前。重心は後ろ、体は少し背を向ける
  draw: P(35, -4, 2, 2, [-28, 116], [-34, 32], [12, -8], [-30, -4], 0, -10, -4, 0.88),
  // 突き: 腕と剣が一直線に前へ。前脚を大きく踏み込み、後脚は伸びる。重心は前
  thrust: P(33, 28, 6, 4, [93, 0], [-58, 30], [58, -40], [-48, 0], 0, -10, 9, 1.05),
  // 振り上げ (上段): 腕を頭の上へ、剣は後ろへ倒れる。上体は反る
  raise: P(37, -8, -4, -6, [160, 20], [-24, 26], [10, -10], [-28, -4], -14, -10, -3, 0.95),
  // 振り下ろし: 腕を前下へ振り切る。剣先は前下。重心は前
  down: P(32, 30, 10, 12, [72, -8], [-36, 28], [48, -34], [-34, 0], -10, -10, 6, 1.1),
  // 大上段 (大技): 両手で頭上に振りかぶる。大きく反る
  raiseBoth: P(37, -16, -8, -10, [164, 18], [150, 24], [6, -8], [-32, -2], -12, 0, -4, 0.95, true),
  // 大上段の振り下ろし: 体ごと前へ倒れ込み、両腕で前下へ
  downBoth: P(30, 42, 14, 14, [68, -6], [60, 0], [60, -46], [-40, 0], -10, 0, 8, 1.1, true),
  // 薙ぎ払いの引き: 腕を後ろへ、体は背を向け気味に捻る
  windup: P(36, -4, -2, 0, [-72, 14], [-24, 30], [14, -10], [-24, -4], -34, -10, -5, 0.78),
  // 薙ぎ払いの振り抜き: 腕は顔に被らない 120 度で止め、顔は背中側へ引いて上を向く。体は開く
  follow: P(35, 8, -20, -14, [120, 24], [-34, 30], [32, -16], [-28, -4], -6, -10, 5, 1.18),
  // 突進の構え: 深く沈み、剣を脇に抱える
  crouch: P(30, 22, 4, 4, [36, 44], [-34, 40], [38, -46], [-20, -30], 4, -10, -2, 0.95),
  // 突進: 体を前へ投げ出し、剣は前へ一直線
  lunge: P(32, 46, 8, 6, [98, -4], [-54, 30], [62, -22], [-54, 0], 0, -10, 12, 1.05),
  // 飛ぶ剣を放つ前: 奥の腕を上げて浮遊剣を呼ぶ
  castReady: P(36, 2, -4, -4, [56, 28], [150, -12], [18, -14], [-24, -8], 2, 0, -1, 1),
  // 放つ: 奥の腕を前へ振る
  cast: P(35, 10, 2, 2, [58, 26], [112, -8], [26, -18], [-28, -6], 2, 0, 4, 1.05),
  // 低い構え (止まる・寄る・離れる)
  low: P(33, 12, 2, 2, [52, 32], [-26, 32], [28, -30], [-26, -16], 4, -10, 0, 1),
};

// 鍵 = [位相 (0〜1), 構え, 攻撃の向きの重み]。pre は予告開始 → 当たり、post は当たり → 余韻の終わり
type Key = [number, PoseName, number];
interface Motion {
  pre: Key[];
  post: Key[];
  // 顔と上体が向きを追う割合
  headFollow: number;
}

const MOTIONS: Record<EnemyMove, Motion> = {
  thrust: { pre: [[0, 'guard', 0], [0.55, 'draw', 0.6], [1, 'draw', 1]], post: [[0, 'draw', 1], [0.12, 'thrust', 1], [0.55, 'thrust', 1], [1, 'guard', 0]], headFollow: 1 },
  chop: { pre: [[0, 'guard', 0], [0.5, 'raise', 0.5], [1, 'raise', 0.8]], post: [[0, 'raise', 0.8], [0.15, 'down', 1], [0.6, 'down', 1], [1, 'guard', 0]], headFollow: 0.6 },
  heavyChop: { pre: [[0, 'guard', 0], [0.45, 'raiseBoth', 0.4], [1, 'raiseBoth', 0.7]], post: [[0, 'raiseBoth', 0.7], [0.1, 'downBoth', 1], [0.65, 'downBoth', 1], [1, 'guard', 0]], headFollow: 0.5 },
  sweep: { pre: [[0, 'guard', 0], [0.5, 'windup', 0.4], [1, 'windup', 0.6]], post: [[0, 'windup', 0.6], [0.5, 'follow', 1], [0.7, 'follow', 0.8], [1, 'guard', 0]], headFollow: 1 },
  dash: { pre: [[0, 'guard', 0], [0.4, 'crouch', 0.3], [1, 'crouch', 0.5]], post: [[0, 'crouch', 0.5], [0.15, 'lunge', 1], [0.6, 'lunge', 1], [1, 'guard', 0]], headFollow: 1 },
  shot: { pre: [[0, 'guard', 0], [0.5, 'castReady', 0.3], [1, 'castReady', 0.6]], post: [[0, 'castReady', 0.6], [0.15, 'cast', 1], [0.6, 'cast', 1], [1, 'guard', 0]], headFollow: 0.8 },
  slam: { pre: [[0, 'guard', 0], [0.5, 'raiseBoth', 0], [1, 'raiseBoth', 0]], post: [[0, 'raiseBoth', 0], [0.15, 'downBoth', 0], [0.6, 'downBoth', 0], [1, 'guard', 0]], headFollow: 0 },
  burst: { pre: [[0, 'guard', 0], [0.5, 'raiseBoth', 0], [1, 'raiseBoth', 0]], post: [[0, 'raiseBoth', 0], [0.15, 'downBoth', 0], [0.6, 'downBoth', 0], [1, 'guard', 0]], headFollow: 0 },
};

const rad = (d: number) => (d * Math.PI) / 180;
const vd = (deg: number): Vec => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });
const vu = (deg: number): Vec => ({ x: Math.sin(rad(deg)), y: -Math.cos(rad(deg)) });
const add = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

function mixPose(a: Pose, b: Pose, k: number): Pose {
  const m2 = (p: [number, number], q: [number, number]): [number, number] => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    hipH: lerp(a.hipH, b.hipH, k),
    lean: lerp(a.lean, b.lean, k),
    neck: lerp(a.neck, b.neck, k),
    tilt: lerp(a.tilt, b.tilt, k),
    aF: m2(a.aF, b.aF),
    aB: m2(a.aB, b.aB),
    lF: m2(a.lF, b.lF),
    lB: m2(a.lB, b.lB),
    swF: lerp(a.swF, b.swF, k),
    swB: lerp(a.swB, b.swB, k),
    shift: lerp(a.shift, b.shift, k),
    twist: lerp(a.twist, b.twist, k),
    twoHand: k < 0.5 ? a.twoHand : b.twoHand,
  };
}

// 段が進むほど動きを大きく: 前傾 1.35 倍、脚の開き 1.2 倍、重心の移動 1.4 倍まで。構え (guard) は変えない
function exaggerate(p: Pose, amount: number): Pose {
  const k = 1 + 0.35 * amount;
  const kl = 1 + 0.2 * amount;
  return { ...p, lean: p.lean * k, lF: [p.lF[0] * kl, p.lF[1]], lB: [p.lB[0] * kl, p.lB[1]], shift: p.shift * (1 + 0.4 * amount) };
}

function keyPose(keys: Key[], phase: number, amount: number): { pose: Pose; aimW: number } {
  let i = 0;
  while (i < keys.length - 2 && phase > keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = ease(clamp((phase - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1));
  const pa = a[1] === 'guard' ? POSES.guard : exaggerate(POSES[a[1]], amount);
  const pb = b[1] === 'guard' ? POSES.guard : exaggerate(POSES[b[1]], amount);
  return { pose: mixPose(pa, pb, u), aimW: lerp(a[2], b[2], u) };
}

// 動きの位相から構えと向きの重みを出す。move が無ければ構え (idle)。stopped / approach / retreat は低い構え
export function duelistPose(m: EnemyMotion, idle: 'guard' | 'low', amount: number): { pose: Pose; aimW: number; headW: number } {
  if (!m.move) return { pose: POSES[idle], aimW: 0, headW: 1 };
  const mo = MOTIONS[m.move];
  const k = m.post > 0 ? keyPose(mo.post, m.post, amount) : keyPose(mo.pre, m.pre, amount);
  return { ...k, headW: mo.headFollow };
}

// 攻撃の向き (aimUp: 正で上。度) の補正。腕は向きのぶん回り、顔と上体は headW の割合で追う
function applyAim(p: Pose, aimUp: number, aimW: number, headW: number): Pose {
  const hw = headW * aimW;
  return {
    ...p,
    aF: [p.aF[0] + aimUp * aimW, p.aF[1]],
    aB: [p.aB[0] + aimUp * aimW * (p.twoHand ? 1 : 0.6), p.aB[1]],
    tilt: p.tilt - aimUp * 0.5 * hw,
    lean: p.lean - aimUp * 0.25 * hw,
    neck: p.neck - aimUp * 0.45 * hw,
  };
}

// 2 関節の IK: root から長さ l1 / l2 で target へ届く関節の位置。bend は曲げる側。届かなければ伸ばす
function ik2(root: Vec, target: Vec, l1: number, l2: number, bend: 1 | -1): { joint: Vec; end: Vec } {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = Math.max(1e-6, Math.hypot(dx, dy));
  const reach = Math.min(d, l1 + l2 - 1e-3);
  const a = clamp((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach), -1, 1);
  const ang = Math.atan2(dy, dx) + bend * Math.acos(a);
  const joint = { x: root.x + Math.cos(ang) * l1, y: root.y + Math.sin(ang) * l1 };
  const ux = dx / d;
  const uy = dy / d;
  const end = reach < d ? { x: root.x + ux * reach, y: root.y + uy * reach } : { x: target.x, y: target.y };
  return { joint, end };
}

// 太さを持つ手足: 暗い縁を太く、内側を体の色で。奥側は暗く
function limb(ctx: CanvasRenderingContext2D, pts: Vec[], widths: number[], color: string, darken: boolean): void {
  for (let pass = 0; pass < (darken ? 3 : 2); pass++) {
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.strokeStyle = pass === 0 ? INK : pass === 1 ? color : DARKEN;
      ctx.lineWidth = pass === 0 ? widths[i] + 2.4 : widths[i];
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
  }
}

// 今の path を color で塗り、overlay があれば重ねて暗く / 明るくする。縁は INK
function fillPath(ctx: CanvasRenderingContext2D, color: string, overlay: string | null, outline = 1.8): void {
  ctx.fillStyle = color;
  ctx.fill();
  if (overlay) {
    ctx.fillStyle = overlay;
    ctx.fill();
  }
  if (outline > 0) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = outline;
    ctx.stroke();
  }
}

function poly(ctx: CanvasRenderingContext2D, pts: Vec[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

// 剣: 握りの位置 grip (手の中心) から向き dir へ。柄頭 → 柄 → 鍔 → 刃 (樋と刃筋)。scale で浮遊剣 (0.8) と飛ぶ剣を同じ形に
export function drawSword(ctx: CanvasRenderingContext2D, grip: Vec, dir: Vec, scale: number, glow: number): void {
  const n = { x: -dir.y, y: dir.x };
  const s = scale;
  const at = (k: number, side = 0): Vec => ({ x: grip.x + dir.x * k * s + n.x * side * s, y: grip.y + dir.y * k * s + n.y * side * s });
  // 柄頭
  ctx.beginPath();
  ctx.arc(at(-5.5).x, at(-5.5).y, 1.9 * s, 0, Math.PI * 2);
  fillPath(ctx, GOLD, null, 1.2);
  // 柄 (巻き)
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.6 * s;
  ctx.beginPath();
  ctx.moveTo(at(-4.5).x, at(-4.5).y);
  ctx.lineTo(at(2.5).x, at(2.5).y);
  ctx.stroke();
  ctx.strokeStyle = GRIP;
  ctx.lineWidth = 2.4 * s;
  ctx.beginPath();
  ctx.moveTo(at(-4.5).x, at(-4.5).y);
  ctx.lineTo(at(2.5).x, at(2.5).y);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.9 * s;
  for (const k of [-3, -1, 1]) {
    ctx.beginPath();
    ctx.moveTo(at(k, -1.2).x, at(k, -1.2).y);
    ctx.lineTo(at(k, 1.2).x, at(k, 1.2).y);
    ctx.stroke();
  }
  // 刃
  const L = 31;
  ctx.save();
  if (glow > 0.01) {
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 10 * glow;
  }
  poly(ctx, [at(3.5, 1.7), at(3.5 + L * 0.86, 1.5), at(3.5 + L), at(3.5 + L * 0.86, -1.5), at(3.5, -1.7)]);
  fillPath(ctx, BLADE, null, 1.3);
  ctx.restore();
  // 樋 (溝) と刃筋の光
  ctx.strokeStyle = 'rgba(16, 16, 20, 0.35)';
  ctx.lineWidth = 0.9 * s;
  ctx.beginPath();
  ctx.moveTo(at(5).x, at(5).y);
  ctx.lineTo(at(3.5 + L * 0.7).x, at(3.5 + L * 0.7).y);
  ctx.stroke();
  ctx.strokeStyle = BLADE_EDGE;
  ctx.lineWidth = 0.8 * s;
  ctx.beginPath();
  ctx.moveTo(at(6, 1.1).x, at(6, 1.1).y);
  ctx.lineTo(at(3.5 + L * 0.8, 1).x, at(3.5 + L * 0.8, 1).y);
  ctx.stroke();
  // 鍔 (横棒。両端が少し前へ)
  poly(ctx, [at(2.6, -5.5), at(3.6, -5.5), at(3.9, -1.6), at(3.9, 1.6), at(3.6, 5.5), at(2.6, 5.5), at(2.3, 1.6), at(2.3, -1.6)]);
  fillPath(ctx, GOLD, null, 1.2);
}

// 籠手と手: 前腕の先に厚い手甲、手は柄を握る丸
function gauntlet(ctx: CanvasRenderingContext2D, hand: Vec, foreDir: Vec, width: number, color: string, darken: boolean): void {
  const cuff = add(hand, foreDir, -5.5);
  limb(ctx, [cuff, add(hand, foreDir, -1)], [width + 2.2], color, darken);
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 2.6, 0, Math.PI * 2);
  fillPath(ctx, color, darken ? DARKEN : DARKEN_SOFT, 1.3);
}

// 長靴: 足首から前へ。先は少し上がる。半身なので前向き
function boot(ctx: CanvasRenderingContext2D, ankle: Vec, color: string, darken: boolean): void {
  poly(ctx, [
    { x: ankle.x - 2.6, y: ankle.y - 3 },
    { x: ankle.x + 2.2, y: ankle.y - 3 },
    { x: ankle.x + 7.5, y: ankle.y - 0.5 },
    { x: ankle.x + 7.8, y: ankle.y + 2 },
    { x: ankle.x - 3, y: ankle.y + 2.4 },
  ]);
  fillPath(ctx, color, darken ? DARKEN : DARKEN_SOFT, 1.5);
}

// 膝当て
function kneePad(ctx: CanvasRenderingContext2D, k: Vec, color: string, darken: boolean): void {
  ctx.beginPath();
  ctx.arc(k.x + 0.5, k.y, 3.3, 0, Math.PI * 2);
  fillPath(ctx, color, darken ? DARKEN : LIGHTEN, 1.3);
}

// 肩当て: 肩を覆う半円。段が進むと大きく
function pauldron(ctx: CanvasRenderingContext2D, at: Vec, size: number, color: string, darken: boolean, lean: number): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(rad(lean));
  ctx.beginPath();
  ctx.arc(0, 0, size, Math.PI, Math.PI * 2);
  ctx.lineTo(size, 2);
  ctx.lineTo(-size, 2);
  ctx.closePath();
  fillPath(ctx, color, darken ? DARKEN : LIGHTEN, 1.6);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.62, Math.PI, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export interface DuelistLook {
  stage: number;
  progress: number;
}

// 決闘者を描く。center は判定の円の中心 (ピクセル)、r は判定の半径 (ピクセル)。胴の中心が判定の円に重なる。
// motion は core の位相、dir は攻撃の来る方向か自機の側 (単位ベクトル)。pulse は拍の頭で 1。t は拍 (構えの揺れとマントの揺れに使う。無ければ 0)。
// flashWhite は命中の瞬間。idle は攻撃していないときの構え (guard / low)。st は曲の段と進み
export function drawDuelist(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  r: number,
  motion: EnemyMotion,
  dir: Vec,
  pulse: number,
  color: string,
  flashWhite: boolean,
  idle: 'guard' | 'low',
  st: StageInfo,
  t = 0,
): void {
  const d = dir.x === 0 && dir.y === 0 ? { x: -1, y: 0 } : dir;
  const face: 1 | -1 = d.x < 0 ? -1 : 1;
  const aimUp = clamp((-Math.atan2(d.y, Math.abs(d.x)) * 180) / Math.PI, -50, 50);
  const stage = st.stage;
  const q = st.progress;
  const amount = st.overall;
  const body = flashWhite ? '#ffffff' : color;
  const glow = stage >= 2 ? 0.5 + 0.5 * q : 0;
  const armored = stage >= 1;

  const pp = duelistPose(motion, idle, amount);
  const idling = motion.move === null;
  // 構えの揺れ: 剣先が小さく円を描き、重心が拍で前後に揺れる
  const sway = idling ? Math.sin(t * Math.PI) : 0;
  const base: Pose = idling
    ? { ...pp.pose, swF: pp.pose.swF + 3 * sway, aF: [pp.pose.aF[0] + 2 * Math.cos(t * Math.PI), pp.pose.aF[1]], shift: pp.pose.shift + 1.5 * sway }
    : pp.pose;
  const pose = applyAim(base, aimUp, pp.aimW, pp.headW);

  const k = r / 20;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(k * face, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 骨組み。腰 H は判定の中心の 14 下。腰が沈む構えでは全体が少し下がる。拍の頭で少し沈む
  const sink = (38 - pose.hipH) * 0.6 + 1.2 * pulse * (idling ? 1 : 0);
  const H: Vec = { x: pose.shift, y: 14 + sink };
  const dirT = vu(pose.lean);
  const perp: Vec = { x: Math.cos(rad(pose.lean)), y: Math.sin(rad(pose.lean)) };
  const tw = pose.twist;
  const torsoLen = 34;
  const S = add(H, dirT, torsoLen);
  const HC = add(add(S, dirT, 3), vu(pose.neck), 10);
  const upperLen = 13;
  const foreLen = 12;
  const thigh = 20;
  const shin = 19;
  // 半身: 奥の肩は後ろ・上、手前の肩は前・下。腰も同じ
  const SB = add(add(S, perp, -7 * tw), { x: 0, y: -1 }, 2);
  const SF = add(add(S, perp, 5 * tw), { x: 0, y: 1 }, 1);
  const HB = add(H, perp, -3.5 * tw);
  const HF = add(H, perp, 3 * tw);
  const armPts = (a: [number, number], root: Vec): Vec[] => {
    const U = add(root, vd(a[0]), upperLen);
    return [root, U, add(U, vd(a[0] + a[1]), foreLen)];
  };
  const legPts = (l: [number, number], hip: Vec): Vec[] => {
    const K = add(hip, vd(l[0]), thigh);
    return [hip, K, add(K, vd(l[0] + l[1]), shin)];
  };
  const armF = armPts(pose.aF, SF);
  const legF = legPts(pose.lF, HF);
  const legB = legPts(pose.lB, HB);
  const foreDirF = vd(pose.aF[0] + pose.aF[1]);
  const swordDirF = vd(pose.aF[0] + pose.aF[1] + pose.swF);
  // 奥の腕: 両手持ちなら柄の下 (手前の手の 4.5 後ろ) を握るよう IK、そうでなければ鍵フレームの角度
  let armB = armPts(pose.aB, SB);
  if (pose.twoHand) {
    const target = add(armF[2], swordDirF, -4.5);
    const s = ik2(SB, target, upperLen, foreLen, 1);
    armB = [SB, s.joint, s.end];
  }
  const foreDirB0 = { x: armB[2].x - armB[1].x, y: armB[2].y - armB[1].y };
  const fbLen = Math.hypot(foreDirB0.x, foreDirB0.y) || 1;
  const foreDirB = { x: foreDirB0.x / fbLen, y: foreDirB0.y / fbLen };
  const swordDirB = vd(pose.aB[0] + pose.aB[1] + pose.swB);

  const wUp = 5.4 + 1.2 * amount;
  const wFore = 4.6 + 0.8 * amount;
  const wThigh = 6.4;
  const wShin = 5.2;
  const pauldronSize = armored ? 5 + 2.5 * (stage === 1 ? q : 1) : 3.2;

  // マント (段 2 から): 奥の肩から背へ。重心と逆に遅れてなびく
  if (armored) {
    const swing = -pose.shift * 0.5 + (idling ? 1.5 * Math.sin(t * Math.PI * 0.5) : 0);
    const top = add(SB, perp, -2);
    const c1 = { x: top.x - 10 - pose.lean * 0.2 + swing, y: top.y + 14 };
    const end = { x: top.x - 7 - pose.lean * 0.45 + swing * 1.6, y: top.y + 32 };
    const w0 = 6;
    const w1 = 12;
    ctx.beginPath();
    ctx.moveTo(top.x + w0 * 0.5, top.y);
    ctx.quadraticCurveTo(c1.x + w1 * 0.4, c1.y, end.x + w1 * 0.5, end.y);
    ctx.lineTo(end.x - w1 * 0.5, end.y + 1.5);
    ctx.quadraticCurveTo(c1.x - w1 * 0.4, c1.y, top.x - w0 * 0.5, top.y + 1);
    ctx.closePath();
    fillPath(ctx, body, DARKEN, 1.6);
  }

  // 浮遊剣 (段 3): 背の上で扇に並ぶ (本体の剣と同じ形、0.8 倍)。構えでは上向き、打点では攻撃の向きへそろう。進みで広がる。
  // 飛ぶ剣 (cast) では向きの重みで前へ滑り出す
  if (stage >= 2) {
    const n = q > 0.5 ? 4 : 3;
    const radius = 15 + 5 * q;
    const C = add(add(S, perp, -12), { x: 0, y: -1 }, 2);
    const aimDir = vd(90 + aimUp);
    const w = pp.aimW;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1);
      // 弧の角度: 後ろ下 (-165 度) から前上 (-55 度) へ。画面座標 (0 = 前、-90 = 上)
      const th = rad(-165 + 110 * tt);
      const radial = { x: Math.cos(th), y: Math.sin(th) };
      const home = add(C, radial, radius);
      const sd = { x: lerp(radial.x, aimDir.x, w), y: lerp(radial.y, aimDir.y, w) };
      const len = Math.hypot(sd.x, sd.y) || 1;
      const u = { x: sd.x / len, y: sd.y / len };
      const launch = motion.move === 'shot' && i === n - 1 ? 14 * w : 0;
      // 握りを中心寄りに置き、剣先が外を向く
      drawSword(ctx, add(add(home, u, -10), u, launch), u, 0.8, glow);
    }
  }

  // 奥の脚
  limb(ctx, legB, [wThigh, wShin], body, true);
  kneePad(ctx, legB[1], body, true);
  boot(ctx, legB[2], body, true);
  // 奥の腕 (両手持ちでなければ胴の奥)
  if (!pose.twoHand) {
    limb(ctx, armB, [wUp, wFore], body, true);
    gauntlet(ctx, armB[2], foreDirB, wFore, body, true);
    if (armored) drawSword(ctx, armB[2], swordDirB, 0.85, glow * 0.6);
  }

  // 胴: 腰から肩へ。半身なので手前側が広い。腹の帯、胸当て
  const hb = add(H, perp, -6 * tw);
  const hf = add(H, perp, 6.5 * tw);
  const sb = add(S, perp, -9 * tw);
  const sf = add(S, perp, 8 * tw);
  poly(ctx, [hb, sb, add(sf, dirT, 0.5), hf]);
  fillPath(ctx, body, null, 2);
  // 腹の帯 (暗い)
  const b0 = add(H, dirT, 11);
  const b1 = add(H, dirT, 16);
  poly(ctx, [add(b0, perp, -6.3 * tw), add(b1, perp, -6.8 * tw), add(b1, perp, 7 * tw), add(b0, perp, 6.6 * tw)]);
  fillPath(ctx, body, DARKEN, 1.2);
  // 胸当て: 胴の上半分、中央の稜線が前寄り (半身)
  const c0 = add(H, dirT, 17);
  const ridgeTop = add(S, perp, 1.5 * tw);
  const ridgeBot = add(c0, perp, 1 * tw);
  poly(ctx, [add(c0, perp, -7 * tw), add(sb, dirT, -1), add(sf, dirT, -1.5), add(c0, perp, 7.2 * tw)]);
  fillPath(ctx, body, armored ? LIGHTEN : DARKEN_SOFT, 1.4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ridgeTop.x, ridgeTop.y);
  ctx.lineTo(ridgeBot.x, ridgeBot.y);
  ctx.stroke();
  if (glow > 0) {
    ctx.save();
    ctx.strokeStyle = GLOW_PALE;
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 8 * glow;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(add(ridgeTop, dirT, -2).x, add(ridgeTop, dirT, -2).y);
    ctx.lineTo(ridgeBot.x, ridgeBot.y);
    ctx.stroke();
    ctx.restore();
  }
  // 腰の草摺 (段 2 から): 腰から垂れる板 3 枚
  if (armored) {
    for (const s0 of [-5.5, 0, 5.5]) {
      const top = add(H, perp, s0 * tw);
      poly(ctx, [add(top, perp, -2.8 * tw), add(top, perp, 2.8 * tw), { x: top.x + 3.2 * tw, y: top.y + 7.5 }, { x: top.x - 3.2 * tw, y: top.y + 7.5 }]);
      fillPath(ctx, body, s0 < 0 ? DARKEN : DARKEN_SOFT, 1.2);
    }
  }
  // 奥の肩当て
  if (armored) pauldron(ctx, SB, pauldronSize * 0.85, body, true, pose.lean);
  // 両手持ちの奥の腕は胴の上 (柄へ伸びる)
  if (pose.twoHand) {
    limb(ctx, armB, [wUp, wFore], body, true);
    gauntlet(ctx, armB[2], foreDirB, wFore, body, true);
  }

  // 頭: 兜 (丸) と面頬 (前半分)、顎の線。段 3 は面が光る
  ctx.save();
  ctx.translate(HC.x, HC.y);
  ctx.rotate(rad(pose.tilt));
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  fillPath(ctx, body, null, 2);
  // 面頬: 前半分の板 (少し暗い)
  ctx.beginPath();
  ctx.moveTo(0.5, -8.8);
  ctx.arc(0, 0, 9, -Math.PI / 2 + 0.06, Math.PI / 2 - 0.1);
  ctx.lineTo(0.5, 8.6);
  ctx.closePath();
  fillPath(ctx, body, DARKEN_SOFT, 1.2);
  // 兜の縁 (額の帯)
  ctx.beginPath();
  ctx.moveTo(-8.2, -3.5);
  ctx.quadraticCurveTo(0, -8.2, 8.6, -2.6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 覗き窓 (前側)。段 3 で光る
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 10 * glow;
    ctx.strokeStyle = GLOW_PALE;
  } else {
    ctx.strokeStyle = INK;
  }
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(1.4, -1.8);
  ctx.lineTo(7.9, -0.6);
  ctx.stroke();
  ctx.restore();
  // 顎の線
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1.6, 4.8);
  ctx.lineTo(6.8, 3.9);
  ctx.stroke();
  // 兜の飾り (段 2 から): 後ろへ流れる
  if (armored) {
    poly(ctx, [{ x: -2.5, y: -8.3 }, { x: -14 - 4 * (stage === 1 ? q : 1), y: -5 }, { x: -5.5, y: -4.2 }]);
    fillPath(ctx, body, DARKEN, 1.2);
  }
  ctx.restore();

  // 手前の脚
  limb(ctx, legF, [wThigh, wShin], body, false);
  kneePad(ctx, legF[1], body, false);
  boot(ctx, legF[2], body, false);

  // 手前の腕と剣。腕を真上に振り上げる構えでは薄くして顔を隠さない
  const armBehindHead = pose.aF[0] > 150;
  if (armBehindHead) ctx.globalAlpha = 0.85;
  limb(ctx, armF, [wUp, wFore], body, false);
  gauntlet(ctx, armF[2], foreDirF, wFore, body, false);
  ctx.globalAlpha = 1;
  drawSword(ctx, armF[2], swordDirF, 1, glow);
  pauldron(ctx, SF, pauldronSize, body, false, pose.lean);

  ctx.restore();
}

// 飛ぶ剣 (shot の弾) の絵: 当たりの円の中心に、進む向きへ浮遊剣と同じ形の剣を重ねる。r は敵の当たりの半径 (ピクセル。大きさの基準)
export function drawFlyingSword(ctx: CanvasRenderingContext2D, center: Vec, dir: Vec, r: number, glow: number): void {
  const k = r / 20;
  const len = Math.hypot(dir.x, dir.y) || 1;
  const u = { x: dir.x / len, y: dir.y / len };
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 剣先が当たりの円の先端に来るように、握りを後ろへ
  drawSword(ctx, add({ x: 0, y: 0 }, u, -18), u, 0.8, glow);
  ctx.restore();
}

// 確認用: 動きの位相を 2 拍 1 周の時刻から作る (pre に 1 拍、post に 1 拍)。figure.html が使う
export function motionFromLoop(move: EnemyMove | null, phase: number): EnemyMotion {
  if (!move) return { move: null, attack: null, pre: 0, post: 0 };
  const u = phase % 1;
  return u < 0.5 ? { move, attack: null, pre: u * 2, post: 0 } : { move, attack: null, pre: 1, post: (u - 0.5) * 2 };
}
