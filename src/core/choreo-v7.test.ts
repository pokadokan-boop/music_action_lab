// v7 T3 (docs/plan/v7-phase2-enemy.md): 連撃の狙い直し (aimBeat)、踏み込み (approach)、薙ぎ払い (sweep)、laser の length、声部 (track) の形と検査
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { aimBeatOf, applyApproach, hitboxAt, incomingDir, isGroupLead, pathPosAt, resolveAttack, sweepArc, validateChoreo, type SegmentHit } from './choreo';
import { dist } from './vec';
import { dashAttack, makeChoreo, makeGrid, shotAttack, sweepAttack } from './test-fixtures';

const grid = makeGrid();
const rules = (choreo: ReturnType<typeof makeChoreo>) => validateChoreo(choreo, grid, acceptance, config).map((v) => v.rule);

describe('sweep (薙ぎ払い)', () => {
  it('狙いの向きを中心に sweepDeg を activeBeats かけて回る線分で、active の外は null', () => {
    const atk = sweepAttack();
    expect(hitboxAt(atk, 25.9, grid.beatSec, config)).toBeNull();
    const start = hitboxAt(atk, 26, grid.beatSec, config) as SegmentHit;
    const mid = hitboxAt(atk, 26.25, grid.beatSec, config) as SegmentHit;
    const end = hitboxAt(atk, 26.5, grid.beatSec, config) as SegmentHit;
    expect(start.kind).toBe('segment');
    expect(dist(start.a, start.b)).toBeCloseTo(0.2, 9);
    // 狙いは左 (180 度)。90 度を回るので 135 度 → 180 度 → 225 度
    const angle = (s: SegmentHit) => (Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180) / Math.PI;
    expect(angle(start)).toBeCloseTo(135, 6);
    expect(Math.abs(angle(mid))).toBeCloseTo(180, 6);
    expect(angle(end)).toBeCloseTo(-135, 6);
    expect(hitboxAt(atk, 26.6, grid.beatSec, config)).toBeNull();
    const arc = sweepArc(atk);
    expect(arc.length).toBe(0.2);
    expect(arc.origin).toEqual({ x: 0.6, y: 0.3 });
  });

  it('来る方向は発生点から自機へ。target が無ければ shot-target、length か sweepDeg が無ければ sweep-shape', () => {
    const atk = sweepAttack();
    const dir = incomingDir(atk, 26.2, { x: 0.4, y: 0.3 }, grid.beatSec, config);
    expect(dir.x).toBeCloseTo(-1, 9);
    expect(rules(makeChoreo([sweepAttack({ target: undefined })]))).toContain('shot-target');
    expect(rules(makeChoreo([sweepAttack({ length: undefined })]))).toContain('sweep-shape');
    expect(rules(makeChoreo([sweepAttack({ sweepDeg: 0 })]))).toContain('sweep-shape');
    expect(rules(makeChoreo([sweepAttack()]))).toEqual([]);
  });

  it('自機狙いなら target が自機の位置に置き換わる', () => {
    const r = resolveAttack(sweepAttack({ aim: 'player' }), { x: 0.5, y: 0.4 }, config);
    expect(r.target).toEqual({ x: 0.5, y: 0.4 });
    expect(r.path).toEqual(sweepAttack().path);
  });
});

describe('laser の length', () => {
  it('length があれば線をそこで切る (突き)。無ければ画面端まで', () => {
    const base = shotAttack({ type: 'laser', activeBeats: 0.25, target: { x: 0, y: 0.3 }, path: [{ beat: 24, x: 0.8, y: 0.3 }] });
    const long = hitboxAt(base, 26, grid.beatSec, config) as SegmentHit;
    const short = hitboxAt({ ...base, length: 0.15 }, 26, grid.beatSec, config) as SegmentHit;
    expect(dist(long.a, long.b)).toBeGreaterThan(0.8);
    expect(dist(short.a, short.b)).toBeCloseTo(0.15, 9);
    expect(rules(makeChoreo([{ ...base, length: 0 }]))).toContain('sweep-shape');
  });
});

