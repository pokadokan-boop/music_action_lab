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
- `type`: `dash` は本体が path を動き、active 区間の本体が当たり。`burst` は hitBeat 時点の敵位置に円が発生し、予告は中心 → 中間 → 外側の同心円を拍ごとに出す (hitBeat の後に戻りのキーフレームを置いてよい)。`shot` は hitBeat に `target` へ向けて弾を出し、予告は射線。`laser` は hitBeat に `target` 方向へ画面端まで伸びる線 (太さ `hitbox.r`) が `activeBeats` の間だけ判定になり、予告は射線。shot / laser は `target` 必須。`slam` は大技 (下の「大技 slam」)
- `telegraphBeat`: 予告を出し始める拍。`hitBeat` より `telegraphLeadBeatsMin` (acceptance.json) 以上前
- `activeBeats`: 当たりが続く拍数 (dash / burst / laser)。shot は弾が画面外に出るまで。laser で 0 なら 0.25 拍とみなす
- `impactDelayBeats` (省略時 0、上限 0.25): 当たりの発生を `hitBeat` から遅らせる拍数。`hitBeat` は音のアンカーで検査に使い、実際の判定は `hitBeat + impactDelayBeats` に出る。音のアタックが立ち上がりきった瞬間に当てるためのもの (v1 の不満 3)。叩きつけなら、動き出しを hitBeat、着地のキーフレームを hitBeat + impactDelayBeats に置く
- `aim` (省略時 `fixed`): `player` なら予告開始 (`telegraphBeat`) の瞬間のプレイヤー位置を狙う (v2 T4)。その瞬間に 1 回だけ狙いを決め、以後は追尾しない。型ごとの置き換え方 (`resolveAttack`): `dash` は突進の終点 (`hitBeat` より後の最初のキーフレーム。無ければ最後) が、`burst` は発生点 (`hitBeat + impactDelayBeats` 時点の位置) がプレイヤー位置に重なるよう、`telegraphBeat` より後のキーフレームを平行移動する (`telegraphBeat` 以前の点は変えないので予告開始時の敵は飛ばない。戻りのキーフレームも同じだけ動く)。移動後の点は x, y とも `[enemyRadius, 1 - enemyRadius]` に収める。`shot` / `laser` は本体を動かさず `target` をプレイヤー位置に置き換える。通り過ぎる突進は、終点の後にキーフレームを足して書く (仕組みに通り過ぎ量は持たせない。docs/plan/v2-phase2.md「既定値の決め」)
- `uncancelable` (省略時 false): true なら相殺 (下記) の対象にならず、避けるしかない。相殺できる攻撃と避けるしかない攻撃を振り付けで混ぜるためのもの (v2 T5)
- `after` (省略可。v4 T1): 結果で分岐する敵の次の動き。`{ "handled": Branch, "hit": Branch }` で、`Branch = { "move": "normal" | "stop" | "approach" | "retreat", "beats"?: 数 }`。結果は当たりの窓の終わり + 遅い側の相殺の窓 (`cancelLateMs`) で確定し、相殺済みか被弾していなければ `handled`、被弾していれば `hit` (相殺できない burst も避ければ handled)。分岐は path の最後のキーフレームの拍から始まる: `stop` は最後の点に `beats` (既定 1) とどまる、`approach` は 0.5 拍で自機の正面 (最後に攻撃した向きの側。無ければ右) の接触距離 × 1.5 の点へ snap で寄り `beats` の終わりまでとどまる、`retreat` は 0.5 拍で休憩位置へ戻り同様、`normal` は変えない。寄る先は分岐を適用する瞬間の自機の位置で決め、追従しない。分岐の区間には拍の揺れ (idle) が乗る。意味づけ (何がリターンか) は v5 で決める (docs/plan/v4-phase1.md)
- `path`: 敵の移動キーフレーム。beat は単調増加。path の外側では端に留まる
- `knockbackResist` (振り付け全体。省略時 0.5): 敵の反動耐性 R (0〜1)。大技の両手相殺の反動の配分に使う (下の「大技 slam」)
- `motion` (振り付け全体、攻撃ごとに上書き可): 区間の補間。`easeOut` = 区間の最初が速い (`1 - (1 - t)^3`、v0 の既定)。`snap` = 拍の頭に向けて加速する (`t^3`)。3 拍の移動なら最後の 1 拍で 70% 動く (v1。docs/decisions/v0-feedback.md 不満 1)。予告の動く輪も同じ補間に従う
- `idle.amplitude`: 攻撃していない間、拍の頭で持ち上がって戻る上下の幅。拍を示すためのもの
- 攻撃と攻撃の間は、前の終点から次の始点へ振り付けの `motion` で移る

