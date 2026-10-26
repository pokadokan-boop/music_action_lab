// 合成信号で立ち上がり時刻の測定 (onset.ts) を確かめる
import { describe, expect, it } from 'vitest';
import { ONSET_SETTINGS, energyEnvelope, lowpass, riseTime } from './onset';

const SR = 48000;

// lengthSec の無音の後に始まる信号を作る。gen(tSec) は信号の開始からの時刻 (秒) で値を返す
function signal(silenceSec: number, totalSec: number, gen: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(totalSec * SR));
  const start = Math.round(silenceSec * SR);
  for (let i = start; i < out.length; i++) out[i] = gen((i - start) / SR);
  return out;
}

function sine(hz: number): (t: number) => number {
  return (t) => Math.sin(2 * Math.PI * hz * t);
}

// 定常状態 (後半) の振幅の最大
function steadyAmplitude(samples: Float32Array): number {
  let max = 0;
  for (let i = Math.floor(samples.length / 2); i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

describe('energyEnvelope', () => {
  it('無音は 0、定常の正弦波は振幅 / √2 に近い', () => {
    const env = energyEnvelope(signal(0.1, 0.5, sine(440)), SR);
    expect(env[Math.round(0.05 / ONSET_SETTINGS.hopSec)]).toBe(0);
    const late = env[Math.round(0.4 / ONSET_SETTINGS.hopSec)];
    expect(late).toBeGreaterThan(0.65);
    expect(late).toBeLessThan(0.76);
  });
});

describe('riseTime', () => {
  const t0 = 0.5;

  it('5 ms の直線ランプで立ち上がる 440 Hz 正弦波の 90% 立ち上がりは 10〜13 ms (後ろ向き窓のぶん 5 ms より +7 ms ほど遅く出る)', () => {
    const ramp = 0.005;
    const samples = signal(t0, 1.0, (t) => Math.min(1, t / ramp) * Math.sin(2 * Math.PI * 440 * t));
    const r = riseTime(energyEnvelope(samples, SR), ONSET_SETTINGS.hopSec, t0);
    expect(r.rise90Ms).toBeGreaterThanOrEqual(10);
    expect(r.rise90Ms).toBeLessThanOrEqual(13);
    expect(r.rise50Ms).toBeGreaterThanOrEqual(0);
    expect(r.rise50Ms).toBeLessThanOrEqual(r.rise90Ms);
    expect(r.baseline).toBe(0);
    expect(r.peak).toBeGreaterThan(0.6);
  });

  it('ステップ入力の 90% 立ち上がりは窓幅 (10 ms) 以下', () => {
    const samples = signal(t0, 1.0, () => 1);
    const r = riseTime(energyEnvelope(samples, SR), ONSET_SETTINGS.hopSec, t0);
    expect(r.rise90Ms).toBeGreaterThanOrEqual(0);
    expect(r.rise90Ms).toBeLessThanOrEqual(ONSET_SETTINGS.windowSec * 1000);
    expect(r.rise50Ms).toBeLessThanOrEqual(r.rise90Ms);
  });

  it('無音なら NaN', () => {
    const r = riseTime(energyEnvelope(new Float32Array(SR), SR), ONSET_SETTINGS.hopSec, t0);
    expect(r.rise90Ms).toBeNaN();
    expect(r.rise50Ms).toBeNaN();
    expect(r.baseline).toBe(0);
    expect(r.peak).toBe(0);
  });
});

describe('lowpass', () => {
  it('1 kHz の正弦波の振幅を 1/10 以下に落とす', () => {
    const out = lowpass(signal(0, 0.5, sine(1000)), SR, 200);
    expect(steadyAmplitude(out)).toBeLessThanOrEqual(0.1);
  });

  it('50 Hz の正弦波はほぼ通す', () => {
    const out = lowpass(signal(0, 0.5, sine(50)), SR, 200);
    const amp = steadyAmplitude(out);
    expect(amp).toBeGreaterThan(0.9);
    expect(amp).toBeLessThan(1.05);
  });
});
