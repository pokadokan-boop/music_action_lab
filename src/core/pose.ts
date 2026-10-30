// 構え (v4 T3)。描画はここで決めた名前だけを見る。絵は src/render/figures.ts
import { activeWindow, attackMotion, type Attack, type Choreo } from './choreo';
import type { Config } from '../config';

export type EnemyPose = 'idle' | 'laser' | 'burst' | 'dash' | 'stopped' | 'approach' | 'retreat';
export type PlayerPose = 'idle' | 'attack' | 'cancel' | 'hit' | 'ready';

// 敵の構え。攻撃の予告開始〜当たりの窓の終わりはその型 (shot は laser と同じ構え)、分岐で足した区間は分岐の種類、他は idle。
// choreo は解決済み (effectiveChoreo) のものを渡す
export function enemyPose(choreo: Choreo, beat: number, beatSec: number, cfg: Config): EnemyPose {
  for (const atk of choreo.attacks) {
    const w = activeWindow(atk, beatSec, cfg, attackMotion(choreo, atk));
    if (beat >= atk.telegraphBeat && beat <= w.endBeat) return attackPose(atk);
  }
  for (const atk of choreo.attacks) {
    if (atk.branchFromBeat === undefined || atk.branchMove === undefined) continue;
    const last = atk.path[atk.path.length - 1].beat;
    if (beat >= atk.branchFromBeat && beat <= last) return branchPose(atk.branchMove);
  }
  return 'idle';
}

function attackPose(atk: Attack): EnemyPose {
  return atk.type === 'shot' ? 'laser' : atk.type;
}

function branchPose(move: NonNullable<Attack['branchMove']>): EnemyPose {
  return move === 'stop' ? 'stopped' : move === 'approach' ? 'approach' : move === 'retreat' ? 'retreat' : 'idle';
}

export interface PlayerPoseInput {
  // その瞬間の演出の状態 (main.ts の flash)
  attacking: boolean;
  cancelling: boolean;
  damaged: boolean;
}

// 自機の構え。優先順: 被弾 → 相殺 → 攻撃 → 構える (敵が止まっているか寄っている) → 立つ
export function playerPose(input: PlayerPoseInput, enemy: EnemyPose): PlayerPose {
  if (input.damaged) return 'hit';
  if (input.cancelling) return 'cancel';
  if (input.attacking) return 'attack';
  if (enemy === 'stopped' || enemy === 'approach') return 'ready';
  return 'idle';
}
