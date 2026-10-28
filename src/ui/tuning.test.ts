import { describe, expect, it } from 'vitest';
import { defaultTuning, makeConfig } from '../config';
import { TUNING_KEY, clampTuning, describeTuning, loadTuning, saveTuning } from './tuning';

// vitest の environment は node なので localStorage の代わりに Map で Storage を模す
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

describe('tuning', () => {
  it('storage が無ければ既定値', () => {
    expect(loadTuning(null)).toEqual(defaultTuning);
  });

  it('保存が無い・JSON が壊れている・オブジェクトでないときは既定値', () => {
    expect(loadTuning(memoryStorage())).toEqual(defaultTuning);
    expect(loadTuning(memoryStorage({ [TUNING_KEY]: '{bad json' }))).toEqual(defaultTuning);
    expect(loadTuning(memoryStorage({ [TUNING_KEY]: '42' }))).toEqual(defaultTuning);
  });

  it('getItem が例外を投げても既定値', () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    expect(loadTuning(broken)).toEqual(defaultTuning);
  });

  it('範囲外は端の値に、数値でない項目は既定値に収める', () => {
    const t = clampTuning({ cancelEarlyMs: 999, cancelLateMs: -5, sizeScale: Number.NaN, fanRatio: 3, cancelFacingDeg: 'x' as unknown as number });
    expect(t).toEqual({ cancelEarlyMs: 200, cancelLateMs: 0, sizeScale: 0.6, fanRatio: 2.0, cancelFacingDeg: 60 });
    // 保存された JSON の範囲外も同じ規則で直る
    const s = memoryStorage({ [TUNING_KEY]: JSON.stringify({ sizeScale: 0.1, cancelFacingDeg: 90 }) });
    expect(loadTuning(s)).toEqual({ ...defaultTuning, sizeScale: 0.4, cancelFacingDeg: 90 });
  });

  it('saveTuning → loadTuning で往復する', () => {
    const s = memoryStorage();
    const t = { sizeScale: 0.8, fanRatio: 1.5, cancelEarlyMs: 120, cancelLateMs: 30, cancelFacingDeg: 90 };
    saveTuning(t, s);
    expect(loadTuning(s)).toEqual(t);
  });

  it('setItem が例外を投げても落ちない', () => {
    const full = memoryStorage();
    full.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => saveTuning(defaultTuning, full)).not.toThrow();
  });

  it('describeTuning は既定値で計画どおりの 1 行になる', () => {
    expect(describeTuning(defaultTuning)).toBe('調整 窓 前100/後50 ms 大きさ 0.6 扇 1.2 許容 60°');
    expect(describeTuning({ ...defaultTuning, sizeScale: 0.1 + 0.2 + 0.3 })).toContain('大きさ 0.6 ');
  });

  it('makeConfig(defaultTuning) の半径 (自機 0.024・敵 0.03・扇 0.0576)', () => {
    const cfg = makeConfig(defaultTuning);
    expect(cfg.playerRadius).toBeCloseTo(0.024, 9);
    expect(cfg.enemyRadius).toBeCloseTo(0.03, 9);
    expect(cfg.attackRadius).toBeCloseTo(0.0576, 9);
    expect(cfg.tuning).toBe(defaultTuning);
  });
});
