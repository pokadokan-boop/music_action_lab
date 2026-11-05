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

// 既定値の理由は docs/plan/v3-phase1.md「既定値」(早い側 100 ms は原本「判定緩め +前 6 フレーム」、0.6 倍は本人の値)。
// fanRatio 1.6 は本人が v3 の調整パネルで選んだ値 (vault:音楽アクション/v3 不満.md の要約、2026-10-30)
export const defaultTuning: Tuning = {
  sizeScale: 0.6,
  fanRatio: 1.6,
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
  // v5: プレイヤーの行動 (docs/plan/v5-phase2-player.md「既定値」)
  // ステップ: 回避ボタンで stepDistance を stepBeats 拍で等速に動く。始まって stepRetriggerBeats 以上たてば次の押下で置き換わる。
  // 拍の判定は 16 分の格子に ±stepWindowMs
  stepBeats: number;
  stepDistance: number;
  stepRetriggerBeats: number;
  stepWindowMs: number;
  // 溜め: 攻撃を押し続けて chargeThresholdBeats を超えると溜め状態。持続音は chargeFullBeats で上がり切る
  chargeThresholdBeats: number;
  chargeFullBeats: number;
  // 返し: 相殺から riposteWindowBeats 以内の押下。スティック入力があれば lungeDistance 踏み込む
  riposteWindowBeats: number;
  lungeDistance: number;
  // ダメージ (敵 HP 12)。release は溜めの放ちで、強い相殺 (放ちで相殺が成立) も同じ値
  damage: { normal: number; riposte: number; release: number };
  // 両手放ち (v6 T2): 片方の手の放ちから doubleWindowBeats 以内にもう片方の手が放てば「両手放ち」(記録に double)
  doubleWindowBeats: number;
  // 大技 slam (v6 T5。docs/plan/v6-phase1.md「承認に含めるもの」3〜4): 被ダメ、片手の放ちで軽減する倍率、被弾の吹っ飛び (距離と拍数)、
  // 両手相殺の反動の総量と敵の反動が消える拍数
  slam: { damage: number; mitigateRatio: number; knockback: number; knockbackBeats: number; recoil: number; recoilDecayBeats: number };
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
    stepBeats: 0.5,
    stepDistance: 0.18, // 1 歩で burst の半径 0.16 の中心から外へ。速さ 0.84/秒 (素の移動の 1.4 倍)
    stepRetriggerBeats: 0.25,
    stepWindowMs: 40,
    chargeThresholdBeats: 0.5,
    chargeFullBeats: 2,
    riposteWindowBeats: 1,
    lungeDistance: 0.1,
    damage: { normal: 1, riposte: 1, release: 3 },
    doubleWindowBeats: 0.25, // 両手の同時押しの散らばり (数十 ms) を許し、16 分より広げない (docs/plan/v6-phase1.md「既定値」)
    slam: { damage: 2, mitigateRatio: 0.8, knockback: 0.2, knockbackBeats: 0.5, recoil: 0.2, recoilDecayBeats: 1 },
  };
}

export const config: Config = makeConfig();
