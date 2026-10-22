import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { enemyPosAt, hitboxAt, pathPosAt, validateChoreo, type CircleHit, type SegmentHit } from './choreo';
import { distToSegment, easeIn } from './vec';
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
    const c0 = hitboxAt(atk, 26, grid.beatSec, config) as CircleHit;
    expect(c0.x).toBeCloseTo(0.8, 9);
    const c1 = hitboxAt(atk, 26.5, grid.beatSec, config) as CircleHit;
    expect(c1.x).toBeLessThan(c0.x);
    expect(c1.y).toBeCloseTo(0.3, 9);
    expect(hitboxAt(atk, 40, grid.beatSec, config)).toBeNull();
  });
});

describe('snap (拍の頭に向けて加速する補間)', () => {
  it('3 拍の移動で、最後の 1 拍に 70% 以上動く', () => {
    const path = [
      { beat: 0, x: 0, y: 0 },
      { beat: 3, x: 1, y: 0 },
    ];
    const at2 = pathPosAt(path, 2, 'snap').x;
    expect(1 - at2).toBeGreaterThanOrEqual(0.7);
    expect(easeIn(2 / 3)).toBeCloseTo(8 / 27, 9);
    // easeOut (v0) では逆に最初の 1 拍で大半を動く
    expect(pathPosAt(path, 1, 'easeOut').x).toBeGreaterThan(0.7);
  });

  it('振り付けの motion が攻撃に効き、攻撃ごとに上書きできる', () => {
    const choreo = makeChoreo([dashAttack({ path: [{ beat: 8, x: 0, y: 0.5 }, { beat: 10, x: 1, y: 0.5 }] })]);
    choreo.motion = 'snap';
    choreo.idle = undefined;
    expect(enemyPosAt(choreo, 9, { x: 0, y: 0.5 }).x).toBeCloseTo(0.125, 9);
    choreo.attacks[0].motion = 'easeOut';
    expect(enemyPosAt(choreo, 9, { x: 0, y: 0.5 }).x).toBeCloseTo(0.875, 9);
  });
});

describe('laser', () => {
  const laser = () => shotAttack({ type: 'laser', activeBeats: 0.25 });

  it('hitBeat から activeBeats の間だけ、target 方向へ画面端まで伸びる線分になる', () => {
    expect(hitboxAt(laser(), 25.9, grid.beatSec, config)).toBeNull();
    const h = hitboxAt(laser(), 26.1, grid.beatSec, config) as SegmentHit;
    expect(h.kind).toBe('segment');
    expect(h.a.x).toBeCloseTo(0.8, 9);
    expect(h.b.x).toBeLessThan(0); // 左の画面端 (余白ぶん外) まで
    expect(h.b.y).toBeCloseTo(0.3, 9);
    expect(hitboxAt(laser(), 26.3, grid.beatSec, config)).toBeNull();
  });

  it('activeBeats が 0 なら 0.25 拍とみなす', () => {
    const h = hitboxAt(shotAttack({ type: 'laser', activeBeats: 0 }), 26.2, grid.beatSec, config);
    expect(h).not.toBeNull();
  });

  it('線分に近い点は当たり、離れた点は当たらない', () => {
    expect(distToSegment({ x: 0.5, y: 0.31 }, { x: 0.8, y: 0.3 }, { x: 0, y: 0.3 })).toBeCloseTo(0.01, 9);
    expect(distToSegment({ x: 0.9, y: 0.3 }, { x: 0.8, y: 0.3 }, { x: 0, y: 0.3 })).toBeCloseTo(0.1, 9);
    const v = validateChoreo(makeChoreo([laser()]), grid, acceptance, config);
    expect(v).toEqual([]);
  });

  it('target の無い laser は shot-target', () => {
    const v = validateChoreo(makeChoreo([shotAttack({ type: 'laser', target: undefined })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('shot-target');
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
