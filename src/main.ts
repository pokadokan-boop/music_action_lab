// タイトル → ゲーム → 結果の遷移。音の時計 (AudioContext.currentTime) を正にして固定ステップで sim を進める
import acceptance from '../acceptance.json';
import { AudioEngine } from './audio/engine';
import { config } from './config';
import type { Choreo } from './core/choreo';
import { GameClock } from './core/clock';
import { createSim, renderToText, step, type SimDeps, type SimState } from './core/sim';
import { buildSummary } from './core/summary';
import { InputManager, type InputSnapshot } from './input';
import { fitViewport, render, type FlashState } from './render/canvas';
import { loadSong, type LoadedSong } from './song';
import { showResult, type ResultView } from './ui/result';
import { showTitle, type TitleView } from './ui/title';

const choreos = Object.values(import.meta.glob<Choreo>('../assets/choreo/*.json', { eager: true, import: 'default' })).sort((a, b) =>
  a.id.localeCompare(b.id),
);
const midiUrls = import.meta.glob<string>('../assets/midi/*.mid', { eager: true, query: '?url', import: 'default' });

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const overlay = document.querySelector<HTMLDivElement>('#overlay')!;
const ctx = canvas.getContext('2d')!;
const input = new InputManager();
let engine: AudioEngine | null = null;

type Phase = 'title' | 'loading' | 'playing' | 'result';
let phase: Phase = 'title';
let title: TitleView | null = null;
let result: ResultView | null = null;
let selected = 0;
let prev: InputSnapshot = input.poll();

let sim: SimState | null = null;
let deps: SimDeps | null = null;
let loaded: LoadedSong | null = null;
let clock = new GameClock(config.fixedDt);
let startAt = 0;
let latencySec = 0;
let fedSec = 0;
// 当たりの処理の遅れ: 当たりが有効になる sim 時刻と、それを処理したフレームの音の時刻との差 (ms)。
// 表示はさらに次の描画まで (1 フレーム以内) 遅れる
const impactLagsMs: number[] = [];
const impactLagSeen = new Set<number>();
const flash: FlashState = { attackClass: null, aim: null, enemyHit: 0, damaged: 0 };
let flashTimer = 0;
const songCache = new Map<string, LoadedSong>();

function songName(): string {
  return choreos[0]?.song ?? 'candidate-2';
}

function enterTitle(): void {
  phase = 'title';
  result?.destroy();
  result = null;
  title = showTitle(overlay, {
    songName: songName(),
    choices: choreos.map((c) => ({ id: c.id, intent: c.intent })),
    onStart: (i) => void startGame(i),
  });
  title.setSelection(selected);
}

async function startGame(index: number): Promise<void> {
  if (phase !== 'title' || choreos.length === 0) return;
  const choreo = choreos[index];
  engine ??= new AudioEngine();
  await engine.resume();
  if (engine.ctx.state !== 'running') {
    title?.setHint('音を有効にするため、クリックかキーボードで開始してください');
    return;
  }
  phase = 'loading';
  title?.setHint('読み込み中...');
  const url = midiUrls[`../assets/midi/${choreo.song}.mid`];
  if (!url) {
    title?.setHint(`曲が見つかりません: ${choreo.song}`);
    phase = 'title';
    return;
  }
  loaded = songCache.get(choreo.song) ?? (await loadSong(url));
  songCache.set(choreo.song, loaded);

  deps = { choreo, grid: loaded.grid, cfg: config, acceptance };
  sim = createSim(deps);
  clock = new GameClock(config.fixedDt);
  fedSec = 0;
  impactLagsMs.length = 0;
  impactLagSeen.clear();
  flash.attackClass = null;
  flash.enemyHit = 0;
  flash.damaged = 0;
  flash.aim = null;
  title?.destroy();
  title = null;
  // 音の出力遅延ぶんゲーム時計を遅らせ、絵と判定を「聞こえる音」に合わせる
  latencySec = engine.outputLatency();
  startAt = engine.start(loaded.song, engine.now() + 0.5) + latencySec;
  phase = 'playing';
}

function enterResult(): void {
  if (!sim || !deps) return;
  phase = 'result';
  const text = buildSummary(sim.log, deps.choreo, deps.grid, {
    choreoId: deps.choreo.id,
    song: deps.choreo.song,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    extra: `音の出力遅延の補正 ${(latencySec * 1000).toFixed(0)} ms / 当たりの処理遅れ ${lagSummary()}`,
  });
  result = showResult(overlay, { text, onRetry: () => enterTitle() });
}

function lagSummary(): string {
  if (impactLagsMs.length === 0) return 'なし';
  const mean = impactLagsMs.reduce((a, b) => a + b, 0) / impactLagsMs.length;
  const max = Math.max(...impactLagsMs);
  return `平均 ${mean.toFixed(0)} ms 最大 ${max.toFixed(0)} ms (表示はさらに 1 フレーム以内)`;
}

function handleTitleInput(now: InputSnapshot): void {
  if (choreos.length > 1) {
    if (now.selectRight && !prev.selectRight) selected = (selected + 1) % choreos.length;
    if (now.selectLeft && !prev.selectLeft) selected = (selected - 1 + choreos.length) % choreos.length;
    title?.setSelection(selected);
  }
  title?.setGamepad(now.gamepadName);
  if (now.confirm && !prev.confirm) void startGame(selected);
}

function updateGame(now: InputSnapshot, frameDt: number): void {
  if (!sim || !deps || !engine) return;
  const elapsed = engine.now() - startAt;
  if (elapsed > 0) {
    const steps = clock.advanceTime((elapsed - fedSec) * 1000);
    fedSec = elapsed;
    for (const _t of steps) {
      step(sim, { move: now.move, attackPressed: now.attackPressed }, config.fixedDt, deps);
      if (sim.lastAttackClass) {
        engine.scheduleSfx(sim.lastAttackClass, engine.now());
        flash.attackClass = sim.lastAttackClass;
        flash.aim = sim.lastAim;
        flashTimer = 0.12;
      }
      if (sim.lastHit) flash.enemyHit = 0.1;
      if (sim.lastDamage) flash.damaged = 0.2;
    }
    for (const [idx, t] of sim.impactAt) {
      if (impactLagSeen.has(idx)) continue;
      impactLagSeen.add(idx);
      impactLagsMs.push((elapsed - t) * 1000);
    }
  }
  flashTimer -= frameDt;
  if (flashTimer <= 0) flash.attackClass = null;
  flash.enemyHit = Math.max(0, flash.enemyHit - frameDt);
  flash.damaged = Math.max(0, flash.damaged - frameDt);
  if (sim.finished) enterResult();
}

let lastFrame = performance.now();
function frame(nowMs: number): void {
  const frameDt = Math.min(0.1, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  const now = input.poll();
  if (phase === 'title') handleTitleInput(now);
  if (phase === 'playing') updateGame(now, frameDt);
  if (phase === 'result' && now.confirm && !prev.confirm) enterTitle();
  prev = now;

  const vp = fitViewport(canvas);
  if (sim && deps) render(ctx, vp, sim, deps, flash);
  else {
    ctx.fillStyle = '#101014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

declare global {
  interface Window {
    __game: { renderToText: () => string; phase: () => Phase };
  }
}
window.__game = { renderToText: () => (sim ? renderToText(sim) : `phase=${phase}`), phase: () => phase };

enterTitle();
requestAnimationFrame(frame);
