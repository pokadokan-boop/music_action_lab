# 振り付けの形式
敵の攻撃は MIDI から機械的に作らず、「このフレーズでこの攻撃」を拍グリッドに振り付けたデータとして書く (docs/concept.md「曲」)。型と検査は `src/core/choreo.ts`。

## ファイル
`assets/choreo/<id>.json`。1 ファイル = 1 本の振り付け。

```json
{
  "id": "a",
  "song": "candidate-2",
  "intent": "音の高低に合わせて敵が上下する",
  "idle": { "amplitude": 0.02 },
  "attacks": [
    {
      "phrase": 0, "type": "dash",
      "telegraphBeat": 8, "hitBeat": 10, "activeBeats": 0.25,
      "path": [{ "beat": 8, "x": 0.75, "y": 0.5 }, { "beat": 10, "x": 0.3, "y": 0.5 }],
      "hitbox": { "shape": "circle", "r": 0.06 }
    }
  ]
}
```

## 項目
- 位置は正規化座標 (x, y ∈ 0..1、y = 0 が上)。時刻は拍番号 (小数可)。拍の長さは曲の BPM から決まる
- `phrase`: 攻撃を割り当てるフレーズ番号 (`buildGrid` が切ったもの)。`hitBeat` はそのフレーズの音か、拍・半拍に乗っていること
- `type`: `dash` は本体が path を動き、active 区間の本体が当たり。`burst` は path 終点の円が hitBeat で発生し、予告は中心 → 中間 → 外側の同心円を拍ごとに出す。`shot` は hitBeat に `target` へ向けて弾を出し、予告は射線。shot は `target` 必須
- `telegraphBeat`: 予告を出し始める拍。`hitBeat` より `telegraphLeadBeatsMin` (acceptance.json) 以上前
- `activeBeats`: 当たりが続く拍数 (dash / burst)。shot は弾が画面外に出るまで
- `path`: 敵の移動キーフレーム。beat は単調増加。区間の補間はイージングアウト (`1 - (1 - t)^3`)。path の外側では端に留まる
- `idle.amplitude`: 攻撃していない間、拍の頭で持ち上がって戻る上下の幅。拍を示すためのもの
- 攻撃と攻撃の間は、前の終点から次の始点へイージングアウトで移る

## 機械検査 (`validateChoreo`)
acceptance.json の値を読む。違反は `Violation { attackIndex, rule, message }` で返る。
- `path-order`: path の beat が単調増加で 1 点以上
- `phrase-range`: phrase 番号がグリッドにある
- `telegraph-lead`: 予告の先行拍数
- `hit-on-grid`: hitBeat が 1/gridSubdivision 拍か、そのフレーズの音に `hitOnGridToleranceMs` 以内で一致
- `dodgeable`: 12×12 の格子点のうち、その攻撃の active 区間で一度も当たらない点があり、前の攻撃の安全な点から `playerSpeed × 間隔 × (1 - dodgeTimeMarginRatio)` 以内にある。playerSpeed は src/config.ts。active 区間が重なる攻撃どうしの同時回避は見ていない (v0 の割り切り)
- `shot-target`: shot に target がある

かっこいいかどうかは検査しない。それは遊んだ人間の不満で判定する。
