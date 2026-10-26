import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, angleDeg, inFan, normalize } from './vec';

describe('vec の向きの幾何', () => {
  it('angleDeg は 0 = 右、90 = 下、時計回りで [0, 360)', () => {
    expect(angleDeg({ x: 1, y: 0 })).toBeCloseTo(0, 9);
    expect(angleDeg({ x: 0, y: 1 })).toBeCloseTo(90, 9);
    expect(angleDeg({ x: -1, y: 0 })).toBeCloseTo(180, 9);
    expect(angleDeg({ x: 0, y: -1 })).toBeCloseTo(270, 9);
  });

  it('angleBetweenDeg は差の絶対値 (0〜180)。長さに依存しない', () => {
    expect(angleBetweenDeg({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 9);
    expect(angleBetweenDeg({ x: 1, y: 0 }, { x: 0, y: -5 })).toBeCloseTo(90, 9);
    expect(angleBetweenDeg({ x: 1, y: 0 }, { x: -2, y: 0 })).toBeCloseTo(180, 9);
    expect(angleBetweenDeg({ x: 0, y: -1 }, { x: 1, y: -1 })).toBeCloseTo(45, 9);
  });

  it('normalize は単位ベクトル、零ベクトルは零のまま', () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('inFan は半径と半角の両方を見る', () => {
    const o = { x: 0.5, y: 0.5 };
    const right = { x: 1, y: 0 };
    expect(inFan(o, right, 45, 0.2, { x: 0.6, y: 0.5 })).toBe(true); // 正面、射程内
    expect(inFan(o, right, 45, 0.2, { x: 0.6, y: 0.55 })).toBe(true); // 約 27 度
    expect(inFan(o, right, 45, 0.2, { x: 0.6, y: 0.65 })).toBe(false); // 約 56 度
    expect(inFan(o, right, 45, 0.2, { x: 0.8, y: 0.5 })).toBe(false); // 正面だが射程外
    expect(inFan(o, right, 45, 0.2, { x: 0.5, y: 0.5 })).toBe(true); // 同じ点
  });
});
