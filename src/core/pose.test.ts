import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { applyBranch } from './choreo';
import { enemyPose, playerPose } from './pose';
import { burstAttack, dashAttack, makeChoreo, makeGrid, shotAttack } from './test-fixtures';

const grid = makeGrid();

describe('enemyPose', () => {
  const choreo = makeChoreo([dashAttack(), burstAttack(), shotAttack({ type: 'laser', activeBeats: 0.25 })]);

  it('予告開始から当たりの窓の終わりまでは攻撃の型、他は idle', () => {
    expect(enemyPose(choreo, 7.9, grid.beatSec, config)).toBe('idle');
    expect(enemyPose(choreo, 8, grid.beatSec, config)).toBe('dash');
    expect(enemyPose(choreo, 10.25, grid.beatSec, config)).toBe('dash');
    expect(enemyPose(choreo, 10.3, grid.beatSec, config)).toBe('idle');
    expect(enemyPose(choreo, 17, grid.beatSec, config)).toBe('burst');
    expect(enemyPose(choreo, 25, grid.beatSec, config)).toBe('laser');
  });

  it('shot も laser の構え', () => {
    expect(enemyPose(makeChoreo([shotAttack()]), 25, grid.beatSec, config)).toBe('laser');
  });

  it('分岐で足した区間は分岐の種類 (stop → stopped、approach、retreat)', () => {
    const rest = config.enemyRestPos;
    const stopped = applyBranch(dashAttack(), { move: 'stop', beats: 1 }, { x: 0.15, y: 0.5 }, { x: 1, y: 0 }, config, rest);
    expect(enemyPose(makeChoreo([stopped]), 11, grid.beatSec, config)).toBe('stopped');
    expect(enemyPose(makeChoreo([stopped]), 11.6, grid.beatSec, config)).toBe('idle');
    const approach = applyBranch(dashAttack(), { move: 'approach' }, { x: 0.15, y: 0.5 }, { x: 1, y: 0 }, config, rest);
    expect(enemyPose(makeChoreo([approach]), 10.7, grid.beatSec, config)).toBe('approach');
    const retreat = applyBranch(dashAttack(), { move: 'retreat' }, { x: 0.15, y: 0.5 }, { x: 1, y: 0 }, config, rest);
    expect(enemyPose(makeChoreo([retreat]), 10.7, grid.beatSec, config)).toBe('retreat');
  });
});

describe('playerPose', () => {
  const none = { attacking: false, cancelling: false, damaged: false };

  it('優先順は 被弾 → 相殺 → 攻撃 → 構える → 立つ', () => {
    expect(playerPose({ attacking: true, cancelling: true, damaged: true }, 'idle')).toBe('hit');
    expect(playerPose({ attacking: true, cancelling: true, damaged: false }, 'idle')).toBe('cancel');
    expect(playerPose({ attacking: true, cancelling: false, damaged: false }, 'idle')).toBe('attack');
    expect(playerPose(none, 'stopped')).toBe('ready');
    expect(playerPose(none, 'approach')).toBe('ready');
    expect(playerPose(none, 'dash')).toBe('idle');
    expect(playerPose(none, 'idle')).toBe('idle');
  });
});
