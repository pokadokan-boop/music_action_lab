// Canvas 2D で四角と線だけで描く。位置は正規化座標 → 16:9 の描画領域へ変換する
import type { Config } from '../config';
import { aimLine, attackMotion, easeFor, hitboxAt, impactBeat, pathPosAt, type Attack, type Choreo, type Motion } from '../core/choreo';
import type { Grid } from '../core/grid';
import { effectiveChoreo, type SimState } from '../core/sim';
import { easeOut, type Vec } from '../core/vec';

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

  const px = (v: Vec) => ({ x: vp.ox + v.x * vp.w, y: vp.oy + v.y * vp.h });
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

  // 敵: 拍の頭で明るく、イージングアウトで戻る
  const e = px(state.enemy);
  const er = pr(cfg.enemyRadius);
  ctx.fillStyle = flash.enemyHit > 0 ? '#ffffff' : mix(COLOR.enemy, '#ffffff', pulse * 0.35);
  ctx.fillRect(e.x - er, e.y - er, er * 2, er * 2);

  // プレイヤー
  const p = px(state.player);
  const prr = pr(cfg.playerRadius);
  let pc = mix(COLOR.player, '#ffffff', pulse * 0.2);
  if (flash.attackClass) pc = COLOR[flash.attackClass];
  if (flash.damaged > 0) pc = COLOR.hpLow;
  ctx.fillStyle = pc;
  ctx.fillRect(p.x - prr, p.y - prr, prr * 2, prr * 2);
  if (flash.attackClass) {
    // 攻撃の瞬間: 向いた方向へ meleeRange の扇 (塗り + 縁) を出す。向きが無い (古い状態) なら円で代える。
    // 相殺が成立した押下なら扇は白 (拍の色より「捌けた」を優先して見せる)
    const fanColor = flash.cancel ? COLOR.cancel : pc;
    ctx.strokeStyle = fanColor;
    ctx.fillStyle = fanColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (flash.aim) {
      // 判定は正規化座標 (x, y とも 0..1) で行われ、画面は 16:9 なので、正規化空間で扇を作ってから画面へ写す。
      // ピクセル空間で角度を取ると向きが最大 16 度ずれ、「向きを合わせたのに外れた」と見える
      const half = ((cfg.attackFanDeg / 2) * Math.PI) / 180;
      const center = Math.atan2(flash.aim.y, flash.aim.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(vp.w, vp.h);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, cfg.meleeRange, center - half, center + half);
      ctx.closePath();
      ctx.restore();
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.arc(p.x, p.y, pr(cfg.meleeRange), 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  if (flash.cancel) {
    // 相殺の閃光: 消した当たりの位置に白い円。残り時間に比例して縮み、薄くなる
    const c = px(flash.cancel.pos);
    const k = Math.max(0, Math.min(1, flash.cancel.t / CANCEL_FLASH_SEC));
    ctx.fillStyle = COLOR.cancel;
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.arc(c.x, c.y, pr(cfg.enemyRadius * (0.6 + 0.8 * k)), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawHp(ctx, vp, state, cfg);
  ctx.restore();
}

// 相殺の閃光の長さ (秒)。main.ts が立て、毎フレーム減らす
export const CANCEL_FLASH_SEC = 0.15;

export interface FlashState {
  attackClass: 'on' | 'off' | 'miss' | null;
  // attackClass が立っている間に描く扇の向き (sim.lastAim を写す)
  aim: Vec | null;
  enemyHit: number;
  damaged: number;
  // 相殺の閃光。pos は消した当たりの位置 (sim.lastCancel.pos)、t は残り秒
  cancel: { pos: Vec; t: number } | null;
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
// dash は進路の線、shot は射線を添える
function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  px: (v: Vec) => Vec,
  pr: (r: number) => number,
  atk: Attack,
  beat: number,
  cfg: Config,
  motion: Motion,
): void {
  // 予告は音のアンカー (hitBeat) で輪が外側に届き、実際の当たり (impactBeat) まで出しておく
  if (beat < atk.telegraphBeat || beat >= impactBeat(atk)) return;
  const lead = atk.hitBeat - atk.telegraphBeat;
  const elapsed = beat - atk.telegraphBeat;
  const rings = Math.max(1, Math.round(lead));
  const impact = pathPosAt(atk.path, impactBeat(atk), motion);
  const ip = px(impact);
  const maxR = atk.type === 'burst' ? atk.hitbox.r : atk.type === 'dash' ? cfg.enemyRadius * 2.2 : cfg.shotRadius * 3;
  const ease = easeFor(motion);

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLOR.telegraph;
  for (let k = 1; k <= rings; k++) {
    ctx.beginPath();
    ctx.arc(ip.x, ip.y, pr((maxR * k) / rings), 0, Math.PI * 2);
    ctx.stroke();
  }
  const k = Math.floor(elapsed);
  const frac = ease(elapsed - k);
  const moving = (maxR * Math.min(rings, k + frac)) / rings;
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLOR.telegraphStrong;
  ctx.beginPath();
  ctx.arc(ip.x, ip.y, Math.max(1, pr(moving)), 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = COLOR.telegraph;
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
