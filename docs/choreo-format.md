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
- `type`: `dash` は本体が path を動き、active 区間の本体が当たり。`burst` は hitBeat 時点の敵位置に円が発生し、予告は中心 → 中間 → 外側の同心円を拍ごとに出す (hitBeat の後に戻りのキーフレームを置いてよい)。`shot` は hitBeat に `target` へ向けて弾を出し、予告は射線。`laser` は hitBeat に `target` 方向へ画面端まで伸びる線 (太さ `hitbox.r`) が `activeBeats` の間だけ判定になり、予告は射線。shot / laser は `target` 必須
- `telegraphBeat`: 予告を出し始める拍。`hitBeat` より `telegraphLeadBeatsMin` (acceptance.json) 以上前
- `activeBeats`: 当たりが続く拍数 (dash / burst / laser)。shot は弾が画面外に出るまで。laser で 0 なら 0.25 拍とみなす
- `impactDelayBeats` (省略時 0、上限 0.25): 当たりの発生を `hitBeat` から遅らせる拍数。`hitBeat` は音のアンカーで検査に使い、実際の判定は `hitBeat + impactDelayBeats` に出る。音のアタックが立ち上がりきった瞬間に当てるためのもの (v1 の不満 3)。叩きつけなら、動き出しを hitBeat、着地のキーフレームを hitBeat + impactDelayBeats に置く
- `path`: 敵の移動キーフレーム。beat は単調増加。path の外側では端に留まる
- `motion` (振り付け全体、攻撃ごとに上書き可): 区間の補間。`easeOut` = 区間の最初が速い (`1 - (1 - t)^3`、v0 の既定)。`snap` = 拍の頭に向けて加速する (`t^3`)。3 拍の移動なら最後の 1 拍で 70% 動く (v1。docs/decisions/v0-feedback.md 不満 1)。予告の動く輪も同じ補間に従う
- `idle.amplitude`: 攻撃していない間、拍の頭で持ち上がって戻る上下の幅。拍を示すためのもの
- 攻撃と攻撃の間は、前の終点から次の始点へ振り付けの `motion` で移る

## 書き方の指針 (機械検査しない。v1 の不満から)
- キーフレームは曲の音の位置に置く。動きは音と同時に始め、0.25〜0.5 拍で終える
- 音の無いところでは止まる。音の無い間に滑らかに移動し続けると、曲と合っていないと感じる
- 「p-- p」のようなフレーズなら: 最初の音で最終地点の少し上まで動き、無音は止まり、最後の音のなり始めで叩きつけを始め、アタックが立ち上がりきった瞬間 (1/8 拍後) に当たりを出す。音より前に動き出さない
- 当たりは最後の音に置く。音の無い拍 (キックだけの拍など) に置くとずれて感じる
- 元の位置に戻る動きも音の位置 (次の小節頭のキックなど) に合わせ、burst なら hitBeat の後のキーフレームとして書く

## 機械検査 (`validateChoreo`)
acceptance.json の値を読む。違反は `Violation { attackIndex, rule, message }` で返る。
- `path-order`: path の beat が単調増加で 1 点以上
- `phrase-range`: phrase 番号がグリッドにある
- `telegraph-lead`: 予告の先行拍数
- `hit-on-grid`: hitBeat が 1/gridSubdivision 拍か、そのフレーズの音に `hitOnGridToleranceMs` 以内で一致
- `dodgeable`: 12×12 の格子点のうち、その攻撃の active 区間で一度も当たらない点があり、前の攻撃の安全な点から `playerSpeed × 間隔 × (1 - dodgeTimeMarginRatio)` 以内にある。playerSpeed は src/config.ts。active 区間が重なる攻撃どうしの同時回避は見ていない (v0 の割り切り)
- `shot-target`: shot / laser に target がある
- `impact-delay`: impactDelayBeats が 0〜0.25 拍

かっこいいかどうかは検査しない。それは遊んだ人間の不満で判定する。
