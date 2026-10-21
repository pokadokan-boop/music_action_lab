// 振り付け: 1 フレーズに 1 攻撃を拍グリッド上のキーフレームで書くデータ。形式は docs/choreo-format.md。
// ここでは型、時刻ごとの敵位置・当たり範囲、合否条件に照らした検査を持つ。DOM・Audio には触らない。
import type { Config } from '../config';
import type { Grid } from './grid';
import { dist, easeOut, lerpVec, type Vec } from './vec';

export type AttackType = 'dash' | 'burst' | 'shot';

export interface PathPoint extends Vec {
  beat: number;
}

export interface Attack {
  phrase: number;
  type: AttackType;
  telegraphBeat: number;
  hitBeat: number;
  activeBeats: number;
  path: PathPoint[];
  hitbox: { shape: 'circle'; r: number };
  // shot のみ。弾の向き先
  target?: Vec;
}

export interface Choreo {
  id: string;
  song: string;
  intent: string;
  idle?: { amplitude: number };
  attacks: Attack[];
}

export interface Acceptance {
  sceneSeconds: number;
  telegraphLeadBeatsMin: number;
  hitOnGridToleranceMs: number;
  gridSubdivision: number;
  dodgeTimeMarginRatio: number;
  determinism: { sameInputSameLogHash: boolean };
}

export type ViolationRule = 'path-order' | 'phrase-range' | 'telegraph-lead' | 'hit-on-grid' | 'dodgeable' | 'shot-target';

export interface Violation {
  attackIndex: number;
  rule: ViolationRule;
  message: string;
}

export interface Circle extends Vec {
  r: number;
}

export function pathPosAt(path: PathPoint[], beat: number): Vec {
  if (path.length === 0) throw new Error('pathPosAt: path が空');
  if (beat <= path[0].beat) return { x: path[0].x, y: path[0].y };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (beat <= b.beat) {
      const span = b.beat - a.beat;
      const t = span <= 0 ? 1 : (beat - a.beat) / span;
      return lerpVec(a, b, easeOut(t));
    }
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}

function sortedByPathStart(choreo: Choreo): Attack[] {
  return [...choreo.attacks].sort((a, b) => a.path[0].beat - b.path[0].beat);
}

// 攻撃中は path に従う。攻撃の間は前の終点から次の始点へイージングアウトで移る。
// 攻撃していない間は拍の頭で持ち上がり戻る小さな上下 (idle) を足し、拍を示す。
export function enemyPosAt(choreo: Choreo, beat: number, restPos: Vec): Vec {
  const attacks = sortedByPathStart(choreo);
  let prevEnd: PathPoint | undefined;
  for (const atk of attacks) {
    const first = atk.path[0];
    const last = atk.path[atk.path.length - 1];
    if (beat >= first.beat && beat <= last.beat) return pathPosAt(atk.path, beat);
    if (beat < first.beat) {
      const from: Vec = prevEnd ?? restPos;
      const fromBeat = prevEnd?.beat ?? first.beat - 2;
      const span = first.beat - fromBeat;
      const t = span <= 0 ? 1 : (beat - fromBeat) / span;
      return addIdle(lerpVec(from, first, easeOut(t)), beat, choreo);
    }
    prevEnd = last;
  }
  return addIdle(prevEnd ? { x: prevEnd.x, y: prevEnd.y } : restPos, beat, choreo);
}

function addIdle(pos: Vec, beat: number, choreo: Choreo): Vec {
  const amp = choreo.idle?.amplitude ?? 0;
  if (amp === 0) return pos;
  const frac = beat - Math.floor(beat);
  return { x: pos.x, y: pos.y - amp * (1 - easeOut(frac)) };
}

export interface ActiveWindow {
  startBeat: number;
  endBeat: number;
}

export function activeWindow(attack: Attack, beatSec: number, cfg: Config): ActiveWindow {
  if (attack.type === 'shot') {
    const origin = pathPosAt(attack.path, attack.hitBeat);
    const lifetimeSec = shotLifetimeSec(origin, shotDir(attack, origin), cfg);
    return { startBeat: attack.hitBeat, endBeat: attack.hitBeat + lifetimeSec / beatSec };
  }
  return { startBeat: attack.hitBeat, endBeat: attack.hitBeat + attack.activeBeats };
}

function shotDir(attack: Attack, origin: Vec): Vec {
  const target = attack.target ?? { x: 0, y: origin.y };
  const d = dist(origin, target);
  if (d === 0) return { x: -1, y: 0 };
  return { x: (target.x - origin.x) / d, y: (target.y - origin.y) / d };
}

// 弾が画面外 (半径ぶんの余白つき) に出るまでの秒数
function shotLifetimeSec(origin: Vec, dir: Vec, cfg: Config): number {
  const margin = cfg.shotRadius;
  let s = Infinity;
  if (dir.x > 0) s = Math.min(s, (1 + margin - origin.x) / dir.x);
  if (dir.x < 0) s = Math.min(s, (-margin - origin.x) / dir.x);
  if (dir.y > 0) s = Math.min(s, (1 + margin - origin.y) / dir.y);
  if (dir.y < 0) s = Math.min(s, (-margin - origin.y) / dir.y);
  if (!Number.isFinite(s)) s = 2;
  return s / cfg.shotSpeed;
}

