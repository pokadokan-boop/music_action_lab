// 音の仕様 (soundspec.ts) を Web Audio で鳴らす (v6 T7)。BaseAudioContext を受けるので、ゲーム (AudioContext) と
// 音作りのページの波形描画・測定 (OfflineAudioContext) で同じ節 (ノード) の組み方になり、同じ波形が出る。
// 乱数は使わない (ノイズは決め打ちの線形合同法、撥弦は pluck.ts の前計算)。
import { renderPluck } from './pluck';
import { layerHz, soundDuration, type LayerSpec, type SoundSpec } from './soundspec';

const NOISE_SEC = 1;
const NOISE_SEED = 12345;
const STOP_MARGIN_SEC = 0.02;
// 持続音を止めるときのフェード (engine.ts の CHARGE_FADE_SEC と同じ値)
export const SUSTAIN_FADE_SEC = 0.04;

// 文脈ごとの前計算 (ノイズのバッファ、撥弦のバッファ、歪みの曲線)。OfflineAudioContext でも同じ中身になる
const caches = new WeakMap<BaseAudioContext, SynthCache>();

interface SynthCache {
  noise: AudioBuffer | null;
  plucks: Map<string, AudioBuffer>;
  curves: Map<number, Float32Array<ArrayBuffer>>;
}

function cacheFor(ctx: BaseAudioContext): SynthCache {
  let c = caches.get(ctx);
  if (!c) {
    c = { noise: null, plucks: new Map(), curves: new Map() };
    caches.set(ctx, c);
  }
  return c;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const c = cacheFor(ctx);
  if (c.noise) return c.noise;
  const len = Math.floor(ctx.sampleRate * NOISE_SEC);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = NOISE_SEED;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  c.noise = buf;
  return buf;
}

function pluckBuffer(ctx: BaseAudioContext, hz: number, durSec: number, layer: LayerSpec): AudioBuffer {
  const c = cacheFor(ctx);
  const key = `${hz}:${durSec}:${layer.pluckDecay}:${layer.pluckBrightness}:${ctx.sampleRate}`;
  const cached = c.plucks.get(key);
  if (cached) return cached;
  const samples = renderPluck(ctx.sampleRate, hz, durSec, { decay: layer.pluckDecay, brightness: layer.pluckBrightness });
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  c.plucks.set(key, buf);
  return buf;
}

// 歪みの曲線: tanh(k x) を正規化。drive 0〜1 で k = 1〜21
function driveCurve(ctx: BaseAudioContext, drive: number): Float32Array<ArrayBuffer> {
  const c = cacheFor(ctx);
  const k = 1 + drive * 20;
  const cached = c.curves.get(k);
  if (cached) return cached;
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  c.curves.set(k, curve);
  return curve;
}

// 層の音源を作る。戻り値は始点のノードと、止めるべき音源の列
function makeSource(ctx: BaseAudioContext, layer: LayerSpec, hz: number, at: number, durSec: number): { node: AudioNode; sources: AudioScheduledSourceNode[] } {
  switch (layer.type) {
    case 'osc': {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      applySweep(osc.frequency, hz, layer, at);
      return { node: osc, sources: [osc] };
    }
    case 'fm': {
      const carrier = ctx.createOscillator();
      carrier.type = layer.wave;
      applySweep(carrier.frequency, hz, layer, at);
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = hz * layer.fmRatio;
      const depth = ctx.createGain();
      depth.gain.value = hz * layer.fmIndex;
      mod.connect(depth).connect(carrier.frequency);
      return { node: carrier, sources: [carrier, mod] };
    }
    case 'noise': {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = layer.noiseFilter;
      f.frequency.value = layer.noiseHz;
      src.connect(f);
      return { node: f, sources: [src] };
    }
    case 'pluck': {
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(ctx, hz, Math.max(0.02, durSec), layer);
      return { node: src, sources: [src] };
    }
  }
}

// 音高の滑り: 鳴り始めを hz × sweepFrom にして sweepSec で hz へ
function applySweep(param: AudioParam, hz: number, layer: LayerSpec, at: number): void {
  if (layer.sweepFrom === 1) {
    param.setValueAtTime(hz, at);
    return;
  }
  param.setValueAtTime(hz * layer.sweepFrom, at);
  param.exponentialRampToValueAtTime(hz, at + layer.sweepSec);
}

