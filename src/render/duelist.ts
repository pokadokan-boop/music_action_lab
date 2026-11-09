// 2 体目の敵の姿: 決闘者 (v7 T5。docs/plan/v7-phase2-enemy.md「T5」)。線と面だけで描く人型の剣士。画像ファイルは使わない。
// 形態 (曲の段): 段 1 = 剣 1 本の軽装 → 段 2 = 鎧 (肩当て・胸当て) と 2 本目の剣 → 段 3 = 浮遊剣が背後に並び、鎧と面が光る (本人: 「剣を増やしてマジカルに」)。
// 段の中の進みで 肩当ての大きさ・光の強さ・浮遊剣の広がり が連続で変わり、段の切り替わり (小節 8 / 16 の頭) で部品が一気に出る。
// 動き: 攻撃の型ごとの鍵フレーム (構え → 予備 → 打点 → 余韻 → 構え) を core の位相 (pose.ts の enemyMotion: pre / post) で補間する。
// 攻撃の向き (上下) は打点の鍵フレームに効く重みで腕を回し、顔と上体はその半分ほど追う。腕は顔に被らない角度 (120 度) で止める。
// 膝は両脚とも前。腕と脚は太さを持つ帯 (外側に暗い縁、内側を体の色)。作法は docs/decisions/v6-feedback.md 2026-11-07。
// 骨組みと角度の決まりは prototypes/morph-slider.html から: 単位 U は人型の身長 約 95、長さの単位は r (当たりの半径) の 1/20。
// 角度は「下から前へ」(手足。0 = 真下、90 = 前、180 = 真上) と「上から前へ」(胴・首。0 = 真上、90 = 前)。前 = +x、下 = +y
import type { EnemyMotion } from '../core/pose';
import type { StageInfo } from '../core/stage';
import type { EnemyMove } from '../core/choreo';
import { clamp, lerp, type Vec } from '../core/vec';

const INK = '#101014';
const BLADE = '#e6e6f0';
const BLADE_EDGE = '#ffffff';
const GLOW = '#ff9ad6';
const GLOW_PALE = '#ffd6f0';
const DARKEN = 'rgba(0, 0, 0, 0.35)';
const LIGHTEN = 'rgba(255, 255, 255, 0.45)';

// 鍵フレームの構え。hipH = 腰の高さ (38 が立位。低いほど沈む)、lean = 上体の前傾 (上から前へ)、neck = 首、tilt = 顔の傾き (正で鼻先が下)。
// aF / aB = 手前 / 奥の腕 [上腕の角度 (下から前へ), 前腕の相対角]。lF / lB = 脚 [太ももの角度, すねの相対角 (0 以下 = 膝が前)]。
// swF / swB = 手前 / 奥の剣の、前腕に対する角度 (0 で前腕の延長)
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
}

type PoseName = 'guard' | 'draw' | 'thrust' | 'raise' | 'down' | 'raiseBoth' | 'downBoth' | 'windup' | 'follow' | 'crouch' | 'lunge' | 'cast' | 'castReady' | 'low';

