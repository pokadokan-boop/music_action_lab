// 手触りの調整値。変更は [作品] として commit する (docs/decisions/commit-labels.md)。
// 単位: 位置は世界座標 (src/core/world.ts。x 0..1、y 0..0.5625、単位は画面の幅)、速度は 1 秒あたりの世界座標の距離、時間は秒、拍は拍番号。
import type { Vec } from './core/vec';

// 本人がタイトル画面の調整パネルで動かせる値 (v3 T5)。選んだ値は次の版の既定値 (defaultTuning) に反映する。パネルは残す
export interface Tuning {
  // 自機と敵の大きさの倍率 (基準は自機 0.04、敵 0.05)
  sizeScale: number;
  // 攻撃の扇の半径を、自機の直径の何倍にするか。命中と相殺で共通
  fanRatio: number;
  // 相殺の窓。自機との接触の瞬間より前 (早い側) と後 (遅い側) に何 ms まで受け付けるか
  cancelEarlyMs: number;
  cancelLateMs: number;
  // 相殺の向きの許容角 (度)。来る方向の逆から ± この半分以内を向いていれば相殺できる
  cancelFacingDeg: number;
}

// 既定値の理由は docs/plan/v3-phase1.md「既定値」(早い側 100 ms は原本「判定緩め +前 6 フレーム」、0.6 倍と 1.2 倍は本人の値)
export const defaultTuning: Tuning = {
  sizeScale: 0.6,
  fanRatio: 1.2,
  cancelEarlyMs: 100,
  cancelLateMs: 50,
  cancelFacingDeg: 60,
};

export const BASE_PLAYER_RADIUS = 0.04;
export const BASE_ENEMY_RADIUS = 0.05;

export interface Config {
  fixedDt: number;
  playerSpeed: number;
  playerRadius: number;
  enemyRadius: number;
  // 攻撃の扇の半径。命中 (敵の中心が扇の中) と相殺 (扇と当たりの形が重なる) で共通。描画も同じ半径 (判定に無い大きさを描かない)
  attackRadius: number;
  shotSpeed: number;
  shotRadius: number;
  onBeatWindowBeats: number;
  // 攻撃の扇の全角 (度)。向き (aim) の前方 ± 半分に敵がいれば当たる
  attackFanDeg: number;
  cancelFacingDeg: number;
  cancelEarlyMs: number;
  cancelLateMs: number;
  enemyRestPos: Vec;
  playerStartPos: Vec;
  playerHp: number;
  enemyHp: number;
  tuning: Tuning;
}

export function makeConfig(tuning: Tuning = defaultTuning): Config {
  const playerRadius = BASE_PLAYER_RADIUS * tuning.sizeScale;
  return {
    fixedDt: 1 / 120,
    playerSpeed: 0.6,
    playerRadius,
    enemyRadius: BASE_ENEMY_RADIUS * tuning.sizeScale,
    attackRadius: playerRadius * 2 * tuning.fanRatio,
    shotSpeed: 2.4, // v0 の 0.8 は「判定がだらだら残る」(docs/decisions/v0-feedback.md 不満 2)
    shotRadius: 0.03,
    onBeatWindowBeats: 0.125,
    attackFanDeg: 90,
    cancelFacingDeg: tuning.cancelFacingDeg,
    cancelEarlyMs: tuning.cancelEarlyMs,
    cancelLateMs: tuning.cancelLateMs,
    enemyRestPos: { x: 0.75, y: 0.28125 },
    playerStartPos: { x: 0.25, y: 0.28125 },
    playerHp: 5,
    enemyHp: 12,
    tuning,
  };
}

export const config: Config = makeConfig();