### 相殺 (v2 T5、v3 T3 で窓を接触基準にした。判定は `src/core/sim.ts` の `tryCancel`、幾何は `src/core/vec.ts` と `choreo.ts` の `contactBeat` / `incomingDir`)
プレイヤーの攻撃 (ボタン) は敵への命中と独立に、敵の攻撃の当たりを消す「相殺」の判定も行う (両方起きてよい)。対象は `uncancelable` でなく、まだ相殺されていない攻撃。「時刻」と「向き」がそろえば成立し、以後その攻撃の当たりは被弾判定と描画から消える。本体の動きは path どおり続く (弾かれる動きは入れない。docs/plan/v2-phase2.md「既定値の決め」)
- 時刻 (接触基準): 押した瞬間の自機の位置に、その攻撃の当たりが最初に触れる拍を接触拍 c とする (`contactBeat`。active 区間を 1/120 秒刻みで走査)。押下が [c − `cancelEarlyMs`, c + `cancelLateMs`] (src/config.ts。既定 前 150 ms・後 100 ms。v6.1 で本人の値に。v3〜v6 は前 100・後 50) にあれば時刻は合っている。dash は本体が自機に届く瞬間、laser と burst は窓の始まりが c になる。v2 の「当たりの有効窓そのもの」は、立ったままだと被弾より先に相殺できる幅が dash 27 ms・laser 8 ms しか無かった (docs/decisions/v2-feedback.md F5)
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
- `after-order`: `after` がある攻撃は、分岐の開始 (path の最後の拍) が結果の確定 (当たりの窓の終わり + `cancelLateMs`) 以降
- `after-overlap`: 分岐の終わり (開始 + beats) が次の攻撃の予告開始以前
- `slam-shape`: slam に `frameHalf` と `laserR` があり、`frameHalf > hitbox.r + laserR` (円の外に帯が残る)
- `aim-beat` / `approach-shape` / `sweep-shape` / `track-known`: v7 T3 (下の「連撃・踏み込み・薙ぎ払い・声部」)
- `heavy-shape`: `heavy` は laser / sweep / slam にだけ (下の「大技の印 heavy」)
- `follow-shape`: `followPrev` は group の 2 発目以降だけ (下の「予備動作の固定と、前の攻撃の終点に続く」)

## 構え (v4 T3)
描画は `src/core/pose.ts` が決めた構えの名前だけを見る。敵: 予告開始〜当たりの窓の終わりは攻撃の型 (`laser` / `burst` / `dash`。shot は laser)、分岐で足した区間は `stopped` / `approach` / `retreat`、他は `idle`。自機: 被弾 → 相殺 → 攻撃 → 構える (敵が stopped か approach) → 立つ、の優先順。絵は `src/render/figures.ts` (線と面の人型と雫形の敵。画像ファイルは使わない)

かっこいいかどうかは検査しない。それは遊んだ人間の不満で判定する。

