// 姿 (v4 T3)。自機の人型と敵の雫形を、構え (src/core/pose.ts の名前) ごとに線と面だけで描く。画像ファイルは使わない。
// 構えの選び方は core が持ち、ここは名前に対する絵だけ。別の姿にしたいときはこのファイルの関数を差し替える。
// 座標は呼び出し側がピクセルに写したもの。大きさは判定の半径 r (ピクセル) に比例させ、r が変わっても形が崩れないようにする
import type { EnemyPose, PlayerPose } from '../core/pose';
import type { Vec } from '../core/vec';

// 目や模様に使う濃い色 (背景と同じ。体の色の上に線で描く)
const INK = '#101014';

// ---- 自機 ----

// 腕・脚の 1 本 (肩や腰 → 関節 → 先)。座標は r を 1 とした単位
interface Limb {
  a: Vec;
  b: Vec;
}

// 構えの定義。座標は r を 1 とし、+x が向いている側 (敵の側)、+y が下。
// lean は腰を軸にした上半身の傾き (ラジアン。正で前傾)。drop は胴と頭が下がる量 (膝を曲げる)
interface PlayerFigure {
  lean: number;
  drop: number;
  frontArm: Limb;
  backArm: Limb;
  frontLeg: Limb;
  backLeg: Limb;
}

const HIP_Y = 0.7;
const SHOULDER_Y = -0.9;
const HEAD_Y = -1.45;
const HEAD_R = 0.5;
const FOOT_Y = 2.0;

function playerFigure(pose: PlayerPose, pulse: number): PlayerFigure {
  switch (pose) {
    case 'idle': {
      // 立つ。拍の頭で膝が沈み、戻る。腕は体の横に下げ、前の腕が拍で少し揺れる
      const d = 0.15 * pulse;
      return {
        lean: 0,
        drop: d,
        frontArm: { a: { x: 0.25, y: -0.1 + 0.1 * pulse }, b: { x: 0.3 + 0.15 * pulse, y: 0.6 } },
        backArm: { a: { x: -0.25, y: -0.1 }, b: { x: -0.3, y: 0.6 } },
        frontLeg: { a: { x: 0.3, y: 1.35 + d * 0.5 }, b: { x: 0.35, y: FOOT_Y } },
        backLeg: { a: { x: -0.3, y: 1.35 + d * 0.5 }, b: { x: -0.35, y: FOOT_Y } },
      };
    }
    case 'attack':
      // 振る。前傾し、前の腕を敵の側へ伸ばし切る。後ろの腕は引く。足は大きく踏み込む
      return {
        lean: 0.3,
        drop: 0,
        frontArm: { a: { x: 0.8, y: -0.95 }, b: { x: 1.7, y: -1.05 } },
        backArm: { a: { x: -0.5, y: -0.5 }, b: { x: -0.7, y: 0.1 } },
        frontLeg: { a: { x: 0.6, y: 1.3 }, b: { x: 0.9, y: FOOT_Y } },
        backLeg: { a: { x: -0.5, y: 1.4 }, b: { x: -0.9, y: FOOT_Y } },
      };
    case 'cancel':
      // 受ける。体重を後ろに置き、前の腕の前腕を立てて盾にする (面は drawPlayer で足す)
      return {
        lean: -0.15,
        drop: 0.1,
        frontArm: { a: { x: 0.6, y: -0.6 }, b: { x: 0.7, y: -1.5 } },
        backArm: { a: { x: -0.3, y: -0.2 }, b: { x: -0.2, y: 0.5 } },
        frontLeg: { a: { x: 0.5, y: 1.3 }, b: { x: 0.7, y: FOOT_Y } },
        backLeg: { a: { x: -0.35, y: 1.3 }, b: { x: -0.6, y: FOOT_Y } },
      };
    case 'hit':
      // のけぞる。大きく後ろへ傾き、両腕が上がる。前の脚が浮く
      return {
        lean: -0.5,
        drop: 0,
        frontArm: { a: { x: 0.4, y: -1.5 }, b: { x: 0.2, y: -2.2 } },
        backArm: { a: { x: -0.5, y: -1.4 }, b: { x: -0.9, y: -2.0 } },
        frontLeg: { a: { x: 0.5, y: 1.0 }, b: { x: 0.9, y: 1.4 } },
        backLeg: { a: { x: -0.4, y: 1.4 }, b: { x: -0.8, y: FOOT_Y } },
      };
    case 'ready': {
      // 構える。腰を落とし、両腕を前で曲げて構える。足は広く
      const d = 0.45;
      return {
        lean: 0.15,
        drop: d,
        frontArm: { a: { x: 0.55, y: -0.4 + d }, b: { x: 1.0, y: -0.9 + d } },
        backArm: { a: { x: 0.35, y: -0.3 + d }, b: { x: 0.85, y: -0.7 + d } },
        frontLeg: { a: { x: 0.75, y: 1.3 }, b: { x: 0.9, y: FOOT_Y } },
        backLeg: { a: { x: -0.7, y: 1.3 }, b: { x: -0.9, y: FOOT_Y } },
      };
    }
  }
}

