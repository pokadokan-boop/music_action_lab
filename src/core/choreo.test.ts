import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { enemyPosAt, hitboxAt, pathPosAt, validateChoreo } from './choreo';
import { burstAttack, dashAttack, makeChoreo, makeGrid, shotAttack } from './test-fixtures';

const grid = makeGrid();

describe('pathPosAt / enemyPosAt', () => {
  it('キーフレームの間をイージングアウトで補間し、外では端に留まる', () => {
    const path = [
      { beat: 0, x: 0, y: 0 },
      { beat: 2, x: 1, y: 0 },
    ];
    expect(pathPosAt(path, -1)).toEqual({ x: 0, y: 0 });
    expect(pathPosAt(path, 3)).toEqual({ x: 1, y: 0 });
    const mid = pathPosAt(path, 1).x;
    expect(mid).toBeGreaterThan(0.5); // イージングアウトは前半で速い
    expect(mid).toBeCloseTo(1 - 0.5 ** 3, 9);
  });

  it('攻撃の無い間は休憩位置に idle の上下が乗る', () => {
    const choreo = makeChoreo([dashAttack()]);
    const rest = { x: 0.75, y: 0.5 };
    const atHead = enemyPosAt(choreo, 40, rest); // 拍の頭
    const late = enemyPosAt(choreo, 40.9, rest);
    expect(atHead.y).toBeLessThan(late.y);
    expect(late.y).toBeCloseTo(rest.y, 2);
  });
});

describe('hitboxAt', () => {
  it('dash は active 区間だけ本体の円を返す', () => {
    const atk = dashAttack();
    expect(hitboxAt(atk, 9.9, grid.beatSec, config)).toBeNull();
    const c = hitboxAt(atk, 10.1, grid.beatSec, config);
    expect(c).not.toBeNull();
    expect(c!.r).toBe(0.06);
    expect(hitboxAt(atk, 10.3, grid.beatSec, config)).toBeNull();
  });

  it('shot は hitBeat から target へ進み、画面外で消える', () => {
    const atk = shotAttack();
    const c0 = hitboxAt(atk, 26, grid.beatSec, config)!;
    expect(c0.x).toBeCloseTo(0.8, 9);
    const c1 = hitboxAt(atk, 26.5, grid.beatSec, config)!;
    expect(c1.x).toBeLessThan(c0.x);
    expect(c1.y).toBeCloseTo(0.3, 9);
    expect(hitboxAt(atk, 40, grid.beatSec, config)).toBeNull();
  });
});

describe('validateChoreo', () => {
  it('正しい振り付けでは違反が無い', () => {
    expect(validateChoreo(makeChoreo(), grid, acceptance, config)).toEqual([]);
  });

  it('予告が短いと telegraph-lead', () => {
    const v = validateChoreo(makeChoreo([dashAttack({ telegraphBeat: 9.5, path: [{ beat: 9.5, x: 0.75, y: 0.5 }, { beat: 10, x: 0.3, y: 0.5 }] })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('telegraph-lead');
  });

  it('当たりがグリッドにも音にも乗らないと hit-on-grid', () => {
    const v = validateChoreo(makeChoreo([dashAttack({ hitBeat: 10.3 })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('hit-on-grid');
  });

  it('フレーズの音に乗っていれば半拍でなくても通る', () => {
    // phrase 1 の noteBeats に 9.5 がある。予告は 2 拍前の 7.5 から
    const v = validateChoreo(makeChoreo([dashAttack({ hitBeat: 9.5, telegraphBeat: 7.5 })]), grid, acceptance, config);
    expect(v).toEqual([]);
  });

  it('画面全体を覆う当たりは dodgeable', () => {
    const v = validateChoreo(makeChoreo([burstAttack({ hitbox: { shape: 'circle', r: 2 } })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('dodgeable');
  });

  it('path の beat が逆順なら path-order', () => {
    const v = validateChoreo(makeChoreo([dashAttack({ path: [{ beat: 10, x: 0, y: 0 }, { beat: 8, x: 1, y: 1 }] })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('path-order');
  });

  it('無いフレーズを指すと phrase-range、target の無い shot は shot-target', () => {
    const v = validateChoreo(makeChoreo([dashAttack({ phrase: 99 }), shotAttack({ target: undefined })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toEqual(expect.arrayContaining(['phrase-range', 'shot-target']));
  });
});
