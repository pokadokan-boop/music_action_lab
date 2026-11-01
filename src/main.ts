// タイトル → ゲーム → 結果の遷移。音の時計 (AudioContext.currentTime) を正にして固定ステップで sim を進める
import acceptance from '../acceptance.json';
import { AudioEngine, midiToHz } from './audio/engine';
import { PITCH_RULE_LABEL, cancelMidi, chargeRange, pitchFor, type PitchRule, type SoundAction } from './audio/pitch';
import { makeConfig } from './config';
import type { Choreo } from './core/choreo';
import { GameClock } from './core/clock';
import type { BeatClass } from './core/log';
import { createSim, renderToText, step, type SimDeps, type SimState } from './core/sim';
import { buildSummary } from './core/summary';
import { InputManager, type InputSnapshot } from './input';
import { CANCEL_FLASH_SEC, fitViewport, render, type FlashState } from './render/canvas';
import { loadSong, type LoadedSong } from './song';
import { showResult, type ResultView } from './ui/result';
import { showTitle, type TitleView } from './ui/title';
import { describeTuning, loadPitchRule, loadTuning, savePitchRule, saveTuning } from './ui/tuning';

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

// 調整パネルの値。タイトルで変えるたびに保存し、開始時に Config に焼く (ゲーム中は変わらない)
let tuning = loadTuning();
// 音高の案 (v5 T4)。タイトルで選び、保存する
let pitchRule: PitchRule = loadPitchRule();
let sim: SimState | null = null;
let deps: SimDeps | null = null;
let loaded: LoadedSong | null = null;
let clock = new GameClock(makeConfig(tuning).fixedDt);
let startAt = 0;
let latencySec = 0;
let fedSec = 0;
// 当たりの処理の遅れ: 当たりが有効になる sim 時刻と、それを処理したフレームの音の時刻との差 (ms)。
// 表示はさらに次の描画まで (1 フレーム以内) 遅れる
const impactLagsMs: number[] = [];
const impactLagSeen = new Set<number>();
const flash: FlashState = { attackClass: null, aim: null, action: null, step: null, enemyHit: 0, damaged: 0, cancel: null };
let flashTimer = 0;
const STEP_FLASH_SEC = 0.1;
const songCache = new Map<string, LoadedSong>();

// プレイヤーの音 (v5 T4): 行動と拍の分類から音高の案で MIDI 番号を決め、音の口 (override.hz) で撥弦に渡す。
// 音色 (長さ・明るさ) は pluck.ts の既定。案 3 (fixed) は v3 の Hz に一致する
function playSfx(action: SoundAction, cls: BeatClass): void {
  if (!engine || !sim || !deps) return;
  const kind = action === 'attack' ? cls : action;
  const midi = pitchFor(action, cls, sim.beat, deps.grid, pitchRule);
  engine.scheduleSfx(kind, engine.now(), midi, { hz: midiToHz(midi) });
}

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
    tuning,
    onTuningChange: (t) => {
      tuning = t;
      saveTuning(t);
    },
    pitchRule,
    onPitchRuleChange: (rule) => {
      pitchRule = rule;
      savePitchRule(rule);
    },
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

  const cfg = makeConfig(tuning);
  deps = { choreo, grid: loaded.grid, cfg, acceptance };
  sim = createSim(deps);
  clock = new GameClock(cfg.fixedDt);
  fedSec = 0;
  impactLagsMs.length = 0;
  impactLagSeen.clear();
  flash.attackClass = null;
  flash.action = null;
  flash.step = null;
  flash.enemyHit = 0;
  flash.damaged = 0;
  flash.aim = null;
  flash.cancel = null;
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
    extra: `${describeTuning(deps.cfg.tuning)} / 音の${PITCH_RULE_LABEL[pitchRule]} / 音の出力遅延の補正 ${(latencySec * 1000).toFixed(0)} ms / 当たりの処理遅れ ${lagSummary()}`,
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
      step(sim, { move: now.move, attackPressed: now.attackPressed, dodgePressed: now.dodgePressed }, deps.cfg.fixedDt, deps);
      if (sim.lastAttackClass) {
        const action = sim.lastAction ?? 'normal';
        playSfx(action === 'normal' ? 'attack' : action, sim.lastAttackClass);
        flash.attackClass = sim.lastAttackClass;
        flash.action = action;
        flash.aim = sim.lastAim;
        flashTimer = action === 'release' ? 0.2 : 0.12;
      }
      if (sim.lastStep) {
        playSfx('step', sim.lastStep.cls);
        flash.step = { cls: sim.lastStep.cls === 'on' ? 'on' : 'miss', t: STEP_FLASH_SEC };
      }
      // 溜めの持続音 (v5 T2): 閾値を超えたら始め、放ちか解除で止める。音高の範囲は案で決まる
      if (sim.lastChargeBegin) {
        const r = chargeRange(sim.beat, deps.grid, pitchRule);
        engine.startCharge(engine.now(), r.from, r.to, deps.cfg.chargeFullBeats * deps.grid.beatSec);
      }
      if (sim.lastChargeEnd) engine.stopCharge(engine.now());
      if (sim.lastHit) flash.enemyHit = 0.1;
      if (sim.lastDamage) flash.damaged = 0.2;
      if (sim.lastCancel) {
        engine.scheduleSfx('cancel', engine.now(), cancelMidi(deps.grid, sim.beat));
        flash.cancel = { pos: sim.lastCancel.pos, hitbox: sim.lastCancel.hitbox, t: CANCEL_FLASH_SEC };
      }
    }
    for (const [idx, t] of sim.impactAt) {
      if (impactLagSeen.has(idx)) continue;
      impactLagSeen.add(idx);
      impactLagsMs.push((elapsed - t) * 1000);
    }
  }
  flashTimer -= frameDt;
  if (flashTimer <= 0) {
    flash.attackClass = null;
    flash.action = null;
  }
  if (flash.step) {
    flash.step.t -= frameDt;
    if (flash.step.t <= 0) flash.step = null;
  }
  flash.enemyHit = Math.max(0, flash.enemyHit - frameDt);
  flash.damaged = Math.max(0, flash.damaged - frameDt);
  if (flash.cancel) {
    flash.cancel.t -= frameDt;
    if (flash.cancel.t <= 0) flash.cancel = null;
  }
  if (sim.finished) {
    engine.stopCharge(engine.now());
    enterResult();
  }
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
