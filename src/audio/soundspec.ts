// プレイヤーの音の仕様 (v6 T7。docs/sound-format.md)。行動ごとに最大 4 層 (osc / fm / noise / pluck) を重ねる。
// このファイルは純粋 (DOM・Web Audio に触らない): 型、既定値、範囲、正規化、長さ。鳴らすのは synth.ts、器は sound.html (src/sound.ts)。
// 本人が音作りのページで値を作り、JSON を assets/sound/v6.json に入れる (docs/plan/v6-phase1.md「音」)

// 音の名前。normal は拍の分類 (表 / 裏 / 外) で 3 つ。double = 両手放ち。charge は持続音 (溜め中)
export type SoundName = 'step' | 'normalOn' | 'normalOff' | 'normalMiss' | 'riposte' | 'release' | 'double' | 'cancel' | 'charge';
export const SOUND_NAMES: readonly SoundName[] = ['step', 'normalOn', 'normalOff', 'normalMiss', 'riposte', 'release', 'double', 'cancel', 'charge'];
export const SOUND_LABEL: Record<SoundName, string> = {
  step: 'ステップ',
  normalOn: '通常 (表)',
  normalOff: '通常 (裏)',
  normalMiss: '通常 (外)',
  riposte: '返し',
  release: '放ち',
  double: '両手放ち',
  cancel: '相殺',
  charge: '溜め (持続音)',
};

export type LayerType = 'osc' | 'fm' | 'noise' | 'pluck';
export const LAYER_TYPES: readonly LayerType[] = ['osc', 'fm', 'noise', 'pluck'];
export const LAYER_TYPE_LABEL: Record<LayerType, string> = { osc: '波形', fm: 'FM', noise: 'ノイズ', pluck: '撥弦' };
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';
export const WAVES: readonly Wave[] = ['sine', 'square', 'sawtooth', 'triangle'];
export type NoiseFilter = 'lowpass' | 'highpass' | 'bandpass';
export const NOISE_FILTERS: readonly NoiseFilter[] = ['lowpass', 'highpass', 'bandpass'];

// 1 層。数値は全て PARAM_RANGES の範囲に収める。音高は基音 (行動と拍の分類と音高の案で決まる) からの半音差
export interface LayerSpec {
  type: LayerType;
  // 音量 (最大振幅)。持続音 (charge) では溜めが上がり切ったときの音量
  gain: number;
  // 基音からの半音差 (osc / fm / pluck)
  semitones: number;
  // 波形 (osc と fm の搬送波)
  wave: Wave;
  // 包絡 (秒): 立ち上がり → 保持 → 減衰。持続音では attack だけ使う
  attack: number;
  hold: number;
  decay: number;
  // 音高の滑り: 鳴り始めの音高を基音の sweepFrom 倍にし、sweepSec で基音へ (1 なら滑らない)
  sweepFrom: number;
  sweepSec: number;
  // ローパス (Hz)。20000 なら無し
  lowpass: number;
  // 歪み (0〜1)。0 なら無し
  drive: number;
  // fm: 変調波の周波数比と深さ (搬送波の周波数の何倍まで揺らすか)
  fmRatio: number;
  fmIndex: number;
  // noise: フィルタの種類と周波数
  noiseFilter: NoiseFilter;
  noiseHz: number;
  // pluck: 1 周期ごとの減衰と明るさ (src/audio/pluck.ts)
  pluckDecay: number;
  pluckBrightness: number;
  // 持続音 (charge) だけ: 溜め始めの音量。溜めが上がり切るまでに gain へ (進むほど層が足されていく音にする)
  gainAtStart: number;
}

export interface SoundSpec {
  layers: LayerSpec[];
}

export interface SoundBank {
  version: 1;
  sounds: Record<SoundName, SoundSpec>;
}

export const MAX_LAYERS = 4;

export const LAYER_DEFAULTS: LayerSpec = {
  type: 'osc',
  gain: 0.3,
  semitones: 0,
  wave: 'sawtooth',
  attack: 0.005,
  hold: 0.05,
  decay: 0.2,
  sweepFrom: 1,
  sweepSec: 0.1,
  lowpass: 20000,
  drive: 0,
  fmRatio: 1.41,
  fmIndex: 2,
  noiseFilter: 'highpass',
  noiseHz: 3000,
  pluckDecay: 0.99,
  pluckBrightness: 0.5,
  gainAtStart: 0,
};

export type NumericParam = {
  [K in keyof LayerSpec]: LayerSpec[K] extends number ? K : never;
}[keyof LayerSpec];