describe('踏み込み (approach)', () => {
  const far = shotAttack({ aim: 'player', path: [{ beat: 24, x: 0.9, y: 0.3 }], approach: { beats: 1, distance: 0.3 } });

  it('当たりの beats 拍前の位置から狙い先へ最大 distance 寄り、自機との間に keep を残す。戻りのキーフレームは残る', () => {
    const r = resolveAttack({ ...far, path: [...far.path, { beat: 27, x: 0.9, y: 0.3 }] }, { x: 0.3, y: 0.3 }, config);
    // 24 (元) → 25 (踏み込みの始まり、同じ位置) → 26 (当たり。0.3 寄る) → 27 (戻り)
    expect(r.path.map((p) => p.beat)).toEqual([24, 25, 26, 27]);
    expect(r.path[1]).toMatchObject({ x: 0.9, y: 0.3 });
    expect(r.path[2].x).toBeCloseTo(0.6, 9);
    expect(r.path[3]).toMatchObject({ x: 0.9, y: 0.3 });
    expect(r.target).toEqual({ x: 0.3, y: 0.3 });

    // 近ければ keep (接触距離 × 1.5) の手前で止まる
    const near = resolveAttack(far, { x: 0.8, y: 0.3 }, config);
    const keep = (config.playerRadius + config.enemyRadius) * 1.5;
    expect(near.path[2].x).toBeCloseTo(0.8 + keep, 9);
  });

  it('fixed の攻撃でも JSON の target へ踏み込む。踏み込みの区間にあった元のキーフレームは捨てる', () => {
    const fixed = shotAttack({ path: [{ beat: 24, x: 0.9, y: 0.3 }, { beat: 25.5, x: 0.85, y: 0.3 }], target: { x: 0.2, y: 0.3 }, approach: { beats: 1, distance: 0.1, keep: 0 } });
    const r = applyApproach(fixed, fixed.target!, config);
    expect(r.path.map((p) => p.beat)).toEqual([24, 25, 26]);
    // 踏み込みの始まりは拍 25 の元の位置 (24 → 25.5 の補間の途中)。そこから 0.1 寄る
    const start = pathPosAt(fixed.path, 25);
    expect(r.path[1].x).toBeCloseTo(start.x, 9);
    expect(r.path[2].x).toBeCloseTo(start.x - 0.1, 6);
    expect(resolveAttack(fixed, { x: 0, y: 0 }, config).path).toEqual(r.path);
  });

  it('検査 approach-shape: dash には付けられず、beats と distance は正、当たり − beats は予告開始以降', () => {
    expect(rules(makeChoreo([dashAttack({ approach: { beats: 1, distance: 0.1 } })]))).toContain('approach-shape');
    expect(rules(makeChoreo([shotAttack({ approach: { beats: 0, distance: 0.1 } })]))).toContain('approach-shape');
    expect(rules(makeChoreo([shotAttack({ approach: { beats: 3, distance: 0.1 } })]))).toContain('approach-shape');
    expect(rules(makeChoreo([shotAttack({ approach: { beats: 1, distance: 0.1 } })]))).toEqual([]);
  });
});

describe('連撃の狙い直し (group / aimBeat)', () => {
  // 同じフレーズの 2 発: 1 発目 24.5 (telegraph 22.5)、2 発目 26 (telegraph 24、aimBeat 25 = 当たりの 1 拍前に狙い直す)
  const first = shotAttack({ hitBeat: 24.5, telegraphBeat: 22.5, group: 'combo', aim: 'player', path: [{ beat: 22.5, x: 0.5, y: 0.5 }] });
  const second = shotAttack({ hitBeat: 26, telegraphBeat: 24, group: 'combo', aim: 'player', aimBeat: 25, path: [{ beat: 24, x: 0.5, y: 0.5 }] });

  it('aimBeat の既定は telegraphBeat。1 発目と 2 発目の判定', () => {
    const choreo = makeChoreo([first, second]);
    expect(aimBeatOf(first)).toBe(22.5);
    expect(aimBeatOf(second)).toBe(25);
    expect(isGroupLead(choreo, choreo.attacks[0])).toBe(true);
    expect(isGroupLead(choreo, choreo.attacks[1])).toBe(false);
    expect(isGroupLead(makeChoreo([shotAttack()]), shotAttack())).toBe(true);
  });

  it('検査 aim-beat: 範囲の外、連撃の 1 発目や束の無い攻撃で telegraphBeat より後、は違反。2 発目以降なら通る', () => {
    expect(rules(makeChoreo([first, second]))).toEqual([]);
    expect(rules(makeChoreo([first, { ...second, aimBeat: 23.9 }]))).toContain('aim-beat');
    expect(rules(makeChoreo([first, { ...second, aimBeat: 26.1 }]))).toContain('aim-beat');
    expect(rules(makeChoreo([{ ...first, aimBeat: 23 }, second]))).toContain('aim-beat');
    expect(rules(makeChoreo([shotAttack({ aim: 'player', aimBeat: 25 })]))).toContain('aim-beat');
  });

  it('避けられる位置の検査は aimBeat から当たりまでの時間で見る (遅すぎる・大きすぎる狙い直しは違反)', () => {
    // 細い弾 (r 0.03) は 1 拍前の狙い直しで通る (走れる距離 0.6 × 0.5 秒 × 0.8 = 0.24)。
    // 0.5 拍前 (0.12) だと画面の隅にいたとき隣の格子点に逃げ場が無く違反。大きな弾 (r 0.12) は 1 拍前でも隅で違反
    expect(rules(makeChoreo([first, second]))).not.toContain('dodgeable');
    expect(rules(makeChoreo([first, { ...second, aimBeat: 25.5 }]))).toContain('dodgeable');
    const big = { ...second, hitbox: { shape: 'circle' as const, r: 0.12 } };
    expect(rules(makeChoreo([first, big]))).toContain('dodgeable');
  });
});

describe('声部 (track)', () => {
  it('track が melody 以外なら、その声部の音に hitBeat が乗っていればよい。無い声部は track-known', () => {
    // フィクスチャの bass は各フレーズの +0.5 と +2.5 に鳴る。26.5 は 8 分の格子には乗る (sub 0.5) ので、格子に乗らない 26.3 で見る
    const onBass = shotAttack({ hitBeat: 26.5, telegraphBeat: 24, track: 'bass' });
    expect(rules(makeChoreo([onBass]))).toEqual([]);
    const unknown = shotAttack({ track: 'lead-high' });
    expect(rules(makeChoreo([unknown]))).toContain('track-known');
    expect(grid.trackOnsets.bass).toContain(26.5);
  });
});
