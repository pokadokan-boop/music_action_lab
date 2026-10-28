# 振り付けの形式
敵の攻撃は MIDI から機械的に作らず、「このフレーズでこの攻撃」を拍グリッドに振り付けたデータとして書く (docs/concept.md「曲」)。型と検査は `src/core/choreo.ts`。

## ファイル
`assets/choreo/<id>.json`。1 ファイル = 1 本の振り付け。

```json
{
  "id": "example",
  "song": "candidate-2",
  "intent": "形式の例 (実物は assets/choreo/v2.json)",
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

## 位置と座標 (v3 T1。2026-10-29)
- 位置は世界座標で書く: 単位は「画面の幅」、x ∈ 0..1、y ∈ 0..0.5625 (= 9/16。画面は 16:9)、y = 0 が上。y の中央は 0.28125。定義は `src/core/world.ts`
- x と y は同じ長さの単位 (等方)。距離・角度・速度・半径は全てこの座標で測り、描画は x も y も画面の幅を掛けて写す。半径 r の円は画面でも円、扇は画面でも同じ角度の扇
- v2 までは x, y とも 0..1 の正規化座標だった。画面が 16:9 なので縦が 9/16 に潰れ、扇が横長になり向きが最大 16 度ずれていた (docs/decisions/v2-feedback.md F1〜F3)。古い書き方の y (0.5625 超) は検査 `in-world` で弾かれる。v2 → v3 の写し方は y × 9/16
- 時刻は拍番号 (小数可)。拍の長さは曲の BPM から決まる

## 項目
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

### 相殺 (v2 T5、v3 T3 で窓を接触基準にした。判定は `src/core/sim.ts` の `tryCancel`、幾何は `src/core/vec.ts` と `choreo.ts` の `contactBeat` / `incomingDir`)
プレイヤーの攻撃 (ボタン) は敵への命中と独立に、敵の攻撃の当たりを消す「相殺」の判定も行う (両方起きてよい)。対象は `uncancelable` でなく、まだ相殺されていない攻撃。「時刻」と「向き」がそろえば成立し、以後その攻撃の当たりは被弾判定と描画から消える。本体の動きは path どおり続く (弾かれる動きは入れない。docs/plan/v2-phase2.md「既定値の決め」)
- 時刻 (接触基準): 押した瞬間の自機の位置に、その攻撃の当たりが最初に触れる拍を接触拍 c とする (`contactBeat`。active 区間を 1/120 秒刻みで走査)。押下が [c − `cancelEarlyMs`, c + `cancelLateMs`] (src/config.ts。既定 前 100 ms・後 50 ms) にあれば時刻は合っている。dash は本体が自機に届く瞬間、laser と burst は窓の始まりが c になる。v2 の「当たりの有効窓そのもの」は、立ったままだと被弾より先に相殺できる幅が dash 27 ms・laser 8 ms しか無かった (docs/decisions/v2-feedback.md F5)
- 時刻 (かすめる相殺): 接触しない位置でも、押した瞬間に当たりの形が扇 (半径 `attackRadius`、角度 `attackFanDeg`) と重なれば時刻は合っている。円 (dash の本体、burst、shot) は中心までの距離 ≤ 半径 + r、かつ角度差 ≤ 扇の半角 + atan(r / 距離) (距離 0 なら重なる)。線分 (laser) は線分上を r / 2 刻みで取った点を半径 r の円に見立て、1 つでも扇と重なれば重なる
- 向き: 攻撃の向き `aim` が「来る方向の逆」から ± `cancelFacingDeg / 2` (既定 ±30 度) 以内。来る方向は、接触基準なら c の時点、かすめる相殺なら押した時点で、型ごとに dash = その拍の敵の進行方向 (1/120 秒前との差。止まっていればプレイヤーから当たりの中心への向き)、laser = 射線の向き、burst / shot = 当たりの中心からプレイヤーへの向き
- 被弾の取り消し: 遅い側 (c の後) で成立し、その攻撃で既に被弾していて、その被弾が押下の `cancelLateMs` 以内なら HP を 1 戻す。記録には `damage` を残したまま `damage-undone` を足す (「インチキかもしれないけど遅い側も緩めてほしい」v2 不満)
- 予告の輪は接触の基準 (`cancelAnchorBeat`: dash は突進の終点の拍、他は `hitBeat + impactDelayBeats`) で外側に届く。`hitBeat` は音のアンカーのまま検査に使う

成立しなかった押下は、敵の攻撃が近い (予告開始 〜 当たりの窓の終わり + 0.25 拍) ときだけ `cancel-miss` として記録し、理由を 1 つ付ける (`timing` = 接触拍はあるが窓の外 / `reach` = 接触せず扇とも重ならない / `angle` = 時刻は合うが向きが合わない)。複数の攻撃が近いときは最初の 1 件。何かを相殺できた押下は失敗として記録しない。結果の要約に「相殺 n 回、失敗 m 回 (タイミング a / 届かず b / 向き c)」の行、「被弾 n 回 (取り消し m 回)」、phrase 表に「相殺」列 (被弾列は「被弾」「取り消し」「-」) が出る

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
- `in-world`: path の全点と target が世界 (x 0〜1、y 0〜0.5625) の中にある。メッセージに外れた点の例と個数

かっこいいかどうかは検査しない。それは遊んだ人間の不満で判定する。