## 連なる攻撃 (v5 T6。2026-11-02)
- `chained` (省略時 false): 同じフレーズの 2 つ目の攻撃に付ける印。検査 `chain-order`: chained の攻撃は、同じフレーズに自分より hitBeat が小さい chained でない攻撃を持つこと。予告の先行 (`telegraph-lead`) は chained でも 2 拍のまま (全てのメロディ音に 2 拍前の予告で置けたので、acceptance.json は変えていない。docs/plan/v5-phase2-enemy.md)
- 予告は時間的に重なってよい (前の攻撃の当たりの瞬間に次の予告が出る)。1 つ目の攻撃 (同じフレーズに chained の攻撃が続く) の動く輪は二重に描く (2 連の印。`leadsChain`)
- 敵の位置 (`enemyPosAt`): 攻撃の間の補間に使う「前の終点」は、拍が最大の終点。単一キーフレームの攻撃 (shot / laser の path が 1 点) を別の攻撃の path の中に入れ子にするときは、その点を外側の攻撃の同じ拍の位置に置く (敵が飛ばない)
- 構えと向き (`currentAttack`): 予告〜当たりの窓が重なる攻撃が複数あるときは、当たりの窓が先に終わる攻撃を採る
- 要約の phrase 表: 攻撃が 2 つのフレーズは 被弾 / 結果 / 相殺 の列を攻撃ごとに「/」で並べる (hitBeat の順)

## 大技 slam (v6 T4〜T5。2026-11-05。docs/plan/v6-phase1.md「承認に含めるもの」2〜5)
- `type: "slam"`。`telegraphBeat` が 1 音目 (敵が飛び上がり、発射装置 4 つが叩きつけの円を囲む正方形の 4 隅へ飛ぶ)、`hitBeat` (+ `impactDelayBeats`) が 2 音目 (叩きつけの円と 4 辺の極太レーザーが同時に出て、`activeBeats` の間続く)。1 音目は当たりを持たないが音に乗る。「全メロディ音に攻撃」のテスト (src/core/choreo-assets.test.ts) は hitBeat か slam の telegraphBeat で見る
- 項目: `hitbox.r` (円の半径)、`frameHalf` (正方形の半幅)、`laserR` (4 辺の太さ。半径)。狙い (`aim: "player"`) は burst と同じで、発生点 (`hitBeat + impactDelayBeats` 時点の位置) が自機の位置に重なるよう平行移動する。枠の隅は世界の外に出てよい (検査しない)
- 当たりの形は `group` (円 1 つ + 線分 4 つ。`src/core/choreo.ts` の `GroupHit`)。触れているかは部品のどれか (`touches`)、扇との重なりも部品のどれか、閃光の位置と来る方向 (円の中心から自機へ) は主の部品 (円)
- 逃げ場: 円の外かつ枠の内側の帯 (v6.json は 0.16 + 自機の半径 〜 0.3 − 0.04 − 自機の半径)、または撃たれる前に枠の外へ出る。`dodgeable` は group の当たりで今の規則のまま
- 相殺 (`sim.tryCancel`): 通常攻撃と返しでは対象にならず、cancel-miss も記録しない。片手の放ち (両手放ちでない release) が時刻と向きを満たせば `mitigate` (相殺はしない。以後その攻撃の被ダメと吹っ飛びが `cfg.slam.mitigateRatio` = 0.8 倍)。両手放ち (他方の手の放ちから `doubleWindowBeats` = 0.25 拍以内の release) が時刻と向きを満たせば相殺: cancel に `double: true` と ジャスト率 `just` (j = 1 − |押下 − 当たりの発生拍| / 窓の片側。中心で 1、端で 0)、敵に `damage.release × 2 × j`、反動の総量 `cfg.slam.recoil` (0.2) を敵 j / (R + j)、自機 R / (R + j) で配分 (R = `choreo.knockbackResist`、省略 0.5。R + j = 0 なら敵 0、自機 全部)。cancel に `recoil: { enemy, player }`
- 被弾: ダメージ `cfg.slam.damage` (2)、軽減済みなら 1.6 (HP は小数)。自機は円の中心から外へ `cfg.slam.knockback` (0.2、軽減なら 0.16) を `knockbackBeats` (0.5 拍) で等速に吹っ飛び、その間は移動とステップの入力を受けない。damage に `damage` と `mitigated`。遅い側の取り消しは受けた量ぶん HP を戻す
- 反動: 自機は吹っ飛びと同じ仕組み (向きは円の中心から外、距離は配分ぶん)。敵は振り付けの位置に乗せる差分 (向きは自機から敵へ、距離 × (1 − 経過 / `recoilDecayBeats` 1 拍))
- 描画: 予告の色は紫 (黄 = 相殺できる、赤 = uncancelable と区別)。中心の同心円 + 4 隅へ飛ぶ発射装置 + 4 辺の破線 (進むほど濃く) + 帯の薄い塗り。当たりの間は円の塗りと 4 辺の太い線。構えは burst と同じ
- 要約: 「大技 n 回 (片手軽減 a / 両手相殺 b、ジャスト率 平均 x%)」、phrase 表の相殺列は「両手相殺」「片手軽減」「失敗 (理由)」「-」

