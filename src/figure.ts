// 敵の姿の確認ページ (v7 T5)。決闘者を 段 × 動き の表に並べ、2 拍 1 周で動かす。本人に最終形態を見せる・Claude が Chrome で確認する用。
// ゲームと同じ drawDuelist を使い、位相は motionFromLoop で作る
import type { EnemyMove } from './core/choreo';
import { drawDuelist, motionFromLoop } from './render/duelist';

const MOVES: (EnemyMove | null)[] = [null, 'thrust', 'chop', 'heavyChop', 'sweep', 'dash', 'shot'];
const MOVE_LABEL: Record<string, string> = { null: '構え', thrust: '突き', chop: '振り下ろし', heavyChop: '大上段', sweep: '薙ぎ払い', dash: '踏み込み突き', shot: '飛ぶ剣' };
const ENEMY = '#d05aa0';

const canvas = document.querySelector<HTMLCanvasElement>('#sheet')!;
const ctx = canvas.getContext('2d')!;
const controls = document.querySelector<HTMLDivElement>('#controls')!;

const ui = { playing: true, still: false, aimUp: 0, scrub: 0.25, progress: 1, face: -1 as 1 | -1 };

function button(label: string, pressed: () => boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed()));
  b.addEventListener('click', () => {
    onClick();
    for (const el of controls.querySelectorAll('button')) el.setAttribute('aria-pressed', String(refreshers.get(el)?.() ?? false));
  });
  refreshers.set(b, pressed);
  return b;
}
const refreshers = new Map<HTMLButtonElement, () => boolean>();

function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLLabelElement {
  const l = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const span = document.createElement('span');
  span.textContent = ` ${label} ${value}`;
  input.addEventListener('input', () => {
    onInput(Number(input.value));
    span.textContent = ` ${label} ${input.value}`;
  });
  l.append(input, span);
  return l;
}

controls.append(
  button('動かす (2 拍 1 周)', () => ui.playing && !ui.still, () => { ui.playing = true; ui.still = false; }),
  button('打点で止める', () => ui.still, () => { ui.still = true; ui.playing = false; }),
  button('位相を手で', () => !ui.playing && !ui.still, () => { ui.playing = false; ui.still = false; }),
  slider('位相', 0, 1, 0.01, ui.scrub, (v) => { ui.scrub = v; }),
  slider('攻撃の向き (上 +)', -50, 50, 1, ui.aimUp, (v) => { ui.aimUp = v; }),
  slider('段の中の進み', 0, 1, 0.05, ui.progress, (v) => { ui.progress = v; }),
  button('左向き (自機が左)', () => ui.face === -1, () => { ui.face = -1; }),
  button('右向き', () => ui.face === 1, () => { ui.face = 1; }),
);

// 場面の静止画モード (下) のときは表を描かない
let sceneMode = false;
const start = performance.now();
const LOOP_SEC = 1.5; // 160 BPM の 2 拍 = 0.75 秒だと速すぎて見づらいので 2 倍に

