import { describe, expect, it } from 'vitest';
import { GameClock } from './clock';

describe('GameClock', () => {
  it('advanceTime(1000) は 120 ステップを返す', () => {
    const clock = new GameClock(1 / 120);
    const steps = clock.advanceTime(1000);
    expect(steps).toHaveLength(120);
    expect(clock.now).toBeCloseTo(1, 9);
  });

  it('端数を次回に持ち越す', () => {
    const clock = new GameClock(1 / 120);
    const a = clock.advanceTime(4); // 0.48 step
    const b = clock.advanceTime(4.5); // 累計 1.02 step
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });

  it('小刻みに進めても now が累積誤差を持たない', () => {
    const clock = new GameClock(1 / 120);
    for (let i = 0; i < 1000; i++) clock.advanceTime(16.67);
    expect(clock.now).toBeCloseTo(Math.floor((16.67 * 1000) / 1000 / (1 / 120)) / 120, 9);
  });
});
