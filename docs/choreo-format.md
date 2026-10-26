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
- `aim` (省略時 `fixed`): `player` なら予告開始 (`telegraphBeat`) の瞬間のプレイヤー位置を狙う (v2 T4)。その瞬間に 1 回だけ狙いを決め、以後は追尾しない。型ごとの置き換え方 (`resolveAttack`): `dash` は突進の終点 (`hitBeat` より後の最初のキーフレーム。無ければ最後) が、`burst` は発生点 (`hitBeat + impactDelayBeats` 時点の位置) がプレイヤー位置に重なるよう、`telegraphBeat` より後のキーフレームを平行移動する (`telegraphBeat` 以前の点は変えないので予告開始時の敵は飛ばない。戻りのキーフレームも同じだけ動く)。移動後の点は x, y とも `[enemyRadius, 1 - enemyRadius]` に収める。`shot` / `laser` は本体を動かさず `target` をプレイヤー位置に置き換える。通り過ぎる突進は、終点の後にキーフレームを足して書く (仕組みに通り過ぎ量は持たせない。docs/plan/v2-phase2.md「既定値の決め」)
- `uncancelable` (省略時 false): true なら相殺 (下記) の対象にならず、避けるしかない。相殺できる攻撃と避けるしかない攻撃を振り付けで混ぜるためのもの (v2 T5)
- `path`: 敵の移動キーフレーム。beat は単調増加。path の外側では端に留まる
- `motion` (振り付け全体、攻撃ごとに上書き可): 区間の補間。`easeOut` = 区間の最初が速い (`1 - (1 - t)^3`、v0 の既定)。`snap` = 拍の頭に向けて加速する (`t^3`)。3 拍の移動なら最後の 1 拍で 70% 動く (v1。docs/decisions/v0-feedback.md 不満 1)。予告の動く輪も同じ補間に従う
- `idle.amplitude`: 攻撃していない間、拍の頭で持ち上がって戻る上下の幅。拍を示すためのもの
- 攻撃と攻撃の間は、前の終点から次の始点へ振り付けの `motion` で移る

### 相殺 (v2 T5。判定は `src/core/sim.ts` の `tryCancel`、幾何は `src/core/vec.ts` と `choreo.ts` の `incomingDir`)
プレイヤーの攻撃 (ボタン) は敵への命中と独立に、敵の攻撃の当たりを消す「相殺」の判定も行う (両方起きてよい)。対象は、押した瞬間に当たりの形を持ち (`hitboxAt`)、`uncancelable` でなく、まだ相殺されていない攻撃。次の 2 つがそろえば成立し、以後その攻撃の当たりは被弾判定と描画から消える。本体の動きは path どおり続く (弾かれる動きは入れない。docs/plan/v2-phase2.md「既定値の決め」)
- 重なり: プレイヤーの扇 (半径 `meleeRange + rangeAssist`、角度 `attackFanDeg`。src/config.ts) と当たりの形が重なる。円 (dash の本体、burst、shot) は中心までの距離 ≤ 半径 + r、かつ角度差 ≤ 扇の半角 + atan(r / 距離) (距離 0 なら重なる)。線分 (laser) は線分上を r / 2 刻みで取った点を半径 r の円に見立て、1 つでも扇と重なれば重なる (線に沿って向いたときに線の延びる先が扇に入る。最も近い点だけで見ると、線の真横に立って線に沿って向いたとき重ならないため)
- 向き: 攻撃の向き `aim` が「来る方向の逆」から ± `cancelFacingDeg / 2` (src/config.ts。既定 ±30 度) 以内。来る方向は型ごとに、dash = その拍の敵の進行方向 (1/120 秒前との差。止まっていればプレイヤーから当たりの中心への向き)、laser = 射線の向き、burst / shot = 当たりの中心からプレイヤーへの向き
- 窓: 当たりの有効窓そのもの (`hitBeat + impactDelayBeats` から `activeBeats` の間)。前には広げない

成立しなかった押下は、敵の攻撃が近い (予告開始 〜 当たりの窓の終わり + 0.25 拍) ときだけ `cancel-miss` として記録し、理由を 1 つ付ける (優先順: `timing` = 窓の外 → `reach` = 扇と重ならない → `angle` = 向きが合わない)。複数の攻撃が近いときは最初の 1 件。何かを相殺できた押下は失敗として記録しない。結果の要約に「相殺 n 回、失敗 m 回 (タイミング a / 届かず b / 向き c)」の行と、phrase 表に「相殺」列が出る

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
  - `aim: "player"` の攻撃は予告開始時のプレイヤー位置で形が決まるので、12×12 の格子点 p の全てについて、p を狙った形に解決し、p から `playerSpeed × (impactBeat − telegraphBeat) × beatSec × (1 - dodgeTimeMarginRatio)` 以内に一度も当たらない格子点があることを見る。1 つでも成り立たない p があれば違反で、メッセージにその p の例を入れる。次の攻撃への連鎖 (前の攻撃の安全な点) には全 p の安全な点の和集合を使う。実際の p によっては和集合の一部しか安全でないので緩い側の割り切り (同時回避を見ないのと同じ扱い)
- `shot-target`: shot / laser に target がある
- `impact-delay`: impactDelayBeats が 0〜0.25 拍

かっこいいかどうかは検査しない。それは遊んだ人間の不満で判定する。
