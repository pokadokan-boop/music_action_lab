// 構え (v4 T3)。描画はここで決めた名前だけを見る。絵は src/render/figures.ts
import { activeWindow, attackMotion, type Attack, type Choreo } from './choreo';
import type { Config } from '../config';

export type EnemyPose = 'idle' | 'laser' | 'burst' | 'dash' | 'stopped' | 'approach' | 'retreat';
// v5 で step (ステップ)、charge (溜め)、release (放ち)、riposte (返し) を足した
export type PlayerPose = 'idle' | 'attack' | 'cancel' | 'hit' | 'ready' | 'step' | 'charge' | 'release' | 'riposte';

// 今まさに来ている攻撃 (予告開始〜当たりの窓の終わり)。複数が重なるとき (v5 の連なる攻撃) は当たりの窓が先に終わるものを採る。
// 構えと敵の向きで使う。choreo は解決済み (effectiveChoreo) のものを渡す
export function currentAttack(choreo: Choreo, beat: number, beatSec: number, cfg: Config): Attack | null {
  let best: { atk: Attack; end: number } | null = null;
  for (const atk of choreo.attacks) {
    const w = activeWindow(atk, beatSec, cfg, attackMotion(choreo, atk));
    if (beat < atk.telegraphBeat || beat > w.endBeat) continue;
    if (!best || w.endBeat < best.end) best = { atk, end: w.endBeat };
  }
  return best?.atk ?? null;
}

// 敵の構え。攻撃の予告開始〜当たりの窓の終わりはその型 (shot は laser と同じ構え)、分岐で足した区間は分岐の種類、他は idle
export function enemyPose(choreo: Choreo, beat: number, beatSec: number, cfg: Config): EnemyPose {
  const current = currentAttack(choreo, beat, beatSec, cfg);
  if (current) return attackPose(current);
  for (const atk of choreo.attacks) {
    if (atk.branchFromBeat === undefined || atk.branchMove === undefined) continue;
    const last = atk.path[atk.path.length - 1].beat;
    if (beat >= atk.branchFromBeat && beat <= last) return branchPose(atk.branchMove);
  }
  return 'idle';
}

// shot と sweep (v7) は laser、slam (v6) は burst と同じ構え
function attackPose(atk: Attack): EnemyPose {
  return atk.type === 'shot' || atk.type === 'sweep' ? 'laser' : atk.type === 'slam' ? 'burst' : atk.type;
}

function branchPose(move: NonNullable<Attack['branchMove']>): EnemyPose {
  return move === 'stop' ? 'stopped' : move === 'approach' ? 'approach' : move === 'retreat' ? 'retreat' : 'idle';
}

export interface PlayerPoseInput {
  // その瞬間の演出の状態 (main.ts の flash)
  attacking: boolean;
  cancelling: boolean;
  damaged: boolean;
  // v5: 攻撃の種類 (attacking が true のとき。省略は通常)、ステップ中か、溜め状態か
  action?: 'normal' | 'riposte' | 'release';
  stepping?: boolean;
  charging?: boolean;
}

// 自機の構え。優先順: 被弾 → 相殺 → 放ち → 返し → 攻撃 → ステップ → 溜め → 構える (敵が止まっているか寄っている) → 立つ
export function playerPose(input: PlayerPoseInput, enemy: EnemyPose): PlayerPose {
  if (input.damaged) return 'hit';
  if (input.cancelling) return 'cancel';
  if (input.attacking) return input.action === 'release' ? 'release' : input.action === 'riposte' ? 'riposte' : 'attack';
  if (input.stepping) return 'step';
  if (input.charging) return 'charge';
  if (enemy === 'stopped' || enemy === 'approach') return 'ready';
  return 'idle';
}
