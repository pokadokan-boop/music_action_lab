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
  incomingDir,
  pathPosAt,
  type Attack,
  type Choreo,
  type Hitbox,
  type Motion,
} from '../core/choreo';
import type { Grid } from '../core/grid';
import { enemyPose, playerPose } from '../core/pose';
import { effectiveChoreo, type SimState } from '../core/sim';
import { easeOut, normalize, type Vec } from '../core/vec';
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

  for (const atk of choreo.attacks) drawTelegraph(ctx, px, pr, atk, beat, cfg, attackMotion(choreo, atk));

  for (const [idx, atk] of choreo.attacks.entries()) {
    // 相殺された当たりは消えている (sim.checkDamage と同じ)。本体は path どおり動き続ける
    if (state.cancelled.has(idx)) continue;
    const h = hitboxAt(atk, beat, grid.beatSec, cfg, attackMotion(choreo, atk));
    if (!h) continue;
    if (h.kind === 'circle') {
      const p = px(h);
      ctx.fillStyle = COLOR.hitbox;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr(h.r), 0, Math.PI * 2);
      ctx.fill();
    } else {
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
  }

  // 敵: 構えは core が決める。拍の頭で明るく、イージングアウトで戻る。命中の瞬間は白
  const e = px(state.enemy);
  const ePose = enemyPose(choreo, beat, grid.beatSec, cfg);
  const eDir = enemyDir(choreo, state, grid.beatSec, cfg);
  drawEnemy(ctx, e, pr(cfg.enemyRadius), ePose, eDir, pulse, mix(COLOR.enemy, '#ffffff', pulse * 0.35), flash.enemyHit > 0);

  // プレイヤー: 構えは core が決める。向きは攻撃の向きがあればその側、無ければ敵のいる側
  const p = px(state.player);
  let pc = mix(COLOR.player, '#ffffff', pulse * 0.2);
  if (flash.attackClass) pc = COLOR[flash.attackClass];
  if (flash.damaged > 0) pc = COLOR.hpLow;
  const pPose = playerPose({ attacking: !!flash.attackClass, cancelling: !!flash.cancel, damaged: flash.damaged > 0 }, ePose);
  const facingX = flash.aim && flash.aim.x !== 0 ? flash.aim.x : state.enemy.x - state.player.x;
  drawPlayer(ctx, p, pr(cfg.playerRadius), pPose, facingX < 0 ? -1 : 1, pulse, pc);
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
  for (const atk of choreo.attacks) {
    const motion = attackMotion(choreo, atk);
    const w = activeWindow(atk, beatSec, cfg, motion);
    if (beat < atk.telegraphBeat || beat > w.endBeat) continue;
    const d = incomingDir(atk, beat, state.player, beatSec, cfg, motion);
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

// 消した当たりの形を白の破線で描く (円は破線の輪、線分は破線)
function drawShards(ctx: CanvasRenderingContext2D, px: (v: Vec) => Vec, pr: (r: number) => number, h: Hitbox): void {
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
// dash は進路の線、shot は射線を添える。輪が外側に届く瞬間 = 相殺の基準 (cancelAnchorBeat。dash は自機に届く瞬間)。
// 色は相殺できる攻撃が黄、uncancelable が赤 (v3 T4)
function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  px: (v: Vec) => Vec,
  pr: (r: number) => number,
  atk: Attack,
  beat: number,
  cfg: Config,
  motion: Motion,
): void {
  const anchor = cancelAnchorBeat(atk);
  if (beat < atk.telegraphBeat || beat >= anchor) return;
  const lead = anchor - atk.telegraphBeat;
  const elapsed = beat - atk.telegraphBeat;
  const rings = Math.max(1, Math.round(lead));
  const impact = pathPosAt(atk.path, anchor, motion);
  const ip = px(impact);
  const maxR = atk.type === 'burst' ? atk.hitbox.r : atk.type === 'dash' ? cfg.enemyRadius * 2.2 : cfg.shotRadius * 3;
  const ease = easeFor(motion);
  const weak = atk.uncancelable ? COLOR.telegraphDanger : COLOR.telegraph;
  const strong = atk.uncancelable ? COLOR.telegraphDangerStrong : COLOR.telegraphStrong;

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

  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = weak;
  if (atk.type === 'dash') {
    ctx.beginPath();
    atk.path.forEach((pt, i) => {
      const q = px(pt);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  } else {
    const line = aimLine(atk, motion);
    if (line) {
      const origin = px(line.origin);
      const end = px(line.end);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
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
