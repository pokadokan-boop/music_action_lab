import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { describeScene, loadSceneId, saveSceneId, sceneDeps } from './scene';
import { createSim, step } from './sim';
import { makeChoreo, makeGrid } from './test-fixtures';

const stay = { move: { x: 0, y: 0 }, attackPressed: false };

describe('シーン (v7 T2)', () => {
  it('振り付けに sceneSeconds と enemyHp が無ければ既定のまま (v6.1 と同じ)', () => {
    const deps = sceneDeps(makeChoreo(), makeGrid(), config, acceptance);
    expect(deps.cfg).toBe(config);
    expect(deps.acceptance).toBe(acceptance);
    expect(createSim(deps).enemy.hp).toBe(12);
  });

  it('sceneSeconds で終了時刻が、enemyHp で敵の HP が変わる', () => {
    const choreo = { ...makeChoreo(), sceneSeconds: 2, enemyHp: 24 };
    const deps = sceneDeps(choreo, makeGrid(), config, acceptance);
    const state = createSim(deps);
    expect(state.enemy.hp).toBe(24);
    for (let i = 0; i < 300; i++) step(state, stay, config.fixedDt, deps);
    expect(state.finished).toBe(true);
    expect(state.t).toBeGreaterThanOrEqual(2);
    expect(state.t).toBeLessThan(2.02);
    // 既定は触っていない
    expect(acceptance.sceneSeconds).toBe(20);
    expect(config.enemyHp).toBe(12);
  });

  it('カードの説明と、選んだシーンの保存', () => {
    expect(describeScene(makeChoreo(), acceptance, config)).toBe('曲: fixture / 20 秒 / 敵 HP 12');
    expect(describeScene({ ...makeChoreo(), sceneSeconds: 40, enemyHp: 24 }, acceptance, config)).toBe('曲: fixture / 40 秒 / 敵 HP 24');
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as unknown as Storage;
    expect(loadSceneId(storage)).toBeNull();
    saveSceneId('v7', storage);
    expect(loadSceneId(storage)).toBe('v7');
    expect(loadSceneId(null)).toBeNull();
  });
});
