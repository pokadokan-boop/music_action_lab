// 音作りのページ (v6 T8。docs/sound-format.md)。行動ごとの音を層のつまみで作り、鳴らし、曲の 1 小節と重ね、波形を見て、JSON で出し入れする。
// 「この音をゲームに使う」で localStorage に保存すると、ゲーム (index.html) が開始時に読んで使う。本人が作った JSON は assets/sound/v7.json に入れて公開する。
// 合成は src/audio/synth.ts (ゲームと同じ)。波形は OfflineAudioContext で同じ合成器を動かして描く
import { AudioEngine, DEFAULT_SOUND_BANK, midiToHz, type SfxKind } from './audio/engine';
import { chargeRange, pitchFor } from './audio/pitch';
import {
  LAYER_DEFAULTS,
  LAYER_TYPES,
  LAYER_TYPE_LABEL,
  MAX_LAYERS,
  NOISE_FILTERS,
  NUMERIC_PARAMS,
  PARAM_RANGES,
  SOUND_LABEL,
  SOUND_NAMES,
  WAVES,
  normalizeBank,
  sameBank,
  soundDuration,
  type LayerSpec,
  type SoundBank,
  type SoundName,
} from './audio/soundspec';
import { config } from './config';
import { loadSong, type LoadedSong } from './song';
import { loadSoundBank, saveSoundBank } from './ui/tuning';

const midiUrls = import.meta.glob<string>('../assets/midi/*.mid', { eager: true, query: '?url', import: 'default' });
const SONG = 'candidate-2';
const WAVE_SAMPLE_RATE = 48000;
const CHARGE_PREVIEW_SEC = 1.5;

// 音の名前 → 効果音の種類 (engine.scheduleSfx)。charge は持続音なので別
const SFX_OF: Record<Exclude<SoundName, 'charge'>, SfxKind> = {
  step: 'step',
  normalOn: 'on',
  normalOff: 'off',
  normalMiss: 'miss',
  riposte: 'riposte',
  release: 'release',
  double: 'double',
  cancel: 'cancel',
};

