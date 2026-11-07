// シーン (v7 T2): 振り付け 1 本 = 曲 1 つ + 敵 1 体 + 長さ + 敵の HP。振り付けに書いたシーンごとの値で、
// 合否条件の長さ (acceptance.sceneSeconds) と設定の敵 HP (config.enemyHp) を上書きした SimDeps を作る。
// acceptance.json と config.ts の既定は変えない (docs/plan/v7-phase1.md「承認に含めるもの」0)
import type { Config } from '../config';
import type { Acceptance, Choreo } from './choreo';
import type { Grid } from './grid';
import type { SimDeps } from './sim';

export function sceneDeps(choreo: Choreo, grid: Grid, cfg: Config, acceptance: Acceptance): SimDeps {
  return {
    choreo,
    grid,
    cfg: choreo.enemyHp === undefined ? cfg : { ...cfg, enemyHp: choreo.enemyHp },
    acceptance: choreo.sceneSeconds === undefined ? acceptance : { ...acceptance, sceneSeconds: choreo.sceneSeconds },
  };
}

// タイトルのカードに出すシーンの説明
export function describeScene(choreo: Choreo, acceptance: Acceptance, cfg: Config): string {
  return `曲: ${choreo.song} / ${choreo.sceneSeconds ?? acceptance.sceneSeconds} 秒 / 敵 HP ${choreo.enemyHp ?? cfg.enemyHp}`;
}

export const SCENE_KEY = 'mal.scene';

// 前回選んだシーン (振り付けの id)。無ければ null
export function loadSceneId(storage: Storage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(SCENE_KEY);
  } catch {
    return null;
  }
}

export function saveSceneId(id: string, storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(SCENE_KEY, id);
  } catch {
    // 保存できなくても続ける
  }
}
