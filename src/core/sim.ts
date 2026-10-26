// ゲームの状態遷移。純粋に state と入力と dt だけで進み、同じ入力列なら同じ記録になる。
import type { Config } from '../config';
import { attackMotion, enemyPosAt, hitDistance, hitboxAt, type Acceptance, type Choreo } from './choreo';
import { phraseAt, type Grid } from './grid';
import { GameLog, type BeatClass } from './log';
import { angleBetweenDeg, angleDeg, clamp, dist, inFan, normalize, type Vec } from './vec';

export interface InputState {
  move: Vec;
  attackPressed: boolean;
}

export interface SimState {
  t: number;
  beat: number;
  player: { x: number; y: number; hp: number };
  enemy: { x: number; y: number; hp: number };
  attackLatch: boolean;
  damagedBy: Set<number>;
  // 各攻撃の当たりが最初に有効になった sim 時刻 (処理の遅れの計測用)
  impactAt: Map<number, number>;
  log: GameLog;
  finished: boolean;
  // 直前の step で起きたこと (描画・効果音用。記録は log が持つ)
  lastAttackClass: BeatClass | null;
  lastHit: boolean;
  lastDamage: boolean;
  // 直前の step で攻撃したときの向き (単位ベクトル)。描画が扇を出すために使う
  lastAim: Vec | null;
}

export interface SimDeps {
  choreo: Choreo;
  grid: Grid;
  cfg: Config;
  acceptance: Acceptance;
}

export function createSim(deps: SimDeps): SimState {
  const { cfg, choreo } = deps;
  const enemy = enemyPosAt(choreo, 0, cfg.enemyRestPos);
  return {
    t: 0,
    beat: 0,
    player: { x: cfg.playerStartPos.x, y: cfg.playerStartPos.y, hp: cfg.playerHp },
    enemy: { x: enemy.x, y: enemy.y, hp: cfg.enemyHp },
    attackLatch: false,
    damagedBy: new Set(),
    impactAt: new Map(),
    log: new GameLog(),
    finished: false,
    lastAttackClass: null,
    lastHit: false,
    lastDamage: false,
    lastAim: null,
  };
}

export function step(state: SimState, input: InputState, dt: number, deps: SimDeps): void {
  const { cfg, grid, choreo, acceptance } = deps;
  state.lastAttackClass = null;
  state.lastHit = false;
  state.lastDamage = false;
  state.lastAim = null;
  if (state.finished) return;

  state.t += dt;
  state.beat = state.t / grid.beatSec;

  movePlayer(state, input, dt, cfg);

  const enemyPos = enemyPosAt(choreo, state.beat, cfg.enemyRestPos);
  state.enemy.x = enemyPos.x;
  state.enemy.y = enemyPos.y;

  if (input.attackPressed && !state.attackLatch) playerAttack(state, input, deps);
  state.attackLatch = input.attackPressed;

  checkDamage(state, deps);

  if (state.t >= acceptance.sceneSeconds) state.finished = true;
}

function movePlayer(state: SimState, input: InputState, dt: number, cfg: Config): void {
  const len = Math.hypot(input.move.x, input.move.y);
  const scale = len > 1 ? 1 / len : 1;
  state.player.x = clamp(state.player.x + input.move.x * scale * cfg.playerSpeed * dt, cfg.playerRadius, 1 - cfg.playerRadius);
  state.player.y = clamp(state.player.y + input.move.y * scale * cfg.playerSpeed * dt, cfg.playerRadius, 1 - cfg.playerRadius);
}

// 攻撃した拍の位置を分類する。表 (最寄りの拍)、裏 (最寄りの半拍)、それ以外
export function classifyBeat(beat: number, windowBeats: number): { cls: BeatClass; offsetBeats: number } {
  const nearest = Math.round(beat);
  const offsetBeats = beat - nearest;
  if (Math.abs(offsetBeats) <= windowBeats) return { cls: 'on', offsetBeats };
  const nearestHalf = Math.round(beat * 2) / 2;
  if (Math.abs(beat - nearestHalf) <= windowBeats) return { cls: 'off', offsetBeats };
  return { cls: 'miss', offsetBeats };
}

function playerAttack(state: SimState, input: InputState, deps: SimDeps): void {
  const { cfg, grid } = deps;
  const { cls, offsetBeats } = classifyBeat(state.beat, cfg.onBeatWindowBeats);
  state.lastAttackClass = cls;

  // 攻撃の向き: 移動入力があればその向き (丸めない)、無ければ敵の方向 (docs/plan/v2-phase2.md「既定値の決め」)
  const toEnemy: Vec = { x: state.enemy.x - state.player.x, y: state.enemy.y - state.player.y };
  const aim = Math.hypot(input.move.x, input.move.y) > 0 ? normalize(input.move) : normalize(toEnemy);
  state.lastAim = aim;
  // 扇の角度の条件だけを記録する (距離込みだと命中と同じ値になり、「向きが合っていたか」が読めなくなる)
  const enemyInFan = angleBetweenDeg(aim, toEnemy) <= cfg.attackFanDeg / 2;
  state.log.push({
    t: state.t,
    beat: state.beat,
    kind: 'attack',
    cls,
    offsetMs: offsetBeats * grid.beatSec * 1000,
    aimDeg: angleDeg(aim),
    enemyInFan,
  });

  // 命中: 射程 + 補正距離の内、かつ扇の中 (inFan は T5 の相殺と共用)。扇の外なら寄せもしない
  if (!inFan(state.player, aim, cfg.attackFanDeg / 2, cfg.meleeRange + cfg.rangeAssist, state.enemy)) return;
  const d = dist(state.player, state.enemy);
  if (d > cfg.meleeRange && d > 0) {
    // 射程内なら当たるように少し寄せる (concept.md「初期案」)
    const pull = (d - cfg.meleeRange) / d;
    state.player.x += (state.enemy.x - state.player.x) * pull;
    state.player.y += (state.enemy.y - state.player.y) * pull;
  }
  state.enemy.hp = Math.max(0, state.enemy.hp - 1);
  state.lastHit = true;
  state.log.push({ t: state.t, beat: state.beat, kind: 'hit', phrase: phraseAt(grid, state.beat)?.index });
}

function checkDamage(state: SimState, deps: SimDeps): void {
  const { cfg, grid, choreo } = deps;
  choreo.attacks.forEach((atk, idx) => {
    const c = hitboxAt(atk, state.beat, grid.beatSec, cfg, attackMotion(choreo, atk));
    if (!c) return;
    if (!state.impactAt.has(idx)) state.impactAt.set(idx, state.t);
    if (state.damagedBy.has(idx)) return;
    if (hitDistance(state.player, c) <= c.r + cfg.playerRadius) {
      state.damagedBy.add(idx);
      state.player.hp = Math.max(0, state.player.hp - 1);
      state.lastDamage = true;
      state.log.push({ t: state.t, beat: state.beat, kind: 'damage', attackIndex: idx, phrase: atk.phrase });
    }
  });
}

export function renderToText(state: SimState): string {
  return [
    `t=${state.t.toFixed(3)} beat=${state.beat.toFixed(2)} finished=${state.finished}`,
    `player x=${state.player.x.toFixed(3)} y=${state.player.y.toFixed(3)} hp=${state.player.hp}`,
    `enemy x=${state.enemy.x.toFixed(3)} y=${state.enemy.y.toFixed(3)} hp=${state.enemy.hp}`,
    `events=${state.log.events.length} damagedBy=[${[...state.damagedBy].join(',')}]`,
  ].join('\n');
}