// その拍に当たり判定があれば円を返す。無ければ null
export function hitboxAt(attack: Attack, beat: number, beatSec: number, cfg: Config): Circle | null {
  const w = activeWindow(attack, beatSec, cfg);
  if (beat < w.startBeat || beat > w.endBeat) return null;
  switch (attack.type) {
    case 'dash': {
      const p = pathPosAt(attack.path, beat);
      return { x: p.x, y: p.y, r: attack.hitbox.r };
    }
    case 'burst': {
      const last = attack.path[attack.path.length - 1];
      return { x: last.x, y: last.y, r: attack.hitbox.r };
    }
    case 'shot': {
      const origin = pathPosAt(attack.path, attack.hitBeat);
      const dir = shotDir(attack, origin);
      const s = (beat - attack.hitBeat) * beatSec * cfg.shotSpeed;
      return { x: origin.x + dir.x * s, y: origin.y + dir.y * s, r: attack.hitbox.r };
    }
  }
}

const DODGE_GRID = 12;
const DODGE_SAMPLE_DT_SEC = 1 / 120;

export function validateChoreo(choreo: Choreo, grid: Grid, acceptance: Acceptance, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const tolBeats = acceptance.hitOnGridToleranceMs / 1000 / grid.beatSec;
  const sub = 1 / acceptance.gridSubdivision;

  choreo.attacks.forEach((atk, i) => {
    if (atk.path.length === 0 || atk.path.some((p, k) => k > 0 && p.beat <= atk.path[k - 1].beat)) {
      out.push({ attackIndex: i, rule: 'path-order', message: 'path の beat は単調増加で 1 点以上' });
    }
    const phrase = grid.phrases[atk.phrase];
    if (!phrase) {
      out.push({ attackIndex: i, rule: 'phrase-range', message: `phrase ${atk.phrase} はグリッドに無い` });
    }
    if (atk.hitBeat - atk.telegraphBeat < acceptance.telegraphLeadBeatsMin - 1e-9) {
      out.push({
        attackIndex: i,
        rule: 'telegraph-lead',
        message: `予告が ${atk.hitBeat - atk.telegraphBeat} 拍前。${acceptance.telegraphLeadBeatsMin} 拍以上要る`,
      });
    }
    const onGrid = Math.abs(atk.hitBeat / sub - Math.round(atk.hitBeat / sub)) * sub <= tolBeats;
    const onNote = phrase?.noteBeats.some((nb) => Math.abs(nb - atk.hitBeat) <= tolBeats) ?? false;
    if (!onGrid && !onNote) {
      out.push({ attackIndex: i, rule: 'hit-on-grid', message: `hitBeat ${atk.hitBeat} が拍・半拍・フレーズの音に乗っていない` });
    }
    if (atk.type === 'shot' && !atk.target) {
      out.push({ attackIndex: i, rule: 'shot-target', message: 'shot には target が要る' });
    }
  });

  if (out.some((v) => v.rule === 'path-order' || v.rule === 'shot-target')) return out;
  out.push(...checkDodgeable(choreo, grid, acceptance, cfg));
  return out;
}

// 連続する当たり i-1, i について、i の active 区間で一度も当たらない格子点 p と
// i-1 で当たらない点 q があり、プレイヤー速度で余裕を残して q → p へ移れること
function checkDodgeable(choreo: Choreo, grid: Grid, acceptance: Acceptance, cfg: Config): Violation[] {
  const out: Violation[] = [];
  const order = choreo.attacks.map((_a, i) => i).sort((a, b) => choreo.attacks[a].hitBeat - choreo.attacks[b].hitBeat);
  const points = gridPoints();
  let prevSafe: Vec[] | null = null;
  let prevHitBeat = -Infinity;
  for (const idx of order) {
    const atk = choreo.attacks[idx];
    const safe = points.filter((p) => !everHit(p, atk, grid.beatSec, cfg));
    if (safe.length === 0) {
      out.push({ attackIndex: idx, rule: 'dodgeable', message: '当たらない位置が無い' });
    } else if (prevSafe) {
      const dtSec = (atk.hitBeat - prevHitBeat) * grid.beatSec;
      const reach = cfg.playerSpeed * dtSec * (1 - acceptance.dodgeTimeMarginRatio);
      const ok = safe.some((p) => prevSafe!.some((q) => dist(p, q) <= reach));
      if (!ok) {
        out.push({ attackIndex: idx, rule: 'dodgeable', message: `前の攻撃の安全位置から ${reach.toFixed(3)} 以内に安全位置が無い` });
      }
    }
    prevSafe = safe;
    prevHitBeat = atk.hitBeat;
  }
  return out;
}

function gridPoints(): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < DODGE_GRID; i++) {
    for (let j = 0; j < DODGE_GRID; j++) {
      pts.push({ x: (i + 0.5) / DODGE_GRID, y: (j + 0.5) / DODGE_GRID });
    }
  }
  return pts;
}

function everHit(p: Vec, atk: Attack, beatSec: number, cfg: Config): boolean {
  const w = activeWindow(atk, beatSec, cfg);
  const dtBeat = DODGE_SAMPLE_DT_SEC / beatSec;
  for (let b = w.startBeat; b <= w.endBeat + 1e-9; b += dtBeat) {
    const c = hitboxAt(atk, b, beatSec, cfg);
    if (c && dist(p, c) <= c.r + cfg.playerRadius) return true;
  }
  return false;
}
