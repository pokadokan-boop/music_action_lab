// 音の仕様 (soundspec.ts) の正規化と既定の音 (assets/sound/v6.json) を確かめる。鳴らす側 (synth.ts) は Web Audio が要るので node では見ない
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAYER_DEFAULTS,
  MAX_LAYERS,
  PARAM_RANGES,
  SOUND_NAMES,
  layerHz,
  normalizeBank,
  normalizeLayer,
  normalizeSound,
  sameBank,
  soundDuration,
} from './soundspec';

const root = resolve(__dirname, '..', '..');
const raw: unknown = JSON.parse(readFileSync(resolve(root, 'assets', 'sound', 'v6.json'), 'utf8'));

describe('normalizeLayer', () => {
  it('無い項目は既定値、範囲外は端に、知らない項目は捨てる、知らない種類は既定の種類', () => {
    const l = normalizeLayer({ type: 'noise', gain: 5, semitones: -100, unknown: 1, wave: 'saw' });
    expect(l.type).toBe('noise');
    expect(l.gain).toBe(PARAM_RANGES.gain.max);
    expect(l.semitones).toBe(PARAM_RANGES.semitones.min);
    expect(l.wave).toBe(LAYER_DEFAULTS.wave);
    expect(l.attack).toBe(LAYER_DEFAULTS.attack);
    expect('unknown' in l).toBe(false);
    expect(normalizeLayer({ type: 'bell' }).type).toBe(LAYER_DEFAULTS.type);
    expect(normalizeLayer(null)).toEqual(LAYER_DEFAULTS);
  });
});

describe('normalizeSound / normalizeBank', () => {
  it('層は 4 つまで。層が無ければ fallback の層、fallback も無ければ空', () => {
    const many = normalizeSound({ layers: [{}, {}, {}, {}, {}, {}] });
    expect(many.layers).toHaveLength(MAX_LAYERS);
    const fb = { layers: [{ ...LAYER_DEFAULTS, gain: 0.1 }] };
    expect(normalizeSound({}, fb).layers[0].gain).toBe(0.1);
    expect(normalizeSound({}).layers).toEqual([]);
  });

  it('全ての音の名前を持ち、無い音は fallback から埋まる', () => {
    const fallback = normalizeBank(raw);
    const partial = normalizeBank({ sounds: { release: { layers: [{ type: 'osc', gain: 0.9 }] } } }, fallback);
    expect(Object.keys(partial.sounds).sort()).toEqual([...SOUND_NAMES].sort());
    expect(partial.sounds.release.layers[0].gain).toBe(0.9);
    expect(partial.sounds.step).toEqual(fallback.sounds.step);
    expect(partial.version).toBe(1);
  });
});

describe('既定の音 assets/sound/v6.json', () => {
  const bank = normalizeBank(raw);

  it('9 つの音が全て層を持ち、正規化しても値が変わらない (範囲内の値で書いてある)', () => {
    for (const name of SOUND_NAMES) expect(bank.sounds[name].layers.length, name).toBeGreaterThan(0);
    expect(sameBank(bank, normalizeBank(bank))).toBe(true);
  });

  it('通常・ステップ・返し・相殺は v5 の撥弦の値 (長さ・減衰・明るさ・音量) を 1 層で保つ', () => {
    expect(bank.sounds.normalOn.layers[0]).toMatchObject({ type: 'pluck', decay: 0.25, pluckDecay: 0.99, pluckBrightness: 0.5, gain: 0.3 });
    expect(bank.sounds.normalOff.layers[0]).toMatchObject({ type: 'pluck', decay: 0.3, pluckDecay: 0.985 });
    expect(bank.sounds.normalMiss.layers[0]).toMatchObject({ type: 'pluck', decay: 0.35, pluckDecay: 0.94, pluckBrightness: 0.3 });
    expect(bank.sounds.step.layers[0]).toMatchObject({ type: 'pluck', decay: 0.08, pluckDecay: 0.9, pluckBrightness: 0.25, gain: 0.25 });
    expect(bank.sounds.riposte.layers[0]).toMatchObject({ type: 'pluck', decay: 0.15, pluckBrightness: 0.8 });
    expect(bank.sounds.cancel.layers[0]).toMatchObject({ type: 'pluck', decay: 0.5, pluckDecay: 0.993, pluckBrightness: 0.7, gain: 0.35 });
  });

  it('放ちと両手放ちは本人の言葉のとおり: 歪んだ鋸歯 + 中音域 (約 800 Hz) の下がるレーザー風 + 低い「ドン」+ 高い「スカン」で、長さは 0.4 秒以内', () => {
    for (const name of ['release', 'double'] as const) {
      const s = bank.sounds[name];
      expect(s.layers).toHaveLength(4);
      expect(s.layers[0]).toMatchObject({ type: 'osc', wave: 'sawtooth' });
      expect(s.layers[0].drive).toBeGreaterThan(0.5);
      // 基音 F3 (53 = 174.6 Hz) の +27 半音 ≈ 830 Hz。下へ滑る
      expect(layerHz(174.61, s.layers[1])).toBeGreaterThan(700);
      expect(layerHz(174.61, s.layers[1])).toBeLessThan(950);
      expect(s.layers[1].sweepFrom).toBeGreaterThan(1);
      expect(s.layers[2].semitones).toBe(-12);
      expect(s.layers[3].type).toBe('noise');
      expect(soundDuration(s)).toBeLessThanOrEqual(0.5);
    }
    // 両手放ちは放ちより厚い (音量と歪みが大きい)
    expect(bank.sounds.double.layers[0].gain).toBeGreaterThan(bank.sounds.release.layers[0].gain);
    expect(bank.sounds.double.layers[0].drive).toBeGreaterThan(bank.sounds.release.layers[0].drive);
  });

  it('溜めの持続音は鋸歯 + ローパスに、溜めが進むと低い FM の層が 0 から足される', () => {
    const c = bank.sounds.charge;
    expect(c.layers[0]).toMatchObject({ type: 'osc', wave: 'sawtooth', lowpass: 1200, gain: 0.08, gainAtStart: 0.08 });
    expect(c.layers[1]).toMatchObject({ type: 'fm', semitones: -12, gainAtStart: 0 });
    expect(c.layers[1].gain).toBeGreaterThan(0);
    expect(c.layers[1].fmRatio).not.toBe(1); // 整数比でない = 耳障りな響き
  });
});