// 構えの表。段が進むと exaggerate で前傾と脚の開きを増やす (「体も大きく動く」)
const POSES: Record<PoseName, Pose> = {
  // 中段の構え: 剣先を前へ。奥の腕は後ろに下げる
  guard: { hipH: 36, lean: 6, neck: 0, tilt: 0, aF: [62, 24], aB: [-18, 28], lF: [18, -14], lB: [-20, -10], swF: 4, swB: 0 },
  // 突きの引き: 柄を腰の横まで引き、剣先は前を向いたまま。重心は後ろ
  draw: { hipH: 35, lean: -4, neck: 2, tilt: 2, aF: [-25, 112], aB: [-30, 30], lF: [14, -10], lB: [-28, -4], swF: 2, swB: 0 },
  // 突き: 腕と剣が一直線に前へ。前脚を大きく踏み込み、後脚は伸びる
  thrust: { hipH: 33, lean: 28, neck: 6, tilt: 4, aF: [93, 0], aB: [-55, 32], lF: [56, -40], lB: [-46, 0], swF: 0, swB: 0 },
  // 振り上げ (上段): 腕を頭の上へ。剣は後ろへ倒れる。上体は少し反る
  raise: { hipH: 37, lean: -8, neck: -4, tilt: -6, aF: [162, 18], aB: [-20, 26], lF: [10, -10], lB: [-26, -4], swF: -14, swB: 0 },
  // 振り下ろし: 腕を前下へ振り切る。剣先は前下
  down: { hipH: 32, lean: 30, neck: 10, tilt: 12, aF: [74, -8], aB: [-35, 28], lF: [46, -32], lB: [-32, 0], swF: -10, swB: 0 },
  // 大上段 (大技): 両手で頭上に振りかぶる。奥の腕も上へ。大きく反る
  raiseBoth: { hipH: 37, lean: -16, neck: -8, tilt: -10, aF: [166, 16], aB: [158, 20], lF: [6, -8], lB: [-30, -2], swF: -12, swB: 0 },
  // 大上段の振り下ろし: 体ごと前へ倒れ込み、両腕を前下へ
  downBoth: { hipH: 30, lean: 42, neck: 14, tilt: 14, aF: [70, -6], aB: [62, 0], lF: [58, -46], lB: [-38, 0], swF: -10, swB: 0 },
  // 薙ぎ払いの引き: 腕を後ろへ。剣は後ろ水平
  windup: { hipH: 36, lean: -4, neck: -2, tilt: 0, aF: [-62, 26], aB: [-22, 30], lF: [14, -10], lB: [-22, -4], swF: 8, swB: 0 },
  // 薙ぎ払いの振り抜き: 腕は顔に被らない 120 度で止め、顔は背中側へ引いて上を向く
  follow: { hipH: 35, lean: 8, neck: -20, tilt: -14, aF: [120, 24], aB: [-32, 30], lF: [30, -16], lB: [-26, -4], swF: -6, swB: 0 },
  // 突進の構え: 深く沈み、剣を脇に抱える
  crouch: { hipH: 30, lean: 22, neck: 4, tilt: 4, aF: [36, 44], aB: [-32, 40], lF: [36, -46], lB: [-18, -30], swF: 4, swB: 0 },
  // 突進: 体を前へ投げ出し、剣は前へ一直線
  lunge: { hipH: 32, lean: 46, neck: 8, tilt: 6, aF: [98, -4], aB: [-52, 30], lF: [60, -22], lB: [-52, 0], swF: 0, swB: 0 },
  // 飛ぶ剣を放つ前: 奥の腕を上げて浮遊剣を呼ぶ
  castReady: { hipH: 36, lean: 2, neck: -4, tilt: -4, aF: [56, 26], aB: [150, -12], lF: [18, -14], lB: [-22, -8], swF: 4, swB: 0 },
  // 放つ: 奥の腕を前へ振る。手前の剣は構えのまま
  cast: { hipH: 35, lean: 10, neck: 2, tilt: 2, aF: [58, 24], aB: [112, -8], lF: [26, -18], lB: [-26, -6], swF: 4, swB: 0 },
  // 低い構え (止まる・寄る・離れる)
  low: { hipH: 33, lean: 12, neck: 2, tilt: 2, aF: [52, 30], aB: [-24, 32], lF: [28, -30], lB: [-24, -16], swF: 6, swB: 0 },
};

// 鍵 = [位相 (0〜1), 構え, 攻撃の向きの重み]。pre は予告開始 → 当たり、post は当たり → 余韻の終わり
type Key = [number, PoseName, number];
interface Motion {
  pre: Key[];
  post: Key[];
  // 顔と上体が向きを追う割合 (叩きつけは追わない)
  headFollow: number;
}

const MOTIONS: Record<EnemyMove, Motion> = {
  // 突き: 予告で引き、当たりの瞬間に伸ばし切る (post の最初の 12% = 約 30 ms)
  thrust: { pre: [[0, 'guard', 0], [0.55, 'draw', 0.6], [1, 'draw', 1]], post: [[0, 'draw', 1], [0.12, 'thrust', 1], [0.55, 'thrust', 1], [1, 'guard', 0]], headFollow: 1 },
  // 振り下ろし: 予告で振り上げ、当たりで振り下ろす
  chop: { pre: [[0, 'guard', 0], [0.5, 'raise', 0.5], [1, 'raise', 0.8]], post: [[0, 'raise', 0.8], [0.15, 'down', 1], [0.6, 'down', 1], [1, 'guard', 0]], headFollow: 0.6 },
  // 大上段: 両手で大きく振りかぶり、体ごと振り下ろす。余韻が長い
  heavyChop: { pre: [[0, 'guard', 0], [0.45, 'raiseBoth', 0.4], [1, 'raiseBoth', 0.7]], post: [[0, 'raiseBoth', 0.7], [0.1, 'downBoth', 1], [0.65, 'downBoth', 1], [1, 'guard', 0]], headFollow: 0.5 },
  // 薙ぎ払い: 引きから振り抜きまで一息。当たりの窓 (0.5 拍) の間に回り切る
  sweep: { pre: [[0, 'guard', 0], [0.5, 'windup', 0.4], [1, 'windup', 0.6]], post: [[0, 'windup', 0.6], [0.5, 'follow', 1], [0.7, 'follow', 0.8], [1, 'guard', 0]], headFollow: 1 },
  // 踏み込み突き: 沈んでから体ごと前へ
  dash: { pre: [[0, 'guard', 0], [0.4, 'crouch', 0.3], [1, 'crouch', 0.5]], post: [[0, 'crouch', 0.5], [0.15, 'lunge', 1], [0.6, 'lunge', 1], [1, 'guard', 0]], headFollow: 1 },
  // 飛ぶ剣: 奥の腕を上げて呼び、当たりで前へ振る
  shot: { pre: [[0, 'guard', 0], [0.5, 'castReady', 0.3], [1, 'castReady', 0.6]], post: [[0, 'castReady', 0.6], [0.15, 'cast', 1], [0.6, 'cast', 1], [1, 'guard', 0]], headFollow: 0.8 },
  // 決闘者は使わないが名前は埋める (叩きつけ系は大上段の形)
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
  };
}