// 層の後段 (歪み → ローパス)。始点に繋いで終点を返す
function shapeChain(ctx: BaseAudioContext, node: AudioNode, layer: LayerSpec): AudioNode {
  let cur = node;
  if (layer.drive > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(ctx, layer.drive);
    cur.connect(ws);
    cur = ws;
  }
  if (layer.lowpass < 20000) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = layer.lowpass;
    cur.connect(f);
    cur = f;
  }
  return cur;
}

// 1 音を atSec から鳴らす。baseHz は基音。戻り値は鳴り終わる時刻と、止めるための音源
export function playSound(ctx: BaseAudioContext, dest: AudioNode, spec: SoundSpec, baseHz: number, atSec: number): { endSec: number; sources: AudioScheduledSourceNode[] } {
  const sources: AudioScheduledSourceNode[] = [];
  const total = soundDuration(spec);
  for (const layer of spec.layers) {
    if (layer.gain <= 0) continue;
    const dur = layer.attack + layer.hold + layer.decay;
    const hz = layerHz(baseHz, layer);
    const { node, sources: s } = makeSource(ctx, layer, hz, atSec, dur);
    const tail = shapeChain(ctx, node, layer);
    const g = ctx.createGain();
    // 包絡: 撥弦は波形自体が減衰するので音量だけ。他は 立ち上がり → 保持 → 指数の減衰
    if (layer.type === 'pluck') {
      g.gain.setValueAtTime(layer.gain, atSec);
    } else {
      g.gain.setValueAtTime(0, atSec);
      g.gain.linearRampToValueAtTime(layer.gain, atSec + Math.max(0.0005, layer.attack));
      g.gain.setValueAtTime(layer.gain, atSec + layer.attack + layer.hold);
      g.gain.exponentialRampToValueAtTime(0.001, atSec + dur);
      g.gain.setValueAtTime(0, atSec + dur + 0.001);
    }
    tail.connect(g).connect(dest);
    for (const src of s) {
      src.start(atSec);
      src.stop(atSec + dur + STOP_MARGIN_SEC);
      sources.push(src);
    }
  }
  return { endSec: atSec + total, sources };
}

export interface Sustained {
  // atSec でフェードして止める
  stop(atSec: number): void;
  sources: AudioScheduledSourceNode[];
}

// 持続音 (溜め) を atSec から鳴らす。音高は fromHz から toHz へ riseSec で上がり以後保つ。層の音量は gainAtStart から gain へ同じ時間で。
// progress (0〜1) を渡すと、その分だけ進んだ状態から始める (音作りのページで途中の音を聴くため)
export function startSustained(ctx: BaseAudioContext, dest: AudioNode, spec: SoundSpec, fromHz: number, toHz: number, riseSec: number, atSec: number, progress = 0): Sustained {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];
  const rise = Math.max(0.05, riseSec * (1 - progress));
  const startHz = fromHz * (toHz / fromHz) ** progress;
  for (const layer of spec.layers) {
    const hz0 = layerHz(startHz, layer);
    const hz1 = layerHz(toHz, layer);
    const { node, sources: s } = makeSource(ctx, { ...layer, sweepFrom: 1 }, hz0, atSec, 1);
    // 音高の上がり (osc / fm の搬送波)。noise と pluck は音高を持たない (pluck の持続音は 1 秒で切れる)
    const osc = s[0] instanceof OscillatorNode ? s[0] : null;
    if (osc) {
      osc.frequency.setValueAtTime(hz0, atSec);
      osc.frequency.exponentialRampToValueAtTime(hz1, atSec + rise);
    }
    const tail = shapeChain(ctx, node, layer);
    const g = ctx.createGain();
    const g0 = layer.gainAtStart + (layer.gain - layer.gainAtStart) * progress;
    g.gain.setValueAtTime(0, atSec);
    g.gain.linearRampToValueAtTime(g0, atSec + Math.max(0.005, layer.attack));
    g.gain.linearRampToValueAtTime(layer.gain, atSec + Math.max(layer.attack, rise));
    tail.connect(g).connect(dest);
    for (const src of s) {
      src.start(atSec);
      sources.push(src);
    }
    gains.push(g);
  }
  return {
    sources,
    stop(stopAt: number) {
      for (const g of gains) {
        g.gain.cancelScheduledValues(stopAt);
        g.gain.setValueAtTime(g.gain.value, stopAt);
        g.gain.linearRampToValueAtTime(0, stopAt + SUSTAIN_FADE_SEC);
      }
      for (const src of sources) {
        try {
          src.stop(stopAt + SUSTAIN_FADE_SEC + 0.01);
        } catch {
          // 既に止まっている
        }
      }
    },
  };
}
