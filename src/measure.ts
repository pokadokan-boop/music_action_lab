// 立ち上がり時刻の測定ページ (docs/plan/v2-phase2.md T1)。合成器 (AudioEngine) を OfflineAudioContext で動かして
// 曲の波形を描き、振り付けの各攻撃のアンカー拍 (hitBeat) について広帯域と低域の立ち上がり時刻を表にする。
// 値は window.__measure に置き、Claude が Chrome の JS で読んで docs/decisions/v2-timing-standard.md に写す。
import type { Midi } from '@tonejs/midi';
import { AudioEngine } from './audio/engine';
import { ONSET_SETTINGS, energyEnvelope, lowpass, riseTime } from './audio/onset';
import { impactBeat, type Choreo } from './core/choreo';
import { loadSong } from './song';

const choreos = Object.values(import.meta.glob<Choreo>('../assets/choreo/*.json', { eager: true, import: 'default' })).sort((a, b) =>
  a.id.localeCompare(b.id),
);
const midiUrls = import.meta.glob<string>('../assets/midi/*.mid', { eager: true, query: '?url', import: 'default' });

const SAMPLE_RATE = 48000;
const RENDER_SEC = 21;
// 「鳴っている音」を拾う幅: アンカー拍 ± この ms に始まる音
const SOUNDING_TOLERANCE_MS = 10;
const DRUM_NAMES: Record<number, string> = { 36: 'kick', 38: 'snare', 42: 'hat' };

interface MeasureRow {
  choreo: string;
  attackIndex: number;
  type: string;
  hitBeat: number;
  anchorMs: number;
  sounding: string;
  wide90Ms: number;
  wide50Ms: number;
  low90Ms: number;
  low50Ms: number;
  impactDelayMs: number;
  diffWide90Ms: number;
  diffLow90Ms: number;
}

interface MeasureResult {
  settings: typeof ONSET_SETTINGS;
  rows: MeasureRow[];
  error?: string;
}

declare global {
  interface Window {
    __measure: MeasureResult;
  }
}

interface Envelopes {
  wide: Float32Array;
  low: Float32Array;
}

// 曲を OfflineAudioContext で描き、広帯域と低域の RMS 包絡を出す
async function renderEnvelopes(song: Parameters<AudioEngine['start']>[0]): Promise<Envelopes> {
  const offline = new OfflineAudioContext(1, SAMPLE_RATE * RENDER_SEC, SAMPLE_RATE);
  const engine = new AudioEngine(offline);
  engine.start(song, 0);
  const buf = await offline.startRendering();
  const samples = buf.getChannelData(0);
  return {
    wide: energyEnvelope(samples, SAMPLE_RATE),
    low: energyEnvelope(lowpass(samples, SAMPLE_RATE), SAMPLE_RATE),
  };
}

// アンカー時刻に始まる音を MIDI から拾う: メロディの音高と、drums の kick / snare / hat の有無
function soundingAt(midi: Midi, anchorSec: number): string {
  const tol = SOUNDING_TOLERANCE_MS / 1000;
  const near = (t: number) => Math.abs(t - anchorSec) <= tol;
  const melody = midi.tracks.find((t) => t.name === 'melody' && t.notes.length > 0) ?? midi.tracks.find((t) => t.notes.length > 0);
  const parts: string[] = [];
  const pitches = melody ? melody.notes.filter((n) => near(n.time)).map((n) => n.midi) : [];
  if (pitches.length > 0) parts.push(`melody ${pitches.join(',')}`);
  const drums = midi.tracks.find((t) => t.name === 'drums');
  if (drums) {
    const hit = new Set(drums.notes.filter((n) => near(n.time)).map((n) => n.midi));
    for (const [midiNo, name] of Object.entries(DRUM_NAMES)) if (hit.has(Number(midiNo))) parts.push(name);
  }
  return parts.length > 0 ? parts.join(' / ') : '(なし)';
}