## 連撃・踏み込み・薙ぎ払い・声部 (v7 T3。2026-11-07。docs/plan/v7-phase2-enemy.md)
本人の指摘「今の敵は追尾が弱くて、弾こうとしないと弾けない (動いていると当たらない)。複数攻撃を 1 連の攻撃としてそこだけ追尾をきつくする、踏み込みのある攻撃を入れる」への形。全部省略可。
- `group`: 連撃の束の名前。同じ名前の攻撃は 1 つの行動 (大技の「予告の音 → 当たりの音」や三連突き)。束の中で hitBeat が最小のものが 1 発目 (`isGroupLead`)
- `aimBeat` (省略時 `telegraphBeat`): 自機の位置を狙い直す拍。予告は `telegraphBeat` から出て、その時点の自機を暫定で狙い、`aimBeat` でもう一度その瞬間の自機の位置に合わせる (sim の `resolveStarted`。元の攻撃から解決し直す)。以後は追わない。検査 `aim-beat`: `telegraphBeat` ≤ `aimBeat` ≤ 当たりの発生拍で、`telegraphBeat` より後に置けるのは `group` の 2 発目以降だけ (「連撃の中だけ追尾をきつく」をデータの規則にする)。`dodgeable` の走れる距離は `aimBeat` から当たりまでの時間で計算する (狙い直しが遅すぎれば違反になる)
- `approach`: 踏み込み `{ "beats", "distance", "keep"? }`。当たりの `beats` 拍前の位置から、狙い先へ向かって最大 `distance` 寄る。自機との間に `keep` (省略時 接触距離 × 1.5) を残す。shot / laser / sweep (本体が狙いで動かない型) 用で、dash は path そのものが踏み込み。踏み込みの区間にあった元のキーフレームは捨て、当たりより後のキーフレーム (戻り) はそのまま。`aim: "player"` なら狙い直した自機へ、fixed なら JSON の `target` へ (`applyApproach`)。検査 `approach-shape`: 型、`beats` > 0、`distance` > 0、当たり − `beats` ≥ `telegraphBeat`
- `track` (省略時 `melody`): 攻撃が乗る声部 (トラック名)。`hit-on-grid` はその声部の音で見る (グリッドの `trackOnsets`)。検査 `track-known`。将来「複数の敵がそれぞれの声部に割り当てられる」拡張の口 (実装する敵は 1 体)
- `length`: laser の線の長さの上限 (省略時 画面端まで)。短い laser = 突き・刺し。> 0
- `type: "sweep"`: 薙ぎ払い。発生点 (当たりの発生拍の敵の位置) から長さ `length` の線 (太さ `hitbox.r`) が、`target` の向きを中心に `sweepDeg` の角度 (負なら逆回り) を `activeBeats` かけて回る (`sweepArc`、`hitboxAt`)。`target` 必須 (自機狙いなら置き換わる)。検査 `sweep-shape`: `length` > 0、`sweepDeg` ≠ 0。構えは laser と同じ。来る方向 (相殺の向き) は発生点から自機へ (刃の接線で見ると向きが一瞬で変わり、押す側が合わせられない)。予告は回る範囲の扇の縁と回り始めの線

