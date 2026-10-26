// 音の立ち上がり時刻の測定 (docs/plan/v2-phase2.md T1)。合成器が描いた波形から、アンカー時刻 t0 の後で
// エネルギーが「立ち上がりきった」時刻を出す。純粋関数で DOM・Audio には触らない。
// 広帯域と低域 (lowpass 後) の両方で同じ計算をするのは、Phase 1 の仮説 H1 (広帯域) と H2 (低域) を並べて見るため。

// 測定の設定値。measure.html の表の上に出し、docs/decisions/v2-timing-standard.md にも書く。変えたら記録も直す
export const ONSET_SETTINGS = {
  // RMS の窓と刻み
  windowSec: 0.01,
  hopSec: 0.001,
  // 基準 (アンカー直前の静かさ) を取る区間: [t0 − baselineStartSec, t0 − baselineEndSec]
  baselineStartSec: 0.03,
  baselineEndSec: 0.005,
  // ピークを探す区間: [t0, t0 + peakSearchSec]
  peakSearchSec: 0.15,
  // 低域版のローパスの遮断周波数
  lowpassHz: 200,
  // 「立ち上がりきった」と見る割合と、途中経過として併記する割合
  riseRatio: 0.9,
  halfRatio: 0.5,
} as const;

// 10 ms の RMS を 1 ms 刻みで出す。env[k] は時刻 k × hopSec で終わる窓 [t − window, t] の RMS。
// 窓を後ろ向きに取るのは、時刻 t の値がその時点までに鳴った音だけで決まるようにするため
// (基準区間に t0 以後の音が混ざらない)。先頭で窓が波形の外に出る部分は無音として数える
export function energyEnvelope(
  samples: Float32Array,
  sampleRate: number,
  windowSec: number = ONSET_SETTINGS.windowSec,
  hopSec: number = ONSET_SETTINGS.hopSec,
): Float32Array {
  const win = Math.max(1, Math.round(windowSec * sampleRate));
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const n = samples.length;
  // 二乗の累積和。Float64 にして 20 秒分の足し込みでも精度を落とさない
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + samples[i] * samples[i];
  const count = Math.floor(n / hop) + 1;
  const env = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const end = Math.min(n, k * hop);
    const start = Math.max(0, end - win);
    env[k] = Math.sqrt((cum[end] - cum[start]) / win);
  }
  return env;
}

export interface RiseTimeOptions {
  baselineStartSec?: number;
  baselineEndSec?: number;
  peakSearchSec?: number;
  riseRatio?: number;
  halfRatio?: number;
}

export interface RiseTime {
  // 基準 + riseRatio × (ピーク − 基準) に初めて達する時刻 − t0 (ms)。ピークが基準と同じなら NaN
  rise90Ms: number;
  // 同じく halfRatio
  rise50Ms: number;
  baseline: number;
  peak: number;
}

// アンカー時刻 anchorSec について、基準 = 直前区間の平均、ピーク = 直後区間の最大、
// 立ち上がり = 基準から ratio の割合まで上がった最初の時刻、を出す
export function riseTime(env: Float32Array, hopSec: number, anchorSec: number, opts: RiseTimeOptions = {}): RiseTime {
  const o = { ...ONSET_SETTINGS, ...opts };
  const idx = (sec: number) => Math.round(sec / hopSec);
  const clamp = (k: number) => Math.min(env.length - 1, Math.max(0, k));
  const k0 = clamp(idx(anchorSec));

  const bStart = clamp(idx(anchorSec - o.baselineStartSec));
  const bEnd = clamp(idx(anchorSec - o.baselineEndSec));
  let sum = 0;
  for (let k = bStart; k <= bEnd; k++) sum += env[k];
  const baseline = sum / (bEnd - bStart + 1);

  const pEnd = clamp(idx(anchorSec + o.peakSearchSec));
  let peak = -Infinity;
  for (let k = k0; k <= pEnd; k++) peak = Math.max(peak, env[k]);

  if (!(peak > baseline)) return { rise90Ms: NaN, rise50Ms: NaN, baseline, peak };

  const firstReach = (ratio: number): number => {
    const threshold = baseline + ratio * (peak - baseline);
    for (let k = k0; k <= pEnd; k++) {
      if (env[k] >= threshold) return (k * hopSec - anchorSec) * 1000;
    }
    return NaN;
  };
  return { rise90Ms: firstReach(o.riseRatio), rise50Ms: firstReach(o.halfRatio), baseline, peak };
}

// 2 次バイカッドのローパス (Butterworth、Q = 1/√2)。係数は Audio EQ Cookbook (Robert Bristow-Johnson) の式。
// 低域 (キックが沈んでいく 200 Hz 以下) のエネルギーだけを見るための前処理
export function lowpass(samples: Float32Array, sampleRate: number, cutoffHz: number = ONSET_SETTINGS.lowpassHz): Float32Array {
  const q = Math.SQRT1_2;
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (1 - cosW0) / 2 / a0;
  const b1 = (1 - cosW0) / a0;
  const b2 = (1 - cosW0) / 2 / a0;
  const a1 = (-2 * cosW0) / a0;
  const a2 = (1 - alpha) / a0;

  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}