async function measureAll(): Promise<MeasureRow[]> {
  const rows: MeasureRow[] = [];
  const songs = [...new Set(choreos.map((c) => c.song))];
  for (const songName of songs) {
    const url = midiUrls[`../assets/midi/${songName}.mid`];
    if (!url) throw new Error(`曲が見つかりません: ${songName}`);
    const loaded = await loadSong(url);
    const env = await renderEnvelopes(loaded.song);
    const beatSec = loaded.grid.beatSec;
    for (const choreo of choreos.filter((c) => c.song === songName)) {
      choreo.attacks.forEach((atk, i) => {
        const anchorSec = atk.hitBeat * beatSec;
        const wide = riseTime(env.wide, ONSET_SETTINGS.hopSec, anchorSec);
        const low = riseTime(env.low, ONSET_SETTINGS.hopSec, anchorSec);
        const impactDelayMs = (impactBeat(atk) - atk.hitBeat) * beatSec * 1000;
        rows.push({
          choreo: choreo.id,
          attackIndex: i,
          type: atk.type,
          hitBeat: atk.hitBeat,
          anchorMs: anchorSec * 1000,
          sounding: soundingAt(loaded.midi, anchorSec),
          wide90Ms: wide.rise90Ms,
          wide50Ms: wide.rise50Ms,
          low90Ms: low.rise90Ms,
          low50Ms: low.rise50Ms,
          impactDelayMs,
          diffWide90Ms: wide.rise90Ms - impactDelayMs,
          diffLow90Ms: low.rise90Ms - impactDelayMs,
        });
      });
    }
  }
  return rows;
}

function settingsSentence(): string {
  const s = ONSET_SETTINGS;
  const ms = (sec: number) => `${(sec * 1000).toFixed(0)} ms`;
  return (
    `測定の設定: RMS 窓 ${ms(s.windowSec)}、刻み ${ms(s.hopSec)}。` +
    `基準 = [t0 − ${ms(s.baselineStartSec)}, t0 − ${ms(s.baselineEndSec)}] の平均、ピーク = [t0, t0 + ${ms(s.peakSearchSec)}] の最大。` +
    `立ち上がり = 基準 + ${(s.riseRatio * 100).toFixed(0)}% × (ピーク − 基準) に初めて達する時刻 − t0 (${(s.halfRatio * 100).toFixed(0)}% も併記)。` +
    `低域 = ${s.lowpassHz} Hz の 2 次バイカッド (Butterworth) ローパス後。t0 = hitBeat × 1 拍の秒数。` +
    `偏り: RMS 窓は時刻 t で終わる後ろ向きの窓なので、立ち上がりは真の値より系統的に遅く出る (5 ms ランプで約 +7 ms、ステップで約 +9 ms。低域はさらにローパスの群遅延 約 1 ms)。境界付近の値を読むときはこの分を差し引く。`
  );
}

const fmt = (v: number) => (Number.isNaN(v) ? '-' : v.toFixed(1));

function renderTable(app: HTMLElement, rows: MeasureRow[]): void {
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;font-size:13px;';
  const headers = [
    '振り付け', '攻撃', 'type', 'hitBeat', 'アンカー ms', '鳴っている音',
    '広帯域 90%', '広帯域 50%', '低域 90%', '低域 50%', 'impactDelay ms', '差 (広帯域 90%)', '差 (低域 90%)',
  ];
  const thead = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = 'border:1px solid #444;padding:4px 8px;text-align:left;';
    thead.appendChild(th);
  }
  table.appendChild(thead);
  for (const r of rows) {
    const tr = document.createElement('tr');
    const cells = [
      r.choreo, String(r.attackIndex), r.type, String(r.hitBeat), fmt(r.anchorMs), r.sounding,
      fmt(r.wide90Ms), fmt(r.wide50Ms), fmt(r.low90Ms), fmt(r.low50Ms), fmt(r.impactDelayMs), fmt(r.diffWide90Ms), fmt(r.diffLow90Ms),
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      td.style.cssText = 'border:1px solid #444;padding:4px 8px;';
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  app.appendChild(table);
}

async function main(app: HTMLElement): Promise<void> {
  app.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = '立ち上がり時刻の測定';
  title.style.fontSize = '20px';
  app.appendChild(title);
  const settings = document.createElement('p');
  settings.textContent = settingsSentence();
  settings.style.cssText = 'opacity:0.8;font-size:13px;';
  app.appendChild(settings);
  const status = document.createElement('p');
  status.textContent = '描画中...';
  app.appendChild(status);

  const result: MeasureResult = { settings: ONSET_SETTINGS, rows: [] };
  try {
    result.rows = await measureAll();
    status.textContent = `${result.rows.length} 攻撃。単位は ms。差 = 立ち上がり 90% − 現在の impactDelay`;
    renderTable(app, result.rows);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    status.textContent = `測定に失敗: ${result.error}`;
  }
  window.__measure = result;
  document.body.dataset.measureDone = '1';
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) void main(app);

export {};
