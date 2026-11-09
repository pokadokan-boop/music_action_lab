import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { applyBranch, moveOf } from './choreo';
import { enemyMotion, enemyPose, playerPose, RECOVER_BEATS } from './pose';
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

describe('enemyMotion と moveOf (v7 T5)', () => {
  // dash: 予告 8、出発 10、窓 10〜10.25、余韻 10.75 まで。laser: 予告 24、当たり 26、窓 26〜26.25
  const dash = dashAttack();
  const laser = shotAttack({ type: 'laser', activeBeats: 0.25, length: 0.3 });
  const choreo = makeChoreo([dash, laser]);

  it('予告の間は pre が 0 → 1、当たりの後は post が 0 → 1 (窓の終わり + 0.5 拍で 1)。外れていれば move null', () => {
    expect(enemyMotion(choreo, 7.9, grid.beatSec, config)).toEqual({ move: null, attack: null, pre: 0, post: 0 });
    const m0 = enemyMotion(choreo, 8, grid.beatSec, config);
    expect(m0.move).toBe('dash');
    expect(m0.pre).toBe(0);
    expect(m0.post).toBe(0);
    const m1 = enemyMotion(choreo, 9, grid.beatSec, config);
    expect(m1.pre).toBeCloseTo(0.5, 9);
    expect(m1.post).toBe(0);
    const m2 = enemyMotion(choreo, 10, grid.beatSec, config);
    expect(m2.pre).toBe(1);
    expect(m2.post).toBe(0);
    // 窓の終わり (10.25) を過ぎても余韻 (10.75 まで) は同じ攻撃の post が続く
    const m3 = enemyMotion(choreo, 10.5, grid.beatSec, config);
    expect(m3.move).toBe('dash');
    expect(m3.post).toBeCloseTo((10.5 - 10) / (10.25 + RECOVER_BEATS - 10), 9);
    expect(enemyMotion(choreo, 10.8, grid.beatSec, config).move).toBeNull();
    // 短い laser は突き
    expect(enemyMotion(choreo, 25, grid.beatSec, config).move).toBe('thrust');
  });

  it('moveOf: 書いてあればそれ。laser は長さで突き / 振り下ろし、heavy なら大上段。他は型の名前', () => {
    expect(moveOf(shotAttack({ type: 'laser', length: 0.3 }))).toBe('thrust');
    expect(moveOf(shotAttack({ type: 'laser', length: 0.5 }))).toBe('chop');
    expect(moveOf(shotAttack({ type: 'laser' }))).toBe('chop');
    expect(moveOf(shotAttack({ type: 'laser', length: 0.6, heavy: true }))).toBe('heavyChop');
    expect(moveOf(shotAttack({ type: 'laser', length: 0.3, move: 'sweep' }))).toBe('sweep');
    expect(moveOf(shotAttack())).toBe('shot');
    expect(moveOf(dashAttack())).toBe('dash');
    expect(moveOf(burstAttack())).toBe('burst');
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

describe('playerPose (v5: ステップ・溜め・放ち・返し)', () => {
  const none = { attacking: false, cancelling: false, damaged: false };

  it('攻撃の種類で attack / riposte / release に分かれ、ステップと溜めは攻撃より下、構えるより上', () => {
    expect(playerPose({ ...none, attacking: true, action: 'release' }, 'idle')).toBe('release');
    expect(playerPose({ ...none, attacking: true, action: 'riposte' }, 'idle')).toBe('riposte');
    expect(playerPose({ ...none, attacking: true, action: 'normal' }, 'idle')).toBe('attack');
    expect(playerPose({ ...none, attacking: true, stepping: true, charging: true }, 'idle')).toBe('attack');
    expect(playerPose({ ...none, stepping: true, charging: true }, 'stopped')).toBe('step');
    expect(playerPose({ ...none, charging: true }, 'stopped')).toBe('charge');
    expect(playerPose({ ...none, cancelling: true, action: 'release' }, 'idle')).toBe('cancel');
    expect(playerPose({ ...none, damaged: true, stepping: true }, 'idle')).toBe('hit');
  });
});