// 段が進むほど動きを大きく: 前傾は 1.35 倍まで、脚の開きは 1.2 倍まで。構え (guard) は変えない
function exaggerate(p: Pose, amount: number): Pose {
  const k = 1 + 0.35 * amount;
  const kl = 1 + 0.2 * amount;
  return { ...p, lean: p.lean * k, lF: [p.lF[0] * kl, p.lF[1]], lB: [p.lB[0] * kl, p.lB[1]] };
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
    aB: [p.aB[0] + aimUp * aimW * 0.6, p.aB[1]],
    tilt: p.tilt - aimUp * 0.5 * hw,
    lean: p.lean - aimUp * 0.25 * hw,
    neck: p.neck - aimUp * 0.45 * hw,
  };
}

// 太さを持つ手足: 暗い縁を太く、内側を体の色で。関節は丸い端でつながる
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

// 剣: 手 hand から向き dir へ。鍔 (横棒)、刃 (先細り)、柄頭。glow なら刃に光
function sword(ctx: CanvasRenderingContext2D, hand: Vec, dir: Vec, len: number, width: number, glow: number): void {
  const n = { x: -dir.y, y: dir.x };
  const guardAt = add(hand, dir, 1.5);
  // 柄 (手の後ろ)
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(hand.x - dir.x * 3.5, hand.y - dir.y * 3.5);
  ctx.lineTo(guardAt.x, guardAt.y);
  ctx.stroke();
  // 刃
  const tip = add(hand, dir, len);
  const base = add(hand, dir, 2.5);
  ctx.save();
  if (glow > 0.01) {
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 10 * glow;
  }
  ctx.beginPath();
  ctx.moveTo(base.x + n.x * width, base.y + n.y * width);
  ctx.lineTo(tip.x - dir.x * len * 0.12 + n.x * width * 0.7, tip.y - dir.y * len * 0.12 + n.y * width * 0.7);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x - dir.x * len * 0.12 - n.x * width * 0.7, tip.y - dir.y * len * 0.12 - n.y * width * 0.7);
  ctx.lineTo(base.x - n.x * width, base.y - n.y * width);
  ctx.closePath();
  fillPath(ctx, BLADE, null, 1.4);
  ctx.restore();
  // 刃の光る稜線
  ctx.strokeStyle = BLADE_EDGE;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(tip.x - dir.x * 2, tip.y - dir.y * 2);
  ctx.stroke();
  // 鍔
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(guardAt.x - n.x * 4, guardAt.y - n.y * 4);
  ctx.lineTo(guardAt.x + n.x * 4, guardAt.y + n.y * 4);
  ctx.stroke();
}

export interface DuelistLook {
  // 段 (0〜2) と段の中の進み (0〜1)
  stage: number;
  progress: number;
}