export interface ParamRange {
  min: number;
  max: number;
  step: number;
  label: string;
  // どの層の種類で意味を持つか (器がつまみを出し分ける)。省略は全部
  types?: readonly LayerType[];
}

export const PARAM_RANGES: Record<NumericParam, ParamRange> = {
  gain: { min: 0, max: 1, step: 0.01, label: '音量' },
  semitones: { min: -36, max: 36, step: 1, label: '半音差', types: ['osc', 'fm', 'pluck'] },
  attack: { min: 0, max: 0.5, step: 0.001, label: '立ち上がり (秒)' },
  hold: { min: 0, max: 1, step: 0.005, label: '保持 (秒)' },
  decay: { min: 0.005, max: 2, step: 0.005, label: '減衰 (秒)' },
  sweepFrom: { min: 0.25, max: 4, step: 0.05, label: '滑りの始まり (倍)', types: ['osc', 'fm'] },
  sweepSec: { min: 0.01, max: 1, step: 0.01, label: '滑りの長さ (秒)', types: ['osc', 'fm'] },
  lowpass: { min: 100, max: 20000, step: 50, label: 'ローパス (Hz)', types: ['osc', 'fm', 'pluck'] },
  drive: { min: 0, max: 1, step: 0.01, label: '歪み', types: ['osc', 'fm', 'noise'] },
  fmRatio: { min: 0.25, max: 8, step: 0.01, label: 'FM 比', types: ['fm'] },
  fmIndex: { min: 0, max: 10, step: 0.1, label: 'FM 深さ', types: ['fm'] },
  noiseHz: { min: 100, max: 12000, step: 50, label: 'ノイズのフィルタ (Hz)', types: ['noise'] },
  pluckDecay: { min: 0.8, max: 0.999, step: 0.001, label: '撥弦の減衰 (周期ごと)', types: ['pluck'] },
  pluckBrightness: { min: 0.05, max: 1, step: 0.01, label: '撥弦の明るさ', types: ['pluck'] },
  gainAtStart: { min: 0, max: 1, step: 0.01, label: '溜め始めの音量' },
};

export const NUMERIC_PARAMS = Object.keys(PARAM_RANGES) as NumericParam[];

function clampNum(v: unknown, range: ParamRange, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(range.max, Math.max(range.min, v));
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

// 1 層を既定値で埋め、範囲に収める。知らない項目は捨てる
export function normalizeLayer(raw: unknown): LayerSpec {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const out: LayerSpec = { ...LAYER_DEFAULTS };
  out.type = pick(r.type, LAYER_TYPES, LAYER_DEFAULTS.type);
  out.wave = pick(r.wave, WAVES, LAYER_DEFAULTS.wave);
  out.noiseFilter = pick(r.noiseFilter, NOISE_FILTERS, LAYER_DEFAULTS.noiseFilter);
  for (const key of NUMERIC_PARAMS) out[key] = clampNum(r[key], PARAM_RANGES[key], LAYER_DEFAULTS[key]);
  return out;
}

// 1 音を正規化。層は MAX_LAYERS まで。層が無ければ fallback の層 (fallback も無ければ空 = 鳴らない)
export function normalizeSound(raw: unknown, fallback?: SoundSpec): SoundSpec {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const layers = Array.isArray(r.layers) ? r.layers.slice(0, MAX_LAYERS).map(normalizeLayer) : (fallback?.layers.map((l) => ({ ...l })) ?? []);
  return { layers };
}

// 音の集まりを正規化。無い音は fallback から。fallback が無い音は空
export function normalizeBank(raw: unknown, fallback?: SoundBank): SoundBank {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const sounds = (typeof r.sounds === 'object' && r.sounds !== null ? r.sounds : {}) as Record<string, unknown>;
  const out = {} as Record<SoundName, SoundSpec>;
  for (const name of SOUND_NAMES) out[name] = normalizeSound(sounds[name], fallback?.sounds[name]);
  return { version: 1, sounds: out };
}

// 音の長さ (秒): 層の包絡の最長。持続音には使わない
export function soundDuration(spec: SoundSpec): number {
  return spec.layers.reduce((m, l) => Math.max(m, l.attack + l.hold + l.decay), 0);
}

// 層の音高 (Hz)
export function layerHz(baseHz: number, layer: LayerSpec): number {
  return baseHz * 2 ** (layer.semitones / 12);
}

// 2 つの音の集まりが同じ値か (器の「既定に戻す」の判定と、保存の有無に使う)
export function sameBank(a: SoundBank, b: SoundBank): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
