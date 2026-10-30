import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import {
  applyBranch,
  branchEndBeat,
  branchStartBeat,
  enemyPosAt,
  hitboxAt,
  incomingDir,
  pathPosAt,
  resolveAttack,
  validateChoreo,
  type CircleHit,
  type SegmentHit,
} from './choreo';
import { distToSegment, easeIn } from './vec';
import { WORLD } from './world';
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

  it('burst は当たり拍の時点の位置で発生し、その後の戻りのキーフレームに影響されない', () => {
    const atk = burstAttack({
      hitBeat: 18,
      path: [
        { beat: 16, x: 0.2, y: 0.5 },
        { beat: 18, x: 0.5, y: 0.7 },
        { beat: 20, x: 0.8, y: 0.3 }, // 叩きつけた後に戻る
      ],
    });
    const h = hitboxAt(atk, 18.1, grid.beatSec, config) as CircleHit;
    expect(h.x).toBeCloseTo(0.5, 2);
    expect(h.y).toBeCloseTo(0.7, 2);
  });

  it('impactDelayBeats があると、当たりと burst の位置は hitBeat + 遅れの時点になる', () => {
    const atk = burstAttack({
      hitBeat: 18,
      impactDelayBeats: 0.125,
      path: [
        { beat: 16, x: 0.2, y: 0.3 },
        { beat: 18, x: 0.5, y: 0.2 }, // 音のなり始め: まだ上にいる
        { beat: 18.125, x: 0.5, y: 0.5 }, // 立ち上がりきった瞬間に着地
      ],
    });
    expect(hitboxAt(atk, 18.05, grid.beatSec, config)).toBeNull();
    const h = hitboxAt(atk, 18.2, grid.beatSec, config) as CircleHit;
    expect(h.y).toBeCloseTo(0.5, 9);
    expect(validateChoreo(makeChoreo([atk]), grid, acceptance, config)).toEqual([]);
    const v = validateChoreo(makeChoreo([burstAttack({ impactDelayBeats: 0.5 })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('impact-delay');
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

describe('incomingDir (相殺の「来る方向」)', () => {
  it('dash はその拍の進行方向。右から左へ突進していれば (-1, 0)', () => {
    const v = incomingDir(dashAttack(), 10.1, { x: 0.1, y: 0.5 }, grid.beatSec, config);
    expect(v.x).toBeCloseTo(-1, 9);
    expect(v.y).toBeCloseTo(0, 9);
  });

  it('dash が止まっていれば、プレイヤーから当たりの中心への向きで代える', () => {
    const stopped = dashAttack({ path: [{ beat: 8, x: 0.75, y: 0.5 }, { beat: 10, x: 0.3, y: 0.5 }] });
    const v = incomingDir(stopped, 10.2, { x: 0.3, y: 0.8 }, grid.beatSec, config);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(-1, 9);
  });

  it('laser は射線の向き (プレイヤーの位置に依らない)', () => {
    const laser = shotAttack({ type: 'laser', activeBeats: 0.25 });
    expect(incomingDir(laser, 26.1, { x: 0.4, y: 0.9 }, grid.beatSec, config)).toEqual({ x: -1, y: 0 });
  });

  it('burst は中心からプレイヤーへの向き', () => {
    const v = incomingDir(burstAttack(), 19.1, { x: 0.5, y: 0.7 }, grid.beatSec, config);
    expect(v.x).toBeCloseTo(0, 9);
    expect(v.y).toBeCloseTo(1, 9);
  });
});

describe('resolveAttack (自機狙い)', () => {
  it('burst の発生点が target になり、telegraphBeat 時点の位置は変わらず、戻りも同じだけ平行移動する', () => {
    const atk = burstAttack({
      aim: 'player',
      hitBeat: 18,
      path: [
        { beat: 16, x: 0.2, y: 0.5 },
        { beat: 18, x: 0.5, y: 0.5 },
        { beat: 20, x: 0.8, y: 0.3 },
      ],
    });
    const r = resolveAttack(atk, { x: 0.3, y: 0.45 }, config);
    const h = hitboxAt(r, 18.1, grid.beatSec, config) as CircleHit;
    expect(h.x).toBeCloseTo(0.3, 9);
    expect(h.y).toBeCloseTo(0.45, 9);
    expect(r.path[0]).toEqual({ beat: 16, x: 0.2, y: 0.5 });
    expect(r.path[2].x).toBeCloseTo(0.6, 9);
    expect(r.path[2].y).toBeCloseTo(0.25, 9);
    // 元の攻撃は変えない (純粋関数)
    expect(atk.path[1]).toEqual({ beat: 18, x: 0.5, y: 0.5 });
  });

  it('dash は突進の終点 (hitBeat の後の最初のキーフレーム) が target になり、予告開始時点の位置は変わらない', () => {
    const atk = dashAttack({ aim: 'player' });
    const r = resolveAttack(atk, { x: 0.5, y: 0.4 }, config);
    expect(pathPosAt(r.path, 8)).toEqual({ x: 0.75, y: 0.5 });
    expect(r.path[2].x).toBeCloseTo(0.5, 9);
    expect(r.path[2].y).toBeCloseTo(0.4, 9);
    // hitBeat の点も同じ delta (0.3, -0.1) で動く
    expect(r.path[1].x).toBeCloseTo(0.6, 9);
    expect(r.path[1].y).toBeCloseTo(0.4, 9);
  });

  it('laser / shot は本体を動かさず target だけ置き換わる', () => {
    const atk = shotAttack({ type: 'laser', activeBeats: 0.25, aim: 'player' });
    const r = resolveAttack(atk, { x: 0.1, y: 0.9 }, config);
    expect(r.target).toEqual({ x: 0.1, y: 0.9 });
    expect(r.path).toBe(atk.path);
    const h = hitboxAt(r, 26.1, grid.beatSec, config) as SegmentHit;
    expect(h.a.x).toBeCloseTo(0.8, 9);
    expect(h.b.y).toBeGreaterThan(h.a.y); // 下 (y が大きい側) へ向かう
  });

  it('世界の外にはみ出す狙いは x が [enemyRadius, 1 - enemyRadius]、y が [enemyRadius, 9/16 - enemyRadius] に収まる', () => {
    const r = resolveAttack(burstAttack({ aim: 'player', hitBeat: 18 }), { x: 0, y: 1 }, config);
    expect(r.path[1].x).toBeCloseTo(config.enemyRadius, 9);
    expect(r.path[1].y).toBeCloseTo(WORLD.h - config.enemyRadius, 9);
  });

  it('fixed (省略) は同じものを返す', () => {
    const atk = dashAttack();
    expect(resolveAttack(atk, { x: 0.1, y: 0.1 }, config)).toBe(atk);
    expect(resolveAttack(burstAttack({ aim: 'fixed' }), { x: 0.1, y: 0.1 }, config).path).toEqual(burstAttack().path);
  });

  it('自機狙いの検査: 予告が十分なら通る', () => {
    const choreo = makeChoreo([dashAttack({ aim: 'player' }), burstAttack({ aim: 'player' }), shotAttack({ aim: 'player' })]);
    expect(validateChoreo(choreo, grid, acceptance, config)).toEqual([]);
  });

  it('自機狙いの検査: 予告が短すぎて逃げ場に届かないと dodgeable (成り立たない位置の例つき)', () => {
    // 0.5 拍の予告では走れる距離 0.12 < 当たりの半径 0.2 + プレイヤー半径。
    // 発生点のキーフレーム (18.75) を telegraphBeat より後に置き、burst が実際に p を狙う幾何を通す
    const v = validateChoreo(
      makeChoreo([
        burstAttack({
          aim: 'player',
          telegraphBeat: 18.5,
          path: [
            { beat: 18.5, x: 0.2, y: 0.5 },
            { beat: 18.75, x: 0.5, y: 0.5 },
          ],
        }),
      ]),
      grid,
      acceptance,
      config,
    );
    const d = v.filter((x) => x.rule === 'dodgeable');
    expect(d.length).toBeGreaterThanOrEqual(1);
    expect(d.some((x) => /自機狙い: 予告開始時に \(\d\.\d{3}, \d\.\d{3}\) にいると/.test(x.message))).toBe(true);
  });
});

describe('applyBranch (結果で分岐する次の動き。v4)', () => {
  const rest = { x: 0.75, y: 0.28125 };
  const player = { x: 0.5, y: 0.3 };

  it('normal か無しなら同じものを返す', () => {
    const atk = dashAttack();
    expect(applyBranch(atk, undefined, player, { x: 1, y: 0 }, config, rest)).toBe(atk);
    expect(applyBranch(atk, { move: 'normal' }, player, { x: 1, y: 0 }, config, rest)).toBe(atk);
  });

  it('stop は path の最後の点に beats (既定 1) とどまる点を足す', () => {
    const atk = dashAttack();
    const r = applyBranch(atk, { move: 'stop' }, player, { x: 1, y: 0 }, config, rest);
    expect(branchStartBeat(atk)).toBe(10.5);
    expect(r.path.slice(-1)[0]).toEqual({ beat: 11.5, x: 0.2, y: 0.5 });
    expect(r.branchFromBeat).toBe(10.5);
    expect(r.branchMove).toBe('stop');
    expect(pathPosAt(r.path, 11, 'snap')).toEqual({ x: 0.2, y: 0.5 });
    expect(atk.path).toHaveLength(3); // 元は変えない
    expect(branchEndBeat(atk, { move: 'stop', beats: 2 })).toBe(12.5);
    expect(branchEndBeat(atk, undefined)).toBe(10.5);
  });

  it('approach は 0.5 拍で自機の正面 (facing の側、接触距離 × 1.5) へ寄り、beats の終わりまでとどまる', () => {
    const r = applyBranch(dashAttack(), { move: 'approach', beats: 2 }, player, { x: 0, y: 1 }, config, rest);
    const d = (config.playerRadius + config.enemyRadius) * 1.5;
    const added = r.path.slice(3);
    expect(added).toHaveLength(2);
    expect(added[0].beat).toBeCloseTo(11, 9);
    expect(added[0].x).toBeCloseTo(0.5, 9);
    expect(added[0].y).toBeCloseTo(0.3 + d, 9);
    expect(added[1].beat).toBeCloseTo(12.5, 9);
    expect(added[1].y).toBeCloseTo(0.3 + d, 9);
    expect(r.branchMove).toBe('approach');
  });

  it('retreat は休憩位置へ。世界の外に出る寄り先は収まる', () => {
    const r = applyBranch(dashAttack(), { move: 'retreat' }, player, { x: 1, y: 0 }, config, rest);
    expect(r.path.slice(-1)[0]).toEqual({ beat: 11.5, x: rest.x, y: rest.y });
    const edge = applyBranch(dashAttack(), { move: 'approach' }, { x: 0.99, y: 0.01 }, { x: 1, y: -1 }, config, rest);
    const p = edge.path.slice(-1)[0];
    expect(p.x).toBeCloseTo(1 - config.enemyRadius, 9);
    expect(p.y).toBeCloseTo(config.enemyRadius, 9);
  });

  it('検査: 分岐の開始が結果の確定より前なら after-order、終わりが次の予告開始より後なら after-overlap', () => {
    const ok = makeChoreo([dashAttack({ after: { handled: { move: 'stop', beats: 1 } } }), burstAttack()]);
    expect(validateChoreo(ok, grid, acceptance, config)).toEqual([]);
    // path が窓の終わり (10.25) で終わる: 結果の確定 (10.25 + 遅い側 50 ms = 10.35) より前
    const early = makeChoreo([
      dashAttack({ path: [{ beat: 8, x: 0.75, y: 0.5 }, { beat: 10, x: 0.3, y: 0.5 }, { beat: 10.25, x: 0.25, y: 0.5 }], after: { hit: { move: 'retreat' } } }),
      burstAttack(),
    ]);
    expect(validateChoreo(early, grid, acceptance, config).map((v) => v.rule)).toContain('after-order');
    const long = makeChoreo([dashAttack({ after: { handled: { move: 'stop', beats: 6 } } }), burstAttack()]);
    expect(validateChoreo(long, grid, acceptance, config).map((v) => v.rule)).toContain('after-overlap');
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

  it('世界 (幅 1 × 高さ 9/16) の外の位置は in-world (v2 までの正規化座標の y 0.9 は弾かれる)', () => {
    const v = validateChoreo(makeChoreo([dashAttack({ path: [{ beat: 8, x: 0.75, y: 0.9 }, { beat: 10, x: 0.3, y: 0.5 }] })]), grid, acceptance, config);
    expect(v.map((x) => x.rule)).toContain('in-world');
    expect(v.find((x) => x.rule === 'in-world')!.message).toContain('(0.75, 0.9)');
    const t = validateChoreo(makeChoreo([shotAttack({ target: { x: 1.2, y: 0.3 } })]), grid, acceptance, config);
    expect(t.map((x) => x.rule)).toContain('in-world');
    expect(validateChoreo(makeChoreo(), grid, acceptance, config)).toEqual([]);
  });
});
