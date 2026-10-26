// 手触りの調整値。変更は [作品] として commit する (docs/plan/v0-phase2-core.md「commit の規律」)。
// 単位: 位置は正規化座標 (0..1)、速度は 1 秒あたりの正規化距離、時間は秒、拍は拍番号。
export const config = {
  fixedDt: 1 / 120,
  playerSpeed: 0.6,
  playerRadius: 0.04,
  enemyRadius: 0.05,
  meleeRange: 0.12,
  rangeAssist: 0.06,
  shotSpeed: 2.4, // v0 の 0.8 は「判定がだらだら残る」(docs/decisions/v0-feedback.md 不満 2)
  shotRadius: 0.03,
  onBeatWindowBeats: 0.125,
  attackFanDeg: 90, // 攻撃の扇の全角 (度)。向き (aim) の前方 ±45 度に敵がいれば当たる (docs/plan/v2-phase2.md「既定値の決め」)
  enemyRestPos: { x: 0.75, y: 0.5 },
  playerStartPos: { x: 0.25, y: 0.5 },
  playerHp: 5,
  enemyHp: 12,
} as const;

export type Config = typeof config;
