// 拍 → 段と進み (v7 T5)
import { describe, expect, it } from 'vitest';
import { stageAt } from './stage';

describe('stageAt (4/4、8 小節 = 32 拍で 1 段)', () => {
  it('段の切り替わりは小節 8 と 16 の頭 (拍 32 と 64)。進みは段の中で線形', () => {
    expect(stageAt(0, 4)).toEqual({ stage: 0, progress: 0, overall: 0 });
    expect(stageAt(16, 4)).toEqual({ stage: 0, progress: 0.5, overall: 0.5 / 3 });
    expect(stageAt(31.99, 4).stage).toBe(0);
    expect(stageAt(32, 4)).toEqual({ stage: 1, progress: 0, overall: 1 / 3 });
    expect(stageAt(64, 4).stage).toBe(2);
    expect(stageAt(80, 4)).toEqual({ stage: 2, progress: 0.5, overall: 2.5 / 3 });
  });

  it('最後の段で頭打ちになり、曲の終わり以降は進み 1。負の拍は段 0 進み 0', () => {
    expect(stageAt(96, 4)).toEqual({ stage: 2, progress: 1, overall: 1 });
    expect(stageAt(200, 4)).toEqual({ stage: 2, progress: 1, overall: 1 });
    expect(stageAt(-3, 4)).toEqual({ stage: 0, progress: 0, overall: 0 });
  });

  it('段の長さと数は引数で変えられる', () => {
    expect(stageAt(8, 4, 2, 2)).toEqual({ stage: 1, progress: 0, overall: 0.5 });
    expect(stageAt(4, 4, 2, 2)).toEqual({ stage: 0, progress: 0.5, overall: 0.25 });
  });
});
