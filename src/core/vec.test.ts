import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, angleDeg, closestPointOnSegment, fanOverlapsCircle, fanOverlapsSegment, inFan, normalize } from './vec';

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

describe('vec の相殺の幾何 (T5)', () => {
  const o = { x: 0.5, y: 0.5 };
  const right = { x: 1, y: 0 };

  it('closestPointOnSegment は線分上の最も近い点 (端を越えない)', () => {
    const a = { x: 0.8, y: 0.3 };
    const b = { x: 0, y: 0.3 };
    expect(closestPointOnSegment({ x: 0.5, y: 0.31 }, a, b)).toEqual({ x: 0.5, y: 0.3 });
    expect(closestPointOnSegment({ x: 0.9, y: 0.3 }, a, b)).toEqual(a);
    expect(closestPointOnSegment({ x: 0.5, y: 0.5 }, a, a)).toEqual(a);
  });

  it('fanOverlapsCircle は半径ぶん広げた距離と角度で見る', () => {
    expect(fanOverlapsCircle(o, right, 45, 0.18, { x: 0.65, y: 0.5 }, 0.06)).toBe(true); // 正面、距離 0.15 ≤ 0.24
    expect(fanOverlapsCircle(o, right, 45, 0.18, { x: 0.75, y: 0.5 }, 0.06)).toBe(false); // 距離 0.25 > 0.24
    const at = (deg: number, d: number) => ({ x: o.x + d * Math.cos((deg * Math.PI) / 180), y: o.y + d * Math.sin((deg * Math.PI) / 180) });
    // 角度差 55 度でも円の縁 (atan(0.06 / 0.15) ≈ 22 度) が扇に掛かる
    expect(fanOverlapsCircle(o, right, 45, 0.18, at(55, 0.15), 0.06)).toBe(true);
    expect(fanOverlapsCircle(o, right, 45, 0.18, at(70, 0.15), 0.06)).toBe(false);
    expect(fanOverlapsCircle(o, right, 45, 0.18, o, 0.06)).toBe(true); // 中心が同じ点
  });

  it('fanOverlapsSegment は線の延びる先も見る (最も近い点が真横でも、線に沿って向けば重なる)', () => {
    const a = { x: 0.8, y: 0.45 };
    const b = { x: 0, y: 0.45 };
    // 線はプレイヤーの 0.05 上を横に走る。最も近い点は真上 (90 度) だが、線に沿って右を向けば扇に線が入る
    expect(fanOverlapsSegment(o, right, 45, 0.18, a, b, 0.03)).toBe(true);
    expect(fanOverlapsSegment(o, { x: -1, y: 0 }, 45, 0.18, a, b, 0.03)).toBe(true);
    expect(fanOverlapsSegment(o, { x: 0, y: -1 }, 45, 0.18, a, b, 0.03)).toBe(true);
    // 下を向くと線は後ろ
    expect(fanOverlapsSegment(o, { x: 0, y: 1 }, 45, 0.18, a, b, 0.03)).toBe(false);
    // 遠い線 (距離 0.4 > 0.18 + 0.03)
    expect(fanOverlapsSegment(o, right, 45, 0.18, { x: 0.8, y: 0.1 }, { x: 0, y: 0.1 }, 0.03)).toBe(false);
    // 近いが全て後ろ側 (x = 0.4 の縦線、右向き)
    expect(fanOverlapsSegment(o, right, 45, 0.18, { x: 0.4, y: 0 }, { x: 0.4, y: 1 }, 0.03)).toBe(false);
  });
});