// 基音の既定 (案 1 コードの音、src/audio/pitch.ts)。器では数値で動かせる
function defaultBaseMidi(name: SoundName, grid: LoadedSong['grid'] | null): number {
  const g = grid ?? ({ phrases: [] } as unknown as LoadedSong['grid']);
  switch (name) {
    case 'step':
      return pitchFor('step', 'on', 0, g, 'chord');
    case 'normalOn':
      return pitchFor('attack', 'on', 0, g, 'chord');
    case 'normalOff':
      return pitchFor('attack', 'off', 0, g, 'chord');
    case 'normalMiss':
      return pitchFor('attack', 'miss', 0, g, 'chord');
    case 'riposte':
      return pitchFor('riposte', 'on', 0, g, 'chord');
    case 'release':
    case 'double':
      return pitchFor('release', 'on', 0, g, 'chord');
    case 'cancel':
      return 72;
    case 'charge':
      return chargeRange(0, g, 'chord').from;
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

interface State {
  bank: SoundBank;
  name: SoundName;
  baseMidi: Record<SoundName, number>;
  chargeProgress: number;
}

let engine: AudioEngine | null = null;
let loaded: LoadedSong | null = null;
let chargeStopTimer: number | null = null;

async function ensureEngine(): Promise<AudioEngine> {
  engine ??= new AudioEngine();
  await engine.resume();
  return engine;
}

async function ensureSong(): Promise<LoadedSong> {
  if (loaded) return loaded;
  const url = midiUrls[`../assets/midi/${SONG}.mid`];
  if (!url) throw new Error(`曲が見つかりません: ${SONG}`);
  loaded = await loadSong(url);
  return loaded;
}

// 曲の 1 小節目 (4 拍) だけの Song
function firstBar(song: LoadedSong): LoadedSong['song'] {
  const barSec = song.grid.beatSec * song.grid.beatsPerBar;
  return {
    duration: barSec,
    tracks: song.song.tracks.map((t) => ({ name: t.name, notes: t.notes.filter((n) => n.time < barSec) })),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

function main(app: HTMLElement): void {
  const saved = loadSoundBank(DEFAULT_SOUND_BANK);
  const state: State = {
    bank: saved ?? normalizeBank(DEFAULT_SOUND_BANK),
    name: 'release',
    baseMidi: Object.fromEntries(SOUND_NAMES.map((n) => [n, defaultBaseMidi(n, null)])) as Record<SoundName, number>,
    chargeProgress: 1,
  };
  app.innerHTML = '';
  app.append(el('h1', { textContent: '音作り (v6)' }));
  app.append(
    el('p', {
      className: 'muted',
      textContent:
        '行動ごとの音を層 (最大 4) で作る。鳴らして、曲の 1 小節と重ねて、波形を見て、JSON で出し入れする。「この音をゲームに使う」で保存すると、ゲームが次の開始から使う (要約の先頭行に「音色 自作」と出る)。作った JSON は不満ノートに貼るか vault に置けば、Claude が assets/sound/v7.json に入れて公開する。',
    }),
  );
  const status = el('p', { className: 'hint', textContent: saved ? '保存された自作の音を読み込んだ' : '既定の音 (assets/sound/v7.json)' });
  app.append(status);

  const names = el('div', { className: 'names' });
  const editor = el('div');
  const wave = el('canvas');
  const json = el('textarea', { spellcheck: false });
  app.append(el('h2', { textContent: '音' }), names, editor, el('h2', { textContent: '波形 (同じ合成器を OfflineAudioContext で描いたもの)' }), wave);
  app.append(el('h2', { textContent: 'JSON' }));
  const jsonButtons = el('div', { className: 'row' });
  app.append(jsonButtons, json);

  const setStatus = (t: string) => {
    status.textContent = t;
  };

  const renderNames = () => {
    names.innerHTML = '';
    for (const n of SOUND_NAMES) {
      const b = el('button', { textContent: SOUND_LABEL[n], className: n === state.name ? 'selected' : '' });
      b.onclick = () => {
        state.name = n;
        renderAll();
      };
      names.append(b);
    }
  };

  const spec = () => state.bank.sounds[state.name];

  const play = async (withBar: boolean) => {
    const eng = await ensureEngine();
    eng.setBank(state.bank);
    const midi = state.baseMidi[state.name];
    let at = eng.now() + 0.05;
    if (withBar) {
      const song = await ensureSong();
      const start = eng.start(firstBar(song), eng.now() + 0.1);
      // 3 拍目に鳴らす
      at = start + song.grid.beatSec * 2;
    }
    if (state.name === 'charge') {
      const riseSec = config.chargeFullBeats * (loaded?.grid.beatSec ?? 0.43);
      eng.startCharge(at, midi, midi + 12, riseSec, state.chargeProgress);
      if (chargeStopTimer !== null) window.clearTimeout(chargeStopTimer);
      chargeStopTimer = window.setTimeout(() => eng.stopCharge(eng.now()), (at - eng.now() + CHARGE_PREVIEW_SEC) * 1000);
    } else {
      eng.scheduleSfx(SFX_OF[state.name], at, midi, { hz: midiToHz(midi) });
    }
    setStatus(`${SOUND_LABEL[state.name]} を鳴らした (基音 ${noteName(midi)}、長さ ${soundDuration(spec()).toFixed(2)} 秒)`);
  };

  const drawWave = async () => {
    const midi = state.baseMidi[state.name];
    const dur = state.name === 'charge' ? CHARGE_PREVIEW_SEC + 0.2 : Math.max(0.2, soundDuration(spec()) + 0.1);
    const offline = new OfflineAudioContext(1, Math.ceil(WAVE_SAMPLE_RATE * dur), WAVE_SAMPLE_RATE);
    const eng = new AudioEngine(offline, state.bank);
    if (state.name === 'charge') {
      eng.startCharge(0, midi, midi + 12, config.chargeFullBeats * 0.43, state.chargeProgress);
      eng.stopCharge(CHARGE_PREVIEW_SEC);
    } else {
      eng.scheduleSfx(SFX_OF[state.name], 0, midi, { hz: midiToHz(midi) });
    }
    const buf = await offline.startRendering();
    const data = buf.getChannelData(0);
    const ctx = wave.getContext('2d')!;
    const w = (wave.width = wave.clientWidth * (window.devicePixelRatio || 1));
    const h = (wave.height = 120 * (window.devicePixelRatio || 1));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffe066';
    ctx.beginPath();
    let peak = 0;
    for (let x = 0; x < w; x++) {
      const from = Math.floor((x / w) * data.length);
      const to = Math.floor(((x + 1) / w) * data.length);
      let lo = 0;
      let hi = 0;
      for (let i = from; i < to; i++) {
        lo = Math.min(lo, data[i]);
        hi = Math.max(hi, data[i]);
      }
      peak = Math.max(peak, -lo, hi);
      ctx.moveTo(x, h / 2 - hi * (h / 2));
      ctx.lineTo(x, h / 2 - lo * (h / 2) + 1);
    }
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = `${12 * (window.devicePixelRatio || 1)}px sans-serif`;
    ctx.fillText(`${dur.toFixed(2)} 秒、最大振幅 ${peak.toFixed(2)} (マスター 0.5 込み)`, 8, 16 * (window.devicePixelRatio || 1));
  };

  const renderEditor = () => {
    editor.innerHTML = '';
    const s = spec();
    const midi = state.baseMidi[state.name];
    const midiInput = el('input', { type: 'number', min: '24', max: '96', step: '1', value: String(midi) });
    midiInput.onchange = () => {
      state.baseMidi[state.name] = Math.max(24, Math.min(96, Number(midiInput.value) || midi));
      renderEditor();
    };
    const head = el('div', { className: 'row' }, el('span', { textContent: `基音 (MIDI)` }), midiInput, el('span', { className: 'muted', textContent: `${noteName(midi)} ${midiToHz(midi).toFixed(1)} Hz。ゲームでは音高の案と拍の分類で決まる` }));
    editor.append(head);
    if (state.name === 'charge') {
      const prog = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.chargeProgress) });
      const val = el('span', { className: 'val', textContent: state.chargeProgress.toFixed(2) });
      prog.oninput = () => {
        state.chargeProgress = Number(prog.value);
        val.textContent = state.chargeProgress.toFixed(2);
      };
      editor.append(el('div', { className: 'param' }, el('label', { textContent: '溜めの進み具合 (0 = 溜め始め、1 = 上がり切り)' }), prog, val));
      editor.append(el('p', { className: 'muted', textContent: '持続音は 1 オクターブ上がって保つ。層の音量は「溜め始めの音量」から「音量」へ同じ時間で変わる。鳴らすと 1.5 秒で止まる' }));
    }
    const buttons = el('div', { className: 'row' });
    const b1 = el('button', { textContent: '鳴らす' });
    b1.onclick = () => void play(false);
    const b2 = el('button', { textContent: '曲の 1 小節と重ねる (3 拍目に鳴る)' });
    b2.onclick = () => void play(true);
    const b3 = el('button', { textContent: '波形を描く', className: 'sub' });
    b3.onclick = () => void drawWave();
    buttons.append(b1, b2, b3);
    editor.append(buttons);

    s.layers.forEach((layer, i) => editor.append(layerCard(layer, i)));
    if (s.layers.length < MAX_LAYERS) {
      const add = el('button', { textContent: '層を足す', className: 'sub' });
      add.onclick = () => {
        s.layers.push({ ...LAYER_DEFAULTS, gain: 0.2 });
        renderEditor();
      };
      editor.append(add);
    }
  };

  const layerCard = (layer: LayerSpec, i: number): HTMLElement => {
    const card = el('div', { className: 'layer' });
    const type = el('select');
    for (const t of LAYER_TYPES) type.append(el('option', { value: t, textContent: LAYER_TYPE_LABEL[t], selected: t === layer.type }));
    type.onchange = () => {
      layer.type = type.value as LayerSpec['type'];
      renderEditor();
    };
    const head = el('div', { className: 'head' }, el('span', { textContent: `層 ${i + 1}` }), type);
    if (layer.type === 'osc' || layer.type === 'fm') {
      const wave = el('select');
      for (const w of WAVES) wave.append(el('option', { value: w, textContent: w, selected: w === layer.wave }));
      wave.onchange = () => {
        layer.wave = wave.value as LayerSpec['wave'];
      };
      head.append(el('span', { className: 'muted', textContent: layer.type === 'fm' ? '搬送波' : '波形' }), wave);
    }
    if (layer.type === 'noise') {
      const nf = el('select');
      for (const f of NOISE_FILTERS) nf.append(el('option', { value: f, textContent: f, selected: f === layer.noiseFilter }));
      nf.onchange = () => {
        layer.noiseFilter = nf.value as LayerSpec['noiseFilter'];
      };
      head.append(el('span', { className: 'muted', textContent: 'フィルタ' }), nf);
    }
    const remove = el('button', { textContent: '消す', className: 'danger' });
    remove.onclick = () => {
      spec().layers.splice(i, 1);
      renderEditor();
    };
    head.append(remove);
    card.append(head);
    for (const key of NUMERIC_PARAMS) {
      const r = PARAM_RANGES[key];
      if (r.types && !r.types.includes(layer.type)) continue;
      if (key === 'gainAtStart' && state.name !== 'charge') continue;
      if ((key === 'hold' || key === 'decay' || key === 'sweepFrom' || key === 'sweepSec') && state.name === 'charge') continue;
      if ((key === 'attack' || key === 'hold') && layer.type === 'pluck') continue;
      const input = el('input', { type: 'range', min: String(r.min), max: String(r.max), step: String(r.step), value: String(layer[key]) });
      const val = el('span', { className: 'val', textContent: String(layer[key]) });
      input.oninput = () => {
        layer[key] = Number(input.value);
        val.textContent = String(layer[key]);
      };
      const label = key === 'decay' && layer.type === 'pluck' ? '長さ (秒)' : r.label;
      card.append(el('div', { className: 'param' }, el('label', { textContent: label }), input, val));
    }
    return card;
  };

  const renderJsonButtons = () => {
    jsonButtons.innerHTML = '';
    const out = el('button', { textContent: 'JSON を書き出す', className: 'sub' });
    out.onclick = () => {
      json.value = JSON.stringify(state.bank, null, 2);
      setStatus('JSON を書き出した。全部選んでコピーし、不満ノートに貼るか vault に置く');
    };
    const copy = el('button', { textContent: 'コピー', className: 'sub' });
    copy.onclick = () => {
      json.value = JSON.stringify(state.bank, null, 2);
      void navigator.clipboard?.writeText(json.value).then(
        () => setStatus('クリップボードにコピーした'),
        () => setStatus('コピーできなかった。テキストを選んでコピーしてください'),
      );
    };
    const load = el('button', { textContent: 'JSON を読み込む', className: 'sub' });
    load.onclick = () => {
      try {
        const parsed: unknown = JSON.parse(json.value);
        state.bank = normalizeBank(parsed, state.bank);
        setStatus('JSON を読み込んだ (範囲外の値は端に、知らない項目は捨てた)');
        renderAll();
      } catch (e) {
        setStatus(`JSON が読めない: ${(e as Error).message}`);
      }
    };
    const use = el('button', { textContent: 'この音をゲームに使う (保存)' });
    use.onclick = () => {
      saveSoundBank(state.bank);
      setStatus('保存した。ゲームの次の開始から使われる (要約の先頭行に「音色 自作」)');
    };
    const reset = el('button', { textContent: '既定に戻す (保存も消す)', className: 'danger' });
    reset.onclick = () => {
      state.bank = normalizeBank(DEFAULT_SOUND_BANK);
      saveSoundBank(null);
      setStatus('既定の音に戻し、保存を消した');
      renderAll();
    };
    jsonButtons.append(out, copy, load, use, reset);
    const same = sameBank(state.bank, DEFAULT_SOUND_BANK);
    jsonButtons.append(el('span', { className: 'muted', textContent: same ? '(今は既定と同じ)' : '(既定から変えてある)' }));
  };

  const renderAll = () => {
    renderNames();
    renderEditor();
    renderJsonButtons();
    json.value = JSON.stringify(state.bank, null, 2);
  };
  renderAll();
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) main(app);

export {};