// 決闘者を描く。center は判定の円の中心 (ピクセル)、r は判定の半径 (ピクセル)。胴の中心が判定の円に重なる。
// motion は core の位相、dir は攻撃の来る方向か自機の側 (単位ベクトル)。pulse は拍の頭で 1。flashWhite は命中の瞬間。
// idle は攻撃していないときの構え (guard / low)。stage は曲の段と進み
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
): void {
  const d = dir.x === 0 && dir.y === 0 ? { x: -1, y: 0 } : dir;
  const face: 1 | -1 = d.x < 0 ? -1 : 1;
  // 上下の向き (度。正で上)。真横に近いほど 0。±50 度で止める
  const aimUp = clamp((-Math.atan2(d.y, Math.abs(d.x)) * 180) / Math.PI, -50, 50);
  const stage = st.stage;
  const q = st.progress;
  const amount = st.overall;
  const body = flashWhite ? '#ffffff' : color;
  const glow = stage >= 2 ? 0.5 + 0.5 * q : 0;

  const pp = duelistPose(motion, idle, amount);
  const pose = applyAim(pp.pose, aimUp, pp.aimW, pp.headW);
  const breathing = motion.move === null ? 1 : 0;

  const k = r / 20;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(k * face, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 骨組み。腰 H は判定の中心の 14 下 (胴の中心が判定の円に重なる)。腰が沈む構えでは全体が少し下がる。拍の頭で少し沈む
  const sink = (38 - pose.hipH) * 0.6 + 1.2 * pulse * breathing;
  const H: Vec = { x: 0, y: 14 + sink };
  const dirT = vu(pose.lean);
  const perp: Vec = { x: Math.cos(rad(pose.lean)), y: Math.sin(rad(pose.lean)) };
  const torsoLen = 34;
  const S = add(H, dirT, torsoLen);
  const HC = add(add(S, dirT, 2), vu(pose.neck), 9);
  const upperLen = 13;
  const foreLen = 12;
  const thigh = 20;
  const shin = 19;
  const SB = add(S, perp, -2);
  const SF = add(S, perp, 1.5);
  const armPts = (a: [number, number], root: Vec): Vec[] => {
    const U = add(root, vd(a[0]), upperLen);
    return [root, U, add(U, vd(a[0] + a[1]), foreLen)];
  };
  const legPts = (l: [number, number]): Vec[] => {
    const K = add(H, vd(l[0]), thigh);
    return [H, K, add(K, vd(l[0] + l[1]), shin)];
  };
  const armF = armPts(pose.aF, SF);
  const armB = armPts(pose.aB, SB);
  const legF = legPts(pose.lF);
  const legB = legPts(pose.lB);
  const swordDirF = vd(pose.aF[0] + pose.aF[1] + pose.swF);
  const swordDirB = vd(pose.aB[0] + pose.aB[1] + pose.swB);
  const bladeLen = 27 + 3 * stage;

  // 太さ: 段が進むと腕が少し太く (鎧)
  const wUp = 5 + 1.2 * amount;
  const wFore = 4.4 + 0.8 * amount;
  const wThigh = 6;
  const wShin = 5;
  const pauldron = stage >= 1 ? 4.5 + 2.5 * (stage === 1 ? q : 1) : 3;

  // 浮遊剣 (段 3): 背中の上に扇に並ぶ。構えでは上向き、打点では攻撃の向きへそろう。進みで広がる
  if (stage >= 2) {
    const n = q > 0.5 ? 4 : 3;
    const spread = 9 + 6 * q;
    const back = add(add(S, perp, -14), { x: 0, y: -1 }, 2);
    const aimDir = vd(90 + aimUp);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pos = add(add(back, perp, -spread * (0.2 + 0.9 * t)), { x: 0, y: -1 }, spread * (1.0 - Math.abs(t - 0.5) * 1.2));
      const restDir = vu(-20 + 40 * t);
      const w = pp.aimW;
      const sd = { x: lerp(restDir.x, aimDir.x, w), y: lerp(restDir.y, aimDir.y, w) };
      const len = Math.hypot(sd.x, sd.y) || 1;
      sword(ctx, add(pos, sd, -6 / len), { x: sd.x / len, y: sd.y / len }, 15, 1.4, glow);
    }
  }

  // 奥の脚と腕 (暗く)
  limb(ctx, legB, [wThigh, wShin], body, true);
  foot(ctx, legB[2], wShin, body, true);
  limb(ctx, armB, [wUp, wFore], body, true);
  if (stage >= 1) sword(ctx, armB[2], swordDirB, bladeLen - 6, 1.6, glow * 0.6);
  else hand(ctx, armB[2], body, true);

  // 胴: 腰から肩へ。肩が広く腰が狭い
  const wh = 5.5;
  const ws = 7 + 1.5 * amount;
  const hb = add(H, perp, -wh);
  const hf = add(H, perp, wh);
  const sb = add(S, perp, -ws);
  const sf = add(S, perp, ws);
  ctx.beginPath();
  ctx.moveTo(hb.x, hb.y);
  ctx.lineTo(sb.x, sb.y);
  ctx.lineTo(sf.x, sf.y);
  ctx.lineTo(hf.x, hf.y);
  ctx.closePath();
  fillPath(ctx, body, null, 2);
  // 胸当て (段 2 から): 胴の上半分の前側に明るい面。段 3 は光る線が入る
  if (stage >= 1) {
    const c1 = add(H, dirT, torsoLen * 0.45);
    ctx.beginPath();
    ctx.moveTo(add(c1, perp, -ws * 0.5).x, add(c1, perp, -ws * 0.5).y);
    ctx.lineTo(sb.x + perp.x * 1, sb.y + perp.y * 1);
    ctx.lineTo(sf.x - perp.x * 1, sf.y - perp.y * 1);
    ctx.lineTo(add(c1, perp, ws * 0.7).x, add(c1, perp, ws * 0.7).y);
    ctx.closePath();
    fillPath(ctx, body, LIGHTEN, 1.2);
    if (glow > 0) {
      ctx.save();
      ctx.strokeStyle = GLOW_PALE;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = 8 * glow;
      ctx.lineWidth = 1.4;
      const a0 = add(H, dirT, torsoLen * 0.55);
      const a1 = add(H, dirT, torsoLen * 0.9);
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  // 奥の肩当て
  if (stage >= 1) pauldronAt(ctx, SB, pauldron * 0.9, body, true, pose.lean);

  // 頭: 兜 (丸) と面頬の線。段 3 は面が光る。顔の傾きは tilt
  ctx.save();
  ctx.translate(HC.x, HC.y);
  ctx.rotate(rad(pose.tilt));
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  fillPath(ctx, body, null, 2);
  // 兜の縁 (前頭部の帯)
  ctx.beginPath();
  ctx.moveTo(-7, -3.5);
  ctx.quadraticCurveTo(0, -7, 7.5, -2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // 面頬の覗き窓 (前側)。段 3 で光る
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = GLOW;
    ctx.shadowBlur = 10 * glow;
    ctx.strokeStyle = GLOW_PALE;
  } else {
    ctx.strokeStyle = INK;
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, -1.5);
  ctx.lineTo(7, -0.5);
  ctx.stroke();
  ctx.restore();
  // 段 2 から: 兜の飾り (後ろへ流れる)
  if (stage >= 1) {
    ctx.beginPath();
    ctx.moveTo(-3, -7);
    ctx.lineTo(-12 - 4 * (stage === 1 ? q : 1), -4);
    ctx.lineTo(-5, -3.5);
    ctx.closePath();
    fillPath(ctx, body, DARKEN, 1.2);
  }
  ctx.restore();

  // 手前の脚
  limb(ctx, legF, [wThigh, wShin], body, false);
  foot(ctx, legF[2], wShin, body, false);

  // 手前の腕と剣。腕を真上に振り上げる構えでは頭の後ろに描いて顔を隠さない
  const armBehindHead = pose.aF[0] > 150;
  if (armBehindHead) {
    // 既に頭を描いた後なので、頭の上に腕が乗らないよう剣だけ先に描き、腕は薄く
    ctx.globalAlpha = 0.85;
  }
  limb(ctx, armF, [wUp, wFore], body, false);
  ctx.globalAlpha = 1;
  sword(ctx, armF[2], swordDirF, bladeLen, 2, glow);
  pauldronAt(ctx, SF, pauldron, body, false, pose.lean);

  ctx.restore();
}

function hand(ctx: CanvasRenderingContext2D, p: Vec, color: string, darken: boolean): void {
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
  fillPath(ctx, color, darken ? DARKEN : null, 1.4);
}

function foot(ctx: CanvasRenderingContext2D, p: Vec, w: number, color: string, darken: boolean): void {
  limb(ctx, [p, { x: p.x + 7, y: p.y }], [w * 0.9], color, darken);
}

// 肩当て: 肩の塊を覆う半円。段が進むと大きく、段 3 は縁が明るい
function pauldronAt(ctx: CanvasRenderingContext2D, at: Vec, size: number, color: string, darken: boolean, lean: number): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(rad(lean));
  ctx.beginPath();
  ctx.arc(0, 0, size, Math.PI, Math.PI * 2);
  ctx.lineTo(size, 1.5);
  ctx.lineTo(-size, 1.5);
  ctx.closePath();
  fillPath(ctx, color, darken ? DARKEN : LIGHTEN, 1.6);
  ctx.restore();
}

// 確認用: 動きの位相を 2 拍 1 周の時刻から作る (pre に 1 拍、post に 1 拍)。figure.html が使う
export function motionFromLoop(move: EnemyMove | null, phase: number): EnemyMotion {
  if (!move) return { move: null, attack: null, pre: 0, post: 0 };
  const u = phase % 1;
  return u < 0.5 ? { move, attack: null, pre: u * 2, post: 0 } : { move, attack: null, pre: 1, post: (u - 0.5) * 2 };
}