function strokeLimb(ctx: CanvasRenderingContext2D, from: Vec, limb: Limb): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(limb.a.x, limb.a.y);
  ctx.lineTo(limb.b.x, limb.b.y);
  ctx.stroke();
}

// 自機の人型。center は胴の中心 (判定の円の中心)、r は判定の半径 (ピクセル)。全体の高さは約 4r。
// facing は敵のいる側 (+1 = 右)。pulse は拍の頭で 1、イージングで 0 へ
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  r: number,
  pose: PlayerPose,
  facing: 1 | -1,
  pulse: number,
  color: string,
): void {
  const fig = playerFigure(pose, pulse);
  const lw = Math.max(2, r * 0.35) / r;
  ctx.save();
  ctx.translate(center.x, center.y);
  // 以後の座標は r を 1 とし、+x が向いている側
  ctx.scale(r * facing, r);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  // 脚 (腰から。傾きの影響を受けない)
  const hip = { x: 0, y: HIP_Y + fig.drop };
  strokeLimb(ctx, hip, fig.frontLeg);
  strokeLimb(ctx, hip, fig.backLeg);

  // 上半身は腰を軸に傾ける
  ctx.translate(hip.x, hip.y);
  ctx.rotate(fig.lean);
  ctx.translate(-hip.x, -hip.y);
  const shoulder = { x: 0, y: SHOULDER_Y + fig.drop };

  // 後ろの腕 (胴の奥)
  ctx.globalAlpha = 0.7;
  strokeLimb(ctx, { x: shoulder.x - 0.1, y: shoulder.y + 0.1 }, fig.backArm);
  ctx.globalAlpha = 1;

  // 胴 (面。肩が広く腰が狭い台形)
  ctx.beginPath();
  ctx.moveTo(-0.45, shoulder.y);
  ctx.lineTo(0.45, shoulder.y);
  ctx.lineTo(0.35, hip.y);
  ctx.lineTo(-0.35, hip.y);
  ctx.closePath();
  ctx.fill();

  // 頭 (面) と目 (向いている側に 1 点)
  const head = { x: 0, y: HEAD_Y + fig.drop };
  ctx.beginPath();
  ctx.arc(head.x, head.y, HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(head.x + 0.22, head.y - 0.05, 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;

  // 前の腕
  strokeLimb(ctx, { x: shoulder.x + 0.1, y: shoulder.y + 0.1 }, fig.frontArm);

  if (pose === 'attack') {
    // 振り: 肩から手先へ掃いた跡を薄い面で残す
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(fig.frontArm.b.x, fig.frontArm.b.y);
    ctx.lineTo(1.2, -1.95);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (pose === 'cancel') {
    // 受け: 立てた前腕の前に小さな盾の面
    const a = fig.frontArm.a;
    const b = fig.frontArm.b;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(a.x + 0.15, a.y + 0.1);
    ctx.lineTo(b.x + 0.25, b.y - 0.15);
    ctx.lineTo(b.x + 0.55, b.y);
    ctx.lineTo(a.x + 0.45, a.y + 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ---- 敵 ----

// 雫形の体 (上が尖り、下が丸い)。座標は r を 1 とし、丸い部分が中心 (0, 0.2) 半径 1、尖りが (0, -1.5)
function teardropPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(0, -1.5);
  ctx.bezierCurveTo(0.15, -1.0, 1.0, -0.5, 1.0, 0.2);
  ctx.arc(0, 0.2, 1.0, 0, Math.PI, false);
  ctx.bezierCurveTo(-1.0, -0.5, -0.15, -1.0, 0, -1.5);
  ctx.closePath();
}

type EyeStyle = 'neutral' | 'squint' | 'wide' | 'cross' | 'glare';

// 目の 2 つ。look は目の位置をずらす向き (単位ベクトル。見る向き)。座標は r を 1 とした体の座標
function drawEyes(ctx: CanvasRenderingContext2D, style: EyeStyle, look: Vec, lw: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const cy = -0.1 + look.y * 0.5;
  const cx = look.x * 0.2;
  for (const side of [-1, 1]) {
    const x = cx + side * 0.4;
    ctx.beginPath();
    switch (style) {
      case 'neutral':
        // 縦の短い線
        ctx.moveTo(x, cy - 0.2);
        ctx.lineTo(x, cy + 0.2);
        ctx.stroke();
        break;
      case 'squint':
        // 横の短い線 (細める)
        ctx.moveTo(x - 0.22, cy);
        ctx.lineTo(x + 0.22, cy);
        ctx.stroke();
        break;
      case 'wide':
        // 輪と芯 (見開く)
        ctx.arc(x, cy, 0.24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + look.x * 0.06, cy + look.y * 0.06, 0.09, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'cross':
        // ×
        ctx.moveTo(x - 0.18, cy - 0.18);
        ctx.lineTo(x + 0.18, cy + 0.18);
        ctx.moveTo(x + 0.18, cy - 0.18);
        ctx.lineTo(x - 0.18, cy + 0.18);
        ctx.stroke();
        break;
      case 'glare':
        // 斜めの線 (睨む。外側が上がる)
        ctx.moveTo(x - side * 0.2, cy + 0.15);
        ctx.lineTo(x + side * 0.2, cy - 0.15);
        ctx.stroke();
        break;
    }
  }
}

// 敵の雫形。center は判定の円の中心、r は判定の半径 (ピクセル)。dir は進行方向か狙いの向き (単位ベクトル)。
// pulse は拍の頭で 1。flashWhite なら白で塗る (命中の瞬間)
export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  center: Vec,
  r: number,
  pose: EnemyPose,
  dir: Vec,
  pulse: number,
  color: string,
  flashWhite: boolean,
): void {
  const d = dir.x === 0 && dir.y === 0 ? { x: -1, y: 0 } : dir;
  const lw = Math.max(2, r * 0.18) / r;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(r, r);

  // 構えごとの体の変形: 回転 (尖りの向き)、持ち上げ、横と縦の伸び、目の様子と見る向き
  let rotate = 0;
  let lift = 0;
  let sx = 1;
  let sy = 1;
  let eyes: EyeStyle = 'neutral';
  let look: Vec = { x: 0, y: 0 };
  switch (pose) {
    case 'idle':
      // 拍で膨らむ。目は正面
      sx = sy = 1 + 0.15 * pulse;
      break;
    case 'laser':
      // 横に細長く伸び、目を細める。狙いの側を見る
      sx = 1.6;
      sy = 0.6;
      eyes = 'squint';
      look = { x: d.x, y: 0 };
      break;
    case 'burst':
      // 持ち上がって膨らみ、目を見開く
      lift = -0.5;
      sx = sy = 1.3;
      eyes = 'wide';
      break;
    case 'dash':
      // 進行方向へ前傾して伸びる。丸い側が前、尖りが後ろに流れる (彗星の形)
      rotate = Math.atan2(-d.x, d.y);
      sx = 0.8;
      sy = 1.4;
      eyes = 'glare';
      look = { x: 0, y: 1 };
      break;
    case 'stopped':
      // しぼんで沈み、目が ×
      lift = 0.3;
      sx = 0.85;
      sy = 0.7;
      eyes = 'cross';
      break;
    case 'approach':
    case 'retreat':
      // idle の体で目だけ動きの向きを見る
      sx = sy = 1 + 0.15 * pulse;
      eyes = 'neutral';
      look = d;
      break;
  }

  ctx.translate(0, lift);
  ctx.rotate(rotate);
  ctx.scale(sx, sy);
  ctx.fillStyle = flashWhite ? '#ffffff' : color;
  teardropPath(ctx);
  ctx.fill();
  // 目の線幅は伸びの影響を受けないよう平均の倍率で割る
  drawEyes(ctx, eyes, look, lw / ((sx + sy) / 2));
  ctx.restore();
}

// ---- 確認用: 構えを 1 枚に並べる (本体が Chrome で呼んで見る。ゲームからは呼ばない) ----

const PLAYER_POSES: PlayerPose[] = ['idle', 'attack', 'cancel', 'hit', 'ready'];
const ENEMY_POSES: EnemyPose[] = ['idle', 'laser', 'burst', 'dash', 'stopped', 'approach', 'retreat'];

// 上段に自機の 5 構え (pulse 0 と 1 の 2 列ずつ)、下段に敵の 7 構え。w × h のピクセル領域に描く
export function drawPoseSheet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `${Math.max(10, Math.round(w * 0.014))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const pr = w * 0.028;
  const rowP = h * 0.3;
  const colP = w / (PLAYER_POSES.length * 2 + 1);
  PLAYER_POSES.forEach((pose, i) => {
    [0, 1].forEach((pulse, k) => {
      const x = colP * (i * 2 + k + 1);
      drawPlayer(ctx, { x, y: rowP }, pr, pose, 1, pulse, '#e8e8f0');
      ctx.fillStyle = '#8a8a8a';
      ctx.fillText(`${pose} p${pulse}`, x, rowP + pr * 2.6);
    });
  });

  const er = w * 0.035;
  const rowE = h * 0.72;
  const colE = w / (ENEMY_POSES.length + 1);
  ENEMY_POSES.forEach((pose, i) => {
    const x = colE * (i + 1);
    const dir = pose === 'retreat' ? { x: 1, y: 0 } : pose === 'dash' ? { x: -0.9, y: 0.4 } : { x: -1, y: 0 };
    drawEnemy(ctx, { x, y: rowE }, er, pose, dir, 1, '#d05aa0', false);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillText(pose, x, rowE + er * 2.0);
  });
  ctx.restore();
}
