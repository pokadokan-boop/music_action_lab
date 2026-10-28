// 撥弦の前計算 (pluck.ts) を波形の性質で確かめる
import { describe, expect, it } from 'vitest';
import { midiToHz, pluckSpec, renderPluck } from './pluck';

const SR = 48000;

function maxAbs(samples: Float32Array, from = 0, to = samples.length): number {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

function energy(samples: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return sum;
}

// 自己相関が最大になる遅れ (lo〜hi サンプルの範囲で探す)
function peakLag(samples: Float32Array, lo: number, hi: number): number {
  let best = lo;
  let bestVal = -Infinity;
  for (let lag = lo; lag <= hi; lag++) {
    let sum = 0;
    for (let i = lag; i < samples.length; i++) sum += samples[i] * samples[i - lag];
    if (sum > bestVal) {
      bestVal = sum;
      best = lag;
    }
  }
  return best;
}

describe('renderPluck', () => {
  it('長さは durSec × sampleRate、最大振幅は 1 以下で、最初の 1 周期に音がある', () => {
    const out = renderPluck(SR, 440, 0.3);
    expect(out.length).toBe(Math.round(0.3 * SR));
    expect(maxAbs(out)).toBeLessThanOrEqual(1);
    expect(maxAbs(out)).toBeGreaterThan(0.99);
    const period = Math.round(SR / 440);
    expect(maxAbs(out, 0, period)).toBeGreaterThan(0.5);
  });

  it('同じ引数なら同じ配列 (決定性)', () => {
    const a = renderPluck(SR, 880, 0.25, { decay: 0.996, brightness: 0.5 });
    const b = renderPluck(SR, 880, 0.25, { decay: 0.996, brightness: 0.5 });
    expect(Array.from(a)).toEqual(Array.from(b));
    // 種を変えると別の波形
    const c = renderPluck(SR, 880, 0.25, { seed: 999 });
    expect(Array.from(c)).not.toEqual(Array.from(a));
  });

  it('自己相関のピークが周期 P 付近 (±2 サンプル) に出る (440 Hz、48 kHz で P = 109)', () => {
    const out = renderPluck(SR, 440, 0.3);
    const period = Math.round(SR / 440);
    expect(period).toBe(109);
    // 最初のノイズ 1 周期は除き、2P 未満の範囲で探す
    const body = out.subarray(period);
    const lag = peakLag(body, Math.floor(period / 2), 2 * period - 1);
    expect(Math.abs(lag - period)).toBeLessThanOrEqual(2);
  });

  it('末尾 10 ms が線形にフェードアウトし、最後のサンプルは 0', () => {
    const out = renderPluck(SR, 440, 0.3, { decay: 0.9999 });
    const fadeLen = Math.round(0.01 * SR);
    expect(out[out.length - 1]).toBe(0);
    // フェード区間の振幅の最大は、その直前の同じ長さの区間より小さい
    const tail = maxAbs(out, out.length - fadeLen, out.length);
    const before = maxAbs(out, out.length - 2 * fadeLen, out.length - fadeLen);
    expect(tail).toBeLessThan(before);
    // フェードの中ほどは、元の振幅の半分程度以下
    const mid = out.length - 1 - Math.floor(fadeLen / 2);
    expect(Math.abs(out[mid])).toBeLessThanOrEqual(before * 0.55);
  });

  it('decay が小さいほど後半のエネルギーが小さい', () => {
    const slow = renderPluck(SR, 440, 0.3, { decay: 0.998 });
    const fast = renderPluck(SR, 440, 0.3, { decay: 0.99 });
    const half = Math.floor(slow.length / 2);
    expect(energy(fast, half, fast.length)).toBeLessThan(energy(slow, half, slow.length));
    expect(energy(fast, half, fast.length)).toBeGreaterThan(0);
  });

  it('brightness が高いほど高域の成分が多い (隣接差分のエネルギー比で見る)', () => {
    // 最大振幅で正規化するので「後半の総エネルギー」は明るさの指標にならない
    // (鈍い音は種ノイズの山が低く、基音が相対的に大きく残る)。高域の割合で比べる
    const period = Math.round(SR / 440);
    const highRatio = (s: Float32Array) => {
      const diff = new Float32Array(s.length);
      for (let i = 1; i < s.length; i++) diff[i] = s[i] - s[i - 1];
      return energy(diff, period, s.length) / energy(s, period, s.length);
    };
    const dull = highRatio(renderPluck(SR, 440, 0.3, { brightness: 0.3 }));
    const mid = highRatio(renderPluck(SR, 440, 0.3, { brightness: 0.5 }));
    const bright = highRatio(renderPluck(SR, 440, 0.3, { brightness: 0.7 }));
    expect(dull).toBeLessThan(mid);
    expect(mid).toBeLessThan(bright);
  });
});

describe('pluckSpec', () => {
  it('4 種の音高と長さ (docs/plan/v3-phase2.md「4 音」)', () => {
    expect(pluckSpec('on')).toMatchObject({ hz: 880, durSec: 0.25 });
    expect(pluckSpec('off')).toMatchObject({ hz: 440, durSec: 0.3 });
    expect(pluckSpec('miss')).toMatchObject({ hz: 110, durSec: 0.35 });
    expect(pluckSpec('cancel', 72)).toMatchObject({ hz: midiToHz(72), durSec: 0.5 });
    expect(pluckSpec('cancel').hz).toBeCloseTo(midiToHz(72), 6);
    expect(pluckSpec('cancel', 84).hz).toBeCloseTo(midiToHz(72) * 2, 6);
  });

  it('外は鈍く短く、相殺は明るく長く。gain は 0.25〜0.35', () => {
    const miss = pluckSpec('miss');
    const cancel = pluckSpec('cancel');
    expect(miss.decay).toBeLessThan(cancel.decay);
    expect(miss.brightness).toBeLessThan(cancel.brightness);
    for (const kind of ['on', 'off', 'miss', 'cancel'] as const) {
      const s = pluckSpec(kind);
      expect(s.gain).toBeGreaterThanOrEqual(0.25);
      expect(s.gain).toBeLessThanOrEqual(0.35);
    }
  });
});
