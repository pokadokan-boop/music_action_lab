// Canvas 2D で線と面だけで描く。位置は世界座標 (等方。単位は画面の幅。src/core/world.ts) → 16:9 の描画領域へ、x も y も幅を掛けて写す。
// 規律 (v3 T1): 描画は判定の値をそのまま使う。判定に無い大きさを描かず、判定にある大きさを描き落とさない。
// 自機と敵の姿 (v4 T3) は src/render/figures.ts。構えの名前は src/core/pose.ts で決まる
import type { Config } from '../config';
import {
  activeWindow,
  aimLine,
  attackMotion,
  cancelAnchorBeat,
  easeFor,
  hitboxAt,
  impactBeat,
  incomingDir,
  isHeavy,
  leadsChain,
  pathPosAt,
  slamShape,
  sweepArc,
  type Attack,
  type Choreo,
  type Hitbox,
  type Motion,
} from '../core/choreo';
import type { Grid } from '../core/grid';
import { currentAttack, enemyMotion, enemyPose, playerPose } from '../core/pose';
import { HANDS, armedHands, effectiveChoreo, type SimState } from '../core/sim';
import { stageAt } from '../core/stage';
import { easeOut, normalize, type Vec } from '../core/vec';
import { drawDuelist } from './duelist';
import { drawEnemy, drawPlayer } from './figures';

export interface Viewport {
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export interface RenderDeps {
  choreo: Choreo;
  grid: Grid;
  cfg: Config;
}

const COLOR = {
  bg: '#101014',
  grid: '#2a2a33',
  player: '#e8e8f0',
  enemy: '#d05aa0',
  telegraph: 'rgba(255, 200, 80, 0.55)',
  telegraphStrong: 'rgba(255, 220, 120, 0.95)',
  // 相殺できない攻撃 (uncancelable) の予告は赤 (「赤 = 避けるしかない」の慣用。v3 T4)
  telegraphDanger: 'rgba(255, 90, 70, 0.6)',
  telegraphDangerStrong: 'rgba(255, 120, 100, 0.95)',
  // 大技 (slam。両手放ちだけで相殺できる) の予告は紫 (v6 T4。黄 = 相殺できる、赤 = 避けるしかない、と区別)
  telegraphDouble: 'rgba(190, 140, 255, 0.6)',
  telegraphDoubleStrong: 'rgba(215, 180, 255, 0.95)',
  hitbox: 'rgba(255, 70, 70, 0.45)',
  hitboxStrong: 'rgba(255, 120, 120, 0.9)',
  hpOk: '#6aa0ff',
  hpLow: '#ff5a5a',
  on: '#ffe066',
  off: '#66e0ff',
  miss: '#8a8a8a',
  cancel: '#ffffff',
};

export function fitViewport(canvas: HTMLCanvasElement): Viewport {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
  }
  const W = canvas.width;
  const H = canvas.height;
  const w = Math.min(W, (H * 16) / 9);
  const h = (w * 9) / 16;
  return { ox: (W - w) / 2, oy: (H - h) / 2, w, h };
}