function draw(now: number): void {
  if (sceneMode) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, w, h);
  const phase = ui.playing ? ((now - start) / 1000 / LOOP_SEC) % 1 : ui.still ? 0.56 : ui.scrub;
  const cols = MOVES.length;
  const rows = 3;
  const cw = w / cols;
  const rh = h / rows;
  const r = Math.min(cw, rh) * 0.17;
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const a = (ui.aimUp * Math.PI) / 180;
  const dir = { x: ui.face * Math.cos(a), y: -Math.sin(a) };
  // 拍の頭の明るさ: 位相の 0 と 0.5 を拍の頭とみなす
  const beatFrac = (phase * 2) % 1;
  const pulse = 1 - (1 - (1 - beatFrac) ** 3);
  for (let row = 0; row < rows; row++) {
    const st = { stage: row, progress: ui.progress, overall: (row + ui.progress) / 3 };
    for (let col = 0; col < cols; col++) {
      const move = MOVES[col];
      const motion = motionFromLoop(move, phase);
      const cx = cw * (col + 0.5);
      const cy = rh * (row + 0.5);
      ctx.strokeStyle = '#2a2a33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      drawDuelist(ctx, { x: cx, y: cy }, r, motion, dir, pulse, ENEMY, false, 'guard', st, phase * 2);
      ctx.fillStyle = '#8a8a8a';
      ctx.fillText(`段 ${row + 1} / ${MOVE_LABEL[String(move)]}${move ? ` pre ${motion.pre.toFixed(2)} post ${motion.post.toFixed(2)}` : ''}`, cx, cy + rh * 0.4);
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---- 場面の静止画 (v7 T5): ?beat=28.6,30.1 のように拍を指定すると、2 曲目 (v7.json) をその拍まで進めた実際のゲーム画面を上から順に描く。
// 自機は動かさない (px / py で世界座標の開始位置を変えられる。既定は開始位置)。スクリーンショットで動きと予告を確かめるためのもの
import acceptance from '../acceptance.json';
// 振り付けは ?choreo=v6 のように id で選べる (省略時 v7)。曲は振り付けの song から
const choreos = import.meta.glob<Choreo>('../assets/choreo/*.json', { eager: true, import: 'default' });
const midiUrls = import.meta.glob<string>('../assets/midi/*.mid', { eager: true, query: '?url', import: 'default' });
import { makeConfig } from './config';
import type { Choreo } from './core/choreo';
import { sceneDeps } from './core/scene';
import { createSim, step, type InputState } from './core/sim';
import { render, type FlashState } from './render/canvas';
import { loadSong } from './song';

async function renderScenes(beats: number[], px: number | null, py: number | null, choreoId: string): Promise<void> {
  const choreo = Object.values(choreos).find((c) => c.id === choreoId);
  if (!choreo) throw new Error(`振り付け ${choreoId} が無い (${Object.values(choreos).map((c) => c.id).join(', ')})`);
  const loaded = await loadSong(midiUrls[`../assets/midi/${choreo.song}.mid`]);
  const cfg = makeConfig();
  const deps = sceneDeps(choreo, loaded.grid, cfg, acceptance);
  const stay: InputState = { move: { x: 0, y: 0 }, attackPressed: false };
  const W = 1120;
  const H = 630;
  const LABEL = 22;
  canvas.width = W;
  canvas.height = (H + LABEL) * beats.length;
  canvas.style.maxWidth = `${W}px`;
  const flash: FlashState = { attackClass: null, aim: null, action: null, step: null, enemyHit: 0, damaged: 0, cancel: null };
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  beats.forEach((beat, i) => {
    const state = createSim(deps);
    // 自機の HP は尽きないようにしておく (被弾しても絵は変わらない)
    state.player.hp = 99;
    if (px !== null) state.player.x = px;
    if (py !== null) state.player.y = py;
    while (state.beat < beat - 1e-9) step(state, stay, cfg.fixedDt, deps);
    const oy = i * (H + LABEL) + LABEL;
    // render は canvas 全体を背景色で塗るので、各場面を一時 canvas に描いて貼る
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    const tctx = tmp.getContext('2d')!;
    render(tctx, { ox: 0, oy: 0, w: W, h: H }, state, deps, flash);
    ctx.drawImage(tmp, 0, oy);
    ctx.fillStyle = '#8a8a8a';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const bar = Math.floor(beat / loaded.grid.beatsPerBar);
    ctx.fillText(`拍 ${beat.toFixed(2)} (小節 ${bar}、段 ${Math.floor(bar / 8) + 1})  自機 (${state.player.x.toFixed(3)}, ${state.player.y.toFixed(3)})  敵 HP ${state.enemy.hp}  自機 HP ${state.player.hp}`, 8, i * (H + LABEL) + 4);
  });
}

const params = new URLSearchParams(location.search);
if (params.has('beat')) {
  sceneMode = true;
  controls.textContent = '場面の静止画 (?beat=28.6,30.1 の拍まで v7.json を進めた実際の画面。自機は動かない)';
  const beats = params.get('beat')!.split(',').map(Number).filter((b) => Number.isFinite(b));
  const num = (k: string) => (params.has(k) ? Number(params.get(k)) : null);
  renderScenes(beats, num('px'), num('py'), params.get('choreo') ?? 'v7').catch((e) => {
    controls.textContent = `描けない: ${(e as Error).message}`;
  });
}
