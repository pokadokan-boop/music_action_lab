// 曲の段 (v7 T5)。拍 → 段 (0〜2) と段の中の進み (0〜1)。敵の姿の形態変化に使う (docs/plan/v7-phase1.md 完了条件「2 体目の敵の姿」)。
// 段の切り替わりは小節の頭に揃う (8 小節ごと)。進みは段の中の小節の進みで線形。純粋関数
import { clamp } from './vec';

export interface StageInfo {
  // 段 (0 始まり。最後の段で頭打ち)
  stage: number;
  // 段の中の進み 0〜1 (段の頭で 0、次の段の頭の直前で 1 に近づく。最後の段は曲の終わりで 1)
  progress: number;
  // 曲全体での進み 0〜1 ((stage + progress) / 段の数)
  overall: number;
}

export const BARS_PER_STAGE = 8;
export const STAGE_COUNT = 3;

export function stageAt(beat: number, beatsPerBar: number, barsPerStage = BARS_PER_STAGE, stages = STAGE_COUNT): StageInfo {
  const stageBeats = beatsPerBar * barsPerStage;
  const b = Math.max(0, beat);
  const stage = Math.min(stages - 1, Math.floor(b / stageBeats));
  const progress = clamp((b - stage * stageBeats) / stageBeats, 0, 1);
  return { stage, progress, overall: clamp((stage + progress) / stages, 0, 1) };
}