## 大技の印 `heavy` (v7 T4。2026-11-09。docs/plan/v7-phase2-enemy.md「T4」)
- `heavy` (省略時 false): true なら slam と同じ大技の規則になる。相殺は両手放ちだけ (片手の放ちは被ダメと吹っ飛びを `cfg.slam.mitigateRatio` 倍に軽減)、通常攻撃と返しでは対象にならず cancel-miss も記録しない、被弾は `cfg.slam.damage` (2) と吹っ飛び (円なら中心から外、線分なら最寄り点から外、線の上なら射線の向き)。予告と当たりの色は紫。要約の「大技 n 回」の行と phrase 表の列も heavy を数える。`isHeavy(atk)` = slam か heavy
- 付けられるのは laser / sweep / slam (検査 `heavy-shape`)。dash と shot の相殺は本体や弾の形で見ていて、両手放ちの「叩き落とす」感じに合わないため
- 使いどころ: v7 の大上段 (長さ 0.6、太さ r 0.07 の laser)。slam の円ほど逃げ場を狭めないので、1 拍前の狙い直しと組み合わせて「歩いていれば当たらない」を無くし、両手放ちの見せ場にする

## 敵の姿と動きの名前 (v7 T5。2026-11-09)
- 振り付け全体の `figure` (省略時 `teardrop`): 敵の姿。`teardrop` = 1 体目の雫形 (src/render/figures.ts)、`duelist` = 2 体目の決闘者 (src/render/duelist.ts)。描画 (canvas.ts) がこれで分岐する。判定には関係しない
- 攻撃の `move` (省略時は型から。`moveOf`): 姿が鍵フレームの組を選ぶための動きの名前。`thrust` (突き) / `chop` (振り下ろし) / `heavyChop` (大上段) / `sweep` / `dash` / `shot` / `slam` / `burst`。既定は laser の長さ 0.4 未満 = thrust、以上 = chop、heavy なら heavyChop、他は型の名前
- 位相 (`enemyMotion`、src/core/pose.ts): 予告開始 → 当たりの発生で `pre` 0 → 1、当たりの発生 → 当たりの窓の終わり + 0.5 拍で `post` 0 → 1。姿はこの 2 つで鍵フレーム (構え → 予備 → 打点 → 余韻 → 構え) を補間する。鍵フレームの時刻が予告の拍と当たりの拍に乗るのはこのため。今来ている攻撃が無ければ、窓が終わって 0.5 拍以内の攻撃 (余韻)。どれも無ければ構え
- 段 (`stageAt`、src/core/stage.ts): 8 小節で 1 段、3 段。段の切り替わりは小節の頭に揃う。段の中の進みは小節の進みで線形。姿の形態変化 (部品は段で一気に、大きさと光は進みで連続) に使う

## 予備動作の固定と、前の攻撃の終点に続く (v7.1。2026-11-09。docs/decisions/v7-feedback.md 不満 1)
- `windupFixed` (省略時 false): 自機狙い (dash / burst / slam) で平行移動するキーフレームを `hitBeat` より後に限る (省略時は `telegraphBeat` より後の全部)。予告から出発までの構えの位置が固定され、出発点が固定・着点が自機になる。前の攻撃の終点から構える path (v7) で、予告の瞬間に敵が跳ばないため。v6.json は付けない (v6.1 の記録を変えない)
- `followPrev` (省略時 false): 同じ `group` の直前の攻撃 (hitBeat が自分より小さい中で最大。`prevInGroup`) の、解決済みの path の終点に、この攻撃の path の最初の点を合わせて平行移動する (`applyFollow`)。動かすのは当たりの窓の終わりまでの点で、それより後 (次の構えへの戻り) は動かさない。sim が解決のたび (予告開始と狙い直し) に当てる。突進の後に着地した場所から薙ぎ払う、など。検査 `follow-shape`。`dodgeable` は JSON の位置で見る (approach と同じ割り切り)

## 予告の型ごとの印 (v6 T6。本人の不満「攻撃の判別がつきづらい」)
- dash: 道の破線は当たりのある区間 (impactBeat 〜 窓の終わり) だけ。構えへ動く間 (予告開始 〜 impactBeat) は少し前の位置に薄い円 (残像) を 2 つ置く。進路の全体は描かない
- shot: 細かい点線の射線と、発射点の小さな輪。laser: 当たりの太さの帯 (半透明、進むほど濃く)。burst: 同心円だけ。slam: 上
