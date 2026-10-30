// プレイヤーの楽器: Karplus-Strong の撥弦を JS で前計算する (docs/plan/v3-phase2.md「既定値の決め」の「楽器」「4 音」)。
// 曲の 3 声 (矩形・三角・ノイズ) と別の系統の音にして、プレイヤーの音と敵の曲を聞き分けられるようにする
// (docs/concept.md「曲と音の役割」)。
// DOM・Web Audio には触らない純粋関数。engine.ts が結果を AudioBuffer に入れて鳴らす。
// DelayNode の帰還は 1 量子 (128 サンプル) の最小遅延があり 375 Hz 以上が出ないので、前計算にしている。
// 前計算なら OfflineAudioContext でも同じ波形になり、measure.html で確かめられる。

export type PluckKind = 'on' | 'off' | 'miss' | 'cancel';

export interface PluckOptions {
  // 1 周期ごとの減衰係数 (0〜1)。小さいほど早く消える。周期あたりなので、低い音ほど同じ値でも長く残る。既定 0.99
  decay?: number;
  // 明るさ (0〜1)。ループ内の 1 極ローパスの通過率で、1 なら素の Karplus-Strong (2 点平均だけ)、
  // 小さいほど倍音が早く削れて鈍い音になる。既定 0.5
  // 2 点平均の重みにしなかったのは、重み w と 1−w の振幅特性が同じで明るさにならず、
  // 低い音 (110 Hz) では 2 点平均の高域の削れが周期あたりほぼ 0 で鈍くできないため
  brightness?: number;
  // 種ノイズの線形合同法の種。既定 12345 (engine.ts の getNoise と同じ)
  seed?: number;
}

export interface PluckSpec {
  hz: number;
  durSec: number;
  decay: number;
  brightness: number;
  // 鳴らすときの音量。曲の 3 声に埋もれず、うるさくない程度 (0.25〜0.35)
  gain: number;
}

const DEFAULT_DECAY = 0.99;
const DEFAULT_BRIGHTNESS = 0.5;
// brightness の下限。0 だとローパスが積分器になって音が止まる
const MIN_BRIGHTNESS = 0.05;
const DEFAULT_SEED = 12345;
// 末尾のフェードアウトの長さ。バッファの終わりで波形がぶつ切りになるクリックを避ける
const FADE_SEC = 0.01;
// 相殺の既定の音高 (C5)。呼ぶ側が midi を渡さなかったとき
const CANCEL_DEFAULT_MIDI = 72;

// 撥弦 1 音を durSec 秒ぶん描く。戻り値の最大振幅は 1 (無音なら 0)
// 最初の P サンプルを決め打ちのノイズで埋め、以後 y[n] = decay × lowpass(0.5 × (y[n−P] + y[n−P−1]))。
// lowpass は 1 極 (lp[n] = brightness × 入力 + (1 − brightness) × lp[n−1])。
// ループ 1 周の遅れは P + 0.5 (2 点平均) + k / (1 − k) (1 極、k = 1 − brightness) なので、
// 合計が sampleRate / hz に近づくよう P をその分だけ短くする (丸めだけだと 880 Hz で −30 セントほどずれる)
export function renderPluck(sampleRate: number, hz: number, durSec: number, opts: PluckOptions = {}): Float32Array {
  const decay = opts.decay ?? DEFAULT_DECAY;
  const brightness = Math.min(1, Math.max(MIN_BRIGHTNESS, opts.brightness ?? DEFAULT_BRIGHTNESS));
  const k = 1 - brightness;
  const len = Math.max(0, Math.round(durSec * sampleRate));
  const out = new Float32Array(len);
  if (len === 0) return out;

  const filterDelay = 0.5 + k / (1 - k);
  const period = Math.max(2, Math.round(sampleRate / hz - filterDelay));
  // 最初の 1 周期は決め打ちのノイズ (Math.random を避けて毎回同じ波形にする)。
  // 鈍い音の立ち上がりが生のノイズにならないよう、ここにも同じローパスを通す
  let seed = (opts.seed ?? DEFAULT_SEED) >>> 0;
  let lp = 0;
  for (let i = 0; i < Math.min(period, len); i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    lp = brightness * white + k * lp;
    out[i] = lp;
  }
  // 以後は 1 周期前の 2 点平均をローパスに通し、減衰を掛ける。範囲外 (n − P − 1 < 0) は 0 とみなす
  for (let n = period; n < len; n++) {
    const prev = n - period - 1 >= 0 ? out[n - period - 1] : 0;
    const avg = 0.5 * (out[n - period] + prev);
    lp = brightness * avg + k * lp;
    out[n] = decay * lp;
  }

  normalize(out);
  fadeOut(out, Math.min(len, Math.round(FADE_SEC * sampleRate)));
  return out;
}

// 4 音の音高・長さ・音色 (docs/plan/v3-phase2.md「既定値の決め」の「4 音」)。音高の規則は v2 のまま。
// decay は周期あたりなので、音の長さの終わりで基音が 1 割程度まで落ちる値を音高ごとに選んである
// (880 Hz 0.25 秒は 220 周期、110 Hz 0.35 秒は 38 周期しかない)。末尾でぶつ切りにならず自然に消える
export function pluckSpec(kind: PluckKind, midi?: number): PluckSpec {
  switch (kind) {
    case 'on':
      // 表: 高く短く
      return { hz: 880, durSec: 0.25, decay: 0.99, brightness: 0.5, gain: 0.3 };
    case 'off':
      // 裏: 1 オクターブ下
      return { hz: 440, durSec: 0.3, decay: 0.985, brightness: 0.5, gain: 0.3 };
    case 'miss':
      // 外: 低く鈍く。減衰を強め、倍音を早く削る
      return { hz: 110, durSec: 0.35, decay: 0.94, brightness: 0.3, gain: 0.3 };
    case 'cancel':
      // 相殺: 最も近いメロディ音の 1 オクターブ上を、明るく長く
      return { hz: midiToHz(midi ?? CANCEL_DEFAULT_MIDI), durSec: 0.5, decay: 0.993, brightness: 0.7, gain: 0.35 };
  }
}

// 音の口 (v4 T6): 既定の spec の上に呼ぶ側の上書きを重ねる。v4 では規則を変えないので上書きは空。
// v5 以降が音高 (hz) や長さ・明るさを渡すための口 (docs/plan/v4-phase1.md「目的」3)
export function resolvePluckSpec(kind: PluckKind, midi?: number, override: Partial<PluckSpec> = {}): PluckSpec {
  return { ...pluckSpec(kind, midi), ...override };
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

// 最大振幅を 1 にする (全て 0 なら何もしない)
function normalize(out: Float32Array): void {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max <= 0) return;
  for (let i = 0; i < out.length; i++) out[i] /= max;
}

// 末尾 fadeLen サンプルを線形に 0 へ落とす。最後のサンプルは 0 になる
function fadeOut(out: Float32Array, fadeLen: number): void {
  if (fadeLen <= 0) return;
  const start = out.length - fadeLen;
  for (let i = start; i < out.length; i++) out[i] *= (out.length - 1 - i) / fadeLen;
}