export function render(ctx: CanvasRenderingContext2D, vp: Viewport, state: SimState, deps: RenderDeps, flash: FlashState): void {
  const { grid, cfg } = deps;
  // 予告・当たりは解決済みの攻撃 (自機狙いなら狙った位置) から描く。判定 (sim) と同じ幾何を見せるため
  const choreo = effectiveChoreo(state, deps.choreo);
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.ox, vp.oy, vp.w, vp.h);
  ctx.clip();

  // 世界座標は等方なので、y も幅を掛ける (世界の高さ 9/16 × 幅 = 描画領域の高さ)
  const px = (v: Vec) => ({ x: vp.ox + v.x * vp.w, y: vp.oy + v.y * vp.w });
  const pr = (r: number) => r * vp.w;
  const beat = state.beat;
  const pulse = 1 - easeOut(beat - Math.floor(beat));

  drawBeatTicks(ctx, vp, grid, beat);

  for (const atk of choreo.attacks) drawTelegraph(ctx, px, pr, atk, beat, cfg, attackMotion(choreo, atk), leadsChain(choreo, atk));

  for (const [idx, atk] of choreo.attacks.entries()) {
    // 相殺された当たりは消えている (sim.checkDamage と同じ)。本体は path どおり動き続ける
    if (state.cancelled.has(idx)) continue;
    const h = hitboxAt(atk, beat, grid.beatSec, cfg, attackMotion(choreo, atk));
    if (h) drawHitbox(ctx, px, pr, h);
  }

  // 敵: 構えは core が決める。拍の頭で明るく、イージングアウトで戻る。命中の瞬間は白。
  // 姿は振り付けの figure で選ぶ (v7 T5): duelist は動きの位相 (enemyMotion) と曲の段 (stageAt) も受け取る
  const e = px(state.enemy);
  const ePose = enemyPose(choreo, beat, grid.beatSec, cfg);
  const eDir = enemyDir(choreo, state, grid.beatSec, cfg);
  const eColor = mix(COLOR.enemy, '#ffffff', pulse * 0.35);
  if (choreo.figure === 'duelist') {
    const motion = enemyMotion(choreo, beat, grid.beatSec, cfg);
    const idle = ePose === 'stopped' || ePose === 'approach' || ePose === 'retreat' ? 'low' : 'guard';
    drawDuelist(ctx, e, pr(cfg.enemyRadius), motion, eDir, pulse, eColor, flash.enemyHit > 0, idle, stageAt(beat, grid.beatsPerBar));
  } else {
    drawEnemy(ctx, e, pr(cfg.enemyRadius), ePose, eDir, pulse, eColor, flash.enemyHit > 0);
  }

  // プレイヤー: 構えは core が決める。向きは攻撃の向きがあればその側、無ければ敵のいる側。
  // ステップ中と溜め状態は sim の状態をそのまま読む (v5)
  const p = px(state.player);
  let pc = mix(COLOR.player, '#ffffff', pulse * 0.2);
  if (flash.attackClass) pc = COLOR[flash.attackClass];
  if (flash.step) pc = COLOR[flash.step.cls];
  if (flash.damaged > 0) pc = COLOR.hpLow;
  const charging = armedHands(state) > 0;
  const pPose = playerPose(
    {
      attacking: !!flash.attackClass,
      cancelling: !!flash.cancel,
      damaged: flash.damaged > 0,
      action: flash.action ?? undefined,
      stepping: state.stepping !== null,
      charging,
    },
    ePose,
  );
  const facingX = flash.aim && flash.aim.x !== 0 ? flash.aim.x : state.enemy.x - state.player.x;
  drawPlayer(ctx, p, pr(cfg.playerRadius), pPose, facingX < 0 ? -1 : 1, pulse, pc);
  for (const hand of HANDS) {
    // 溜めの印 (v5): 自機の周りの細い輪。閾値を超えてから chargeFullBeats で半径 1.2 → 1.8 倍。判定の形ではない (状態の印)。
    // v6: 手ごとに半分ずつ (右手は右半分、左手は左半分)。両手で 1 周。音は手で区別しないので、両手の状態はこの輪で見せる
    const ch = state.hands[hand].charge;
    if (!ch?.armed) continue;
    const k = Math.min(1, (beat - ch.startBeat - cfg.chargeThresholdBeats) / cfg.chargeFullBeats);
    ctx.strokeStyle = COLOR.player;
    ctx.globalAlpha = 0.35 + 0.35 * k;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const from = hand === 'right' ? -Math.PI / 2 : Math.PI / 2;
    ctx.arc(p.x, p.y, pr(cfg.playerRadius * (1.2 + 0.6 * k)), from, from + Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (flash.attackClass) {
    // 攻撃の瞬間: 向いた方向へ attackRadius の扇 (塗り + 縁) を出す。判定と同じ半径・同じ角度。向きが無い (古い状態) なら円で代える。
    // 相殺が成立した押下なら扇は白 (拍の色より「捌けた」を優先して見せる)
    const fanColor = flash.cancel ? COLOR.cancel : pc;
    ctx.strokeStyle = fanColor;
    ctx.fillStyle = fanColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (flash.aim) {
      // 世界座標は等方なので、ピクセル空間の角度は判定の角度と同じ
      const half = ((cfg.attackFanDeg / 2) * Math.PI) / 180;
      const center = Math.atan2(flash.aim.y, flash.aim.x);
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, pr(cfg.attackRadius), center - half, center + half);
      ctx.closePath();
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.arc(p.x, p.y, pr(cfg.attackRadius), 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  if (flash.cancel) {
    // 相殺の成立 (v3 T4): 消した当たりの位置に白い閃光 (敵の 1.5 倍から 0.5 倍へ縮み、薄くなる) と、
    // 消した当たりの形を白の破線で残す (砕けた見た目。残り時間に比例して薄くなる)
    const c = px(flash.cancel.pos);
    const k = Math.max(0, Math.min(1, flash.cancel.t / CANCEL_FLASH_SEC));
    ctx.globalAlpha = k;
    ctx.fillStyle = COLOR.cancel;
    ctx.beginPath();
    ctx.arc(c.x, c.y, pr(cfg.enemyRadius * (0.5 + 1.0 * k)), 0, Math.PI * 2);
    ctx.fill();
    drawShards(ctx, px, pr, flash.cancel.hitbox);
    ctx.globalAlpha = 1;
  }

  drawHp(ctx, vp, state, cfg);
  ctx.restore();
}

// 敵の向き (単位ベクトル。目と前傾の向き)。攻撃中 (予告開始〜窓の終わり) はその攻撃の来る方向 (incomingDir)、
// 分岐で動いていれば path の進行方向、他は自機の側。向きが定まらない (止まっている) ときも自機の側
function enemyDir(choreo: Choreo, state: SimState, beatSec: number, cfg: Config): Vec {
  const beat = state.beat;
  const toPlayer = normalize({ x: state.player.x - state.enemy.x, y: state.player.y - state.enemy.y });
  const fallback = toPlayer.x === 0 && toPlayer.y === 0 ? { x: -1, y: 0 } : toPlayer;
  // 来ている攻撃 (重なるときは先に当たるもの。構えと同じ選び方)
  const current = currentAttack(choreo, beat, beatSec, cfg);
  if (current) {
    const d = incomingDir(current, beat, state.player, beatSec, cfg, attackMotion(choreo, current));
    return d.x === 0 && d.y === 0 ? fallback : d;
  }
  for (const atk of choreo.attacks) {
    if (atk.branchFromBeat === undefined || beat < atk.branchFromBeat || beat > atk.path[atk.path.length - 1].beat) continue;
    const motion = attackMotion(choreo, atk);
    const now = pathPosAt(atk.path, beat, motion);
    const before = pathPosAt(atk.path, beat - cfg.fixedDt / beatSec, motion);
    const d = normalize({ x: now.x - before.x, y: now.y - before.y });
    return d.x === 0 && d.y === 0 ? fallback : d;
  }
  return fallback;
}

// 当たりの形を描く。円は塗り、線分は太さ r × 2 の線。group (slam) は部品を順に
function drawHitbox(ctx: CanvasRenderingContext2D, px: (v: Vec) => Vec, pr: (r: number) => number, h: Hitbox): void {
  if (h.kind === 'group') {
    for (const part of h.parts) drawHitbox(ctx, px, pr, part);
    return;
  }
  if (h.kind === 'circle') {
    const p = px(h);
    ctx.fillStyle = COLOR.hitbox;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr(h.r), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const a = px(h.a);
  const b = px(h.b);
  ctx.strokeStyle = COLOR.hitboxStrong;
  ctx.lineWidth = Math.max(2, pr(h.r * 2));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// 消した当たりの形を白の破線で描く (円は破線の輪、線分は破線。group は部品を順に)
function drawShards(ctx: CanvasRenderingContext2D, px: (v: Vec) => Vec, pr: (r: number) => number, h: Hitbox): void {
  if (h.kind === 'group') {
    for (const part of h.parts) drawShards(ctx, px, pr, part);
    return;
  }
  ctx.strokeStyle = COLOR.cancel;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  if (h.kind === 'circle') {
    const p = px(h);
    ctx.lineWidth = 2;
    ctx.arc(p.x, p.y, Math.max(1, pr(h.r)), 0, Math.PI * 2);
  } else {
    const a = px(h.a);
    const b = px(h.b);
    ctx.lineWidth = Math.max(2, pr(h.r * 2));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// 相殺の閃光と砕けた形の長さ (秒)。main.ts が立て、毎フレーム減らす
export const CANCEL_FLASH_SEC = 0.3;

export interface FlashState {
  attackClass: 'on' | 'off' | 'miss' | null;
  // attackClass が立っている間に描く扇の向き (sim.lastAim を写す)
  aim: Vec | null;
  // v5: 攻撃の種類 (構えの選択に使う) と、ステップの始まりの演出 (拍の色)
  action: 'normal' | 'riposte' | 'release' | null;
  step: { cls: 'on' | 'miss'; t: number } | null;
  enemyHit: number;
  damaged: number;
  // 相殺の閃光。pos は消した当たりの位置、hitbox は消した当たりの形 (sim.lastCancel)、t は残り秒
  cancel: { pos: Vec; hitbox: Hitbox; t: number } | null;
}

function drawBeatTicks(ctx: CanvasRenderingContext2D, vp: Viewport, grid: Grid, beat: number): void {
  const n = grid.beatsPerBar;
  const idx = Math.floor(beat) % n;
  const y = vp.oy + vp.h * 0.03;
  const spacing = vp.w * 0.02;
  const x0 = vp.ox + vp.w / 2 - (spacing * (n - 1)) / 2;
  for (let i = 0; i < n; i++) {
    const on = i === idx;
    ctx.fillStyle = on ? COLOR.telegraphStrong : COLOR.grid;
    const s = on ? vp.w * 0.008 : vp.w * 0.005;
    ctx.fillRect(x0 + i * spacing - s / 2, y - s / 2, s, s);
  }
}

// 予告: 拍の数に合わせた補助線。当たり点に同心円を予告拍数ぶん置き、中心 → 外側へ 1 拍ごとに動く輪を描く。
// 輪が外側に届く瞬間 = 相殺の基準 (cancelAnchorBeat。dash は自機に届く瞬間)。
// 色は相殺できる攻撃が黄、uncancelable が赤 (v3 T4)、大技 (slam) が紫 (v6 T4)。chainLead (同じフレーズに続く攻撃がある。v5 T6) なら動く輪を二重にする。
// 型ごとの印 (v6 T6。本人: 攻撃の判別がつきづらい): dash は当たりのある区間だけの道と、構えへ動く間の残像。shot は細かい点線と発射点の小さな輪。
// laser は当たりの太さの帯。slam は 4 隅へ飛ぶ発射装置と 4 辺の枠と、逃げ場の帯 (円の外・枠の内側) の薄い塗り
function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  px: (v: Vec) => Vec,
  pr: (r: number) => number,
  atk: Attack,
  beat: number,
  cfg: Config,
  motion: Motion,
  chainLead = false,
): void {
  const anchor = cancelAnchorBeat(atk);
  if (beat < atk.telegraphBeat || beat >= anchor) return;
  const lead = anchor - atk.telegraphBeat;
  const elapsed = beat - atk.telegraphBeat;
  const progress = Math.max(0, Math.min(1, elapsed / lead));
  const rings = Math.max(1, Math.round(lead));
  const impact = pathPosAt(atk.path, anchor, motion);
  const ip = px(impact);
  const maxR = atk.type === 'burst' || atk.type === 'slam' ? atk.hitbox.r : atk.type === 'dash' ? cfg.enemyRadius * 2.2 : cfg.shotRadius * 3;
  const ease = easeFor(motion);
  const weak = isHeavy(atk) ? COLOR.telegraphDouble : atk.uncancelable ? COLOR.telegraphDanger : COLOR.telegraph;
  const strong = isHeavy(atk) ? COLOR.telegraphDoubleStrong : atk.uncancelable ? COLOR.telegraphDangerStrong : COLOR.telegraphStrong;

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = weak;
  for (let k = 1; k <= rings; k++) {
    ctx.beginPath();
    ctx.arc(ip.x, ip.y, pr((maxR * k) / rings), 0, Math.PI * 2);
    ctx.stroke();
  }
  const k = Math.floor(elapsed);
  const frac = ease(elapsed - k);
  const moving = (maxR * Math.min(rings, k + frac)) / rings;
  ctx.lineWidth = 3;
  ctx.strokeStyle = strong;
  ctx.beginPath();
  ctx.arc(ip.x, ip.y, Math.max(1, pr(moving)), 0, Math.PI * 2);
  ctx.stroke();
  if (chainLead) {
    // 2 連の印: 動く輪のすぐ内側にもう 1 本
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ip.x, ip.y, Math.max(1, pr(moving) - 6), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = weak;
  switch (atk.type) {
    case 'dash':
      drawDashCue(ctx, px, pr, atk, beat, cfg, motion);
      break;
    case 'shot': {
      // 細かい点線の射線と、発射点の小さな輪
      const line = aimLine(atk, motion);
      if (!line) break;
      const origin = px(line.origin);
      const end = px(line.end);
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, pr(cfg.shotRadius * 2), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'laser': {
      // 当たりの太さの帯 (半透明。進むほど濃く)
      const line = aimLine(atk, motion);
      if (!line) break;
      const origin = px(line.origin);
      const end = px(line.end);
      ctx.lineWidth = Math.max(2, pr(atk.hitbox.r * 2));
      ctx.globalAlpha = 0.15 + 0.35 * progress;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'slam':
      drawSlamCue(ctx, px, pr, atk, impact, progress, ease, motion, weak, strong);
      break;
    case 'sweep': {
      // 薙ぎ払い (v7 T3): 回る範囲の扇の縁 (半透明。進むほど濃く) と、回り始めの線
      const arc = sweepArc(atk, motion);
      const o = px(arc.origin);
      const r = pr(arc.length);
      const from = Math.min(arc.fromRad, arc.toRad);
      const to = Math.max(arc.fromRad, arc.toRad);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.25 + 0.5 * progress;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.arc(o.x, o.y, r, from, to);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = Math.max(2, pr(atk.hitbox.r * 2));
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + Math.cos(arc.fromRad) * r, o.y + Math.sin(arc.fromRad) * r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'burst':
      break;
  }
}

// dash の印 (v6 T6): 道の破線は当たりのある区間 (impactBeat 〜 窓の終わり) だけ。構えへ動く間 (予告開始 〜 impactBeat) は
// 少し前の位置に薄い円 (残像) を 2 つ置いて、動いていることを見せる。進路の全体は描かない (狭い方向へ動いてから来る、と読めてしまうため)
function drawDashCue(
  ctx: CanvasRenderingContext2D,
  px: (v: Vec) => Vec,
  pr: (r: number) => number,
  atk: Attack,
  beat: number,
  cfg: Config,
  motion: Motion,
): void {
  const start = impactBeat(atk);
  const w = activeWindow(atk, 1, cfg, motion); // dash の窓は拍だけで決まる (beatSec は shot 以外で使わない)
  const pts: Vec[] = [pathPosAt(atk.path, start, motion), ...atk.path.filter((p) => p.beat > start && p.beat < w.endBeat), pathPosAt(atk.path, w.endBeat, motion)];
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  pts.forEach((pt, i) => {
    const q = px(pt);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  if (beat >= start) return;
  const now = pathPosAt(atk.path, beat, motion);
  for (let g = 1; g <= 2; g++) {
    const ghost = pathPosAt(atk.path, Math.max(atk.telegraphBeat, beat - 0.08 * g), motion);
    if (Math.hypot(ghost.x - now.x, ghost.y - now.y) < 0.002) continue;
    const q = px(ghost);
    ctx.globalAlpha = 0.3 / g;
    ctx.fillStyle = COLOR.enemy;
    ctx.beginPath();
    ctx.arc(q.x, q.y, pr(cfg.enemyRadius * (1 - 0.15 * g)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// slam の印 (v6 T4): 発射装置 4 つが予告開始時の敵の位置から 4 隅へ飛び、4 辺の枠が進むほど濃くなる。
// 逃げ場の帯 (円の外・枠の内側) を薄く塗り、円の縁と枠の内縁を見分けられるようにする (帯は 0.1 と狭い)
function drawSlamCue(
  ctx: CanvasRenderingContext2D,
  px: (v: Vec) => Vec,
  pr: (r: number) => number,
  atk: Attack,
  center: Vec,
  progress: number,
  ease: (t: number) => number,
  motion: Motion,
  weak: string,
  strong: string,
): void {
  const shape = slamShape(atk, center);
  const inner = atk.frameHalf! - atk.laserR!;
  const c = px(center);
  // 帯: 枠の内縁の正方形から円を抜いた形 (evenodd)
  ctx.fillStyle = weak;
  ctx.globalAlpha = 0.06 + 0.1 * progress;
  ctx.beginPath();
  ctx.rect(c.x - pr(inner), c.y - pr(inner), pr(inner * 2), pr(inner * 2));
  ctx.arc(c.x, c.y, pr(atk.hitbox.r), 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  // 枠の 4 辺: 進むほど濃く、太さは辺の太さに近づく
  ctx.strokeStyle = weak;
  ctx.globalAlpha = 0.25 + 0.6 * progress;
  ctx.lineWidth = Math.max(1.5, pr(atk.laserR! * 2) * progress);
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  shape.corners.forEach((pt, i) => {
    const q = px(pt);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // 発射装置: 予告開始時の敵の位置から 4 隅へ
  const from = pathPosAt(atk.path, atk.telegraphBeat, motion);
  const t = ease(progress);
  ctx.fillStyle = strong;
  for (const corner of shape.corners) {
    const q = px({ x: from.x + (corner.x - from.x) * t, y: from.y + (corner.y - from.y) * t });
    ctx.beginPath();
    ctx.arc(q.x, q.y, Math.max(2, pr(0.012)), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHp(ctx: CanvasRenderingContext2D, vp: Viewport, state: SimState, cfg: Config): void {
  const y = vp.oy + vp.h * 0.97;
  const th = Math.max(2, vp.h * 0.006);
  const half = vp.w * 0.42;
  const pRatio = state.player.hp / cfg.playerHp;
  const eRatio = state.enemy.hp / cfg.enemyHp;
  ctx.fillStyle = COLOR.grid;
  ctx.fillRect(vp.ox + vp.w * 0.04, y, half, th);
  ctx.fillRect(vp.ox + vp.w * 0.54, y, half, th);
  ctx.fillStyle = pRatio <= 0.4 ? COLOR.hpLow : COLOR.hpOk;
  ctx.fillRect(vp.ox + vp.w * 0.04, y, half * pRatio, th);
  ctx.fillStyle = eRatio <= 0.4 ? COLOR.hpLow : COLOR.enemy;
  ctx.fillRect(vp.ox + vp.w * 0.54 + half * (1 - eRatio), y, half * eRatio, th);
}

function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function parseHex(h: string): number[] {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
