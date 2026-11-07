# v7 Phase 2 セッション B: 行動の拡張・振り付け・2 体目の姿
作成 2026-11-07。Phase 1 (docs/plan/v7-phase1.md、承認済み) の T3〜T5。承認は要らない。T3 (形式と検査) は曲が決まる前に作れるので先に進め、T4 (v7.json) と T5 (姿と動き) は本人が候補を選んでから書き足す。前提: docs/choreo-format.md、src/core/choreo.ts (resolveAttack、hitboxAt、validateChoreo の dodgeable)、src/core/sim.ts (resolveStarted、checkDamage、tryCancel)、src/render/canvas.ts (drawTelegraph)、src/core/pose.ts。

## T3 (連撃・踏み込み・新しい型・声部の指定・検査)
本人の指摘 (2026-11-07): 「今の敵は追尾が弱くて、弾こうとしないと弾けない (動いていると当たらない)。複数攻撃を 1 連の攻撃としてそこだけ追尾をきつくする、踏み込みのある攻撃を入れる」。今の仕組みは「予告開始 (`telegraphBeat`、当たりの 2 拍以上前) の瞬間の自機の位置を 1 回だけ狙い、以後追わない」なので、予告が出てから歩けば当たらない。

### 足す項目 (Attack。全部省略可。docs/choreo-format.md に書く)
| 項目 | 意味 | 規則 |
|---|---|---|
| `group` | 連撃の束の名前。同じ名前の攻撃は 1 つの行動 (大技の「予告の音 → 当たりの音」や三連突き) | 束の中で hitBeat が最小のものが 1 発目 |
| `aimBeat` | 自機の位置を狙い直す拍 (省略時 `telegraphBeat`)。予告は `telegraphBeat` から出て、その時点の自機を暫定で狙い、`aimBeat` でもう一度今の自機の位置に狙いを合わせる | `telegraphBeat` ≤ `aimBeat` ≤ 当たりの発生拍。`telegraphBeat` より後に置けるのは `group` の 2 発目以降だけ (検査 `aim-beat`。「連撃の中だけ追尾をきつく」をデータの規則にする)。避けられる位置の検査は `aimBeat` から当たりまでの時間で走れる距離を使う |
| `approach` | 踏み込み `{ beats, distance, keep? }`。当たりの `beats` 拍前から、狙い先へ向かって最大 `distance` 寄る (自機との間は `keep`、省略時 接触距離 × 1.5 を残す)。shot / laser / sweep (本体が狙いで動かない型) 用。dash は path そのものが踏み込み | `beats` > 0、`distance` > 0、当たり − `beats` ≥ `telegraphBeat` (検査 `approach-shape`)。踏み込みの区間にあった元のキーフレームは捨て、当たりの後のキーフレーム (戻り) はそのまま |
| `track` | 攻撃が乗る声部 (トラック名。省略時 `melody`)。将来「複数の敵がそれぞれの声部に割り当てられる」拡張の口 | グリッドにその声部があること (検査 `track-known`)。`hit-on-grid` はその声部の音で見る |
| `length` | laser の線の長さの上限 (省略時 画面端まで)。短い laser = 突き・刺し | > 0 |
| `type: "sweep"` + `sweepDeg` + `length` | 薙ぎ払い。発生点から長さ `length` の線 (太さ `hitbox.r`) が、狙いの向きを中心に `sweepDeg` の角度を `activeBeats` かけて回る (負なら逆回り)。`target` 必須 | `length` > 0、`sweepDeg` ≠ 0 (検査 `sweep-shape`)。構えは laser と同じ。来る方向は発生点から自機へ (相殺は敵の方を向けば成立) |

### 実装
- src/core/choreo.ts: 型と項目、`hitboxAt` (laser の `length`、sweep の回る線分)、`sweepArc` (描画用)、`resolveAttack` (狙い直しと踏み込み `applyApproach`)、検査 4 つ、`dodgeable` の走れる距離に `aimBeat`
- src/core/grid.ts: `trackOnsets` (声部ごとの音の始まり)
- src/core/sim.ts: `resolveStarted` が `aimBeat` でもう一度解決する (`reaimed`)
- src/render/canvas.ts: sweep の予告 (扇の縁)。src/core/pose.ts: sweep は laser の構え
- テスト: src/core/choreo-v7.test.ts (形と検査)、src/core/sim-v7.test.ts (狙い直しと踏み込み)

### 既定値 (Claude の決め)
| 項目 | 既定値 | 理由 |
|---|---|---|
| 狙い直しの最短 | 検査で決める (aimBeat から当たりまでに安全位置へ走れること)。目安は 0.5 拍以上 | 数値を固定せず、避けられる位置の検査に任せる (検査は緩めない) |
| 踏み込みの間合い `keep` | 接触距離 × 1.5 | 分岐 approach の間合いと同じ |
| sweep の相殺の向き | 発生点から自機へ | 刃の接線で見ると向きが一瞬で変わり、押す側が合わせられない |

## T4 (v7.json と README) と T5 (2 体目の姿・動き・形態変化)
本人が候補を選んでから書く。T5 の出発点は prototypes/morph-slider.html、動きの作法は docs/decisions/v6-feedback.md 2026-11-07。最終形態を先に作って本人に見せる。

## 完了記録 T3 (2026-11-07)
- 形式: `group` / `aimBeat` / `approach` / `track` / `length` / `type: "sweep"` + `sweepDeg` (src/core/choreo.ts、docs/choreo-format.md「連撃・踏み込み・薙ぎ払い・声部」)。グリッドに `trackOnsets`
- 仕組み: sim の `resolveStarted` が `aimBeat` でもう一度解決し直す (`reaimed`)。`applyApproach` が踏み込みのキーフレームを足す。`hitboxAt` に laser の `length` と sweep の回る線分。`sweepArc` で予告の扇。構えは laser と同じ
- 検査: `aim-beat` (範囲と「連撃の 2 発目以降だけ」)、`approach-shape`、`sweep-shape`、`track-known`。`dodgeable` の走れる距離は `aimBeat` から当たりまで
- テスト 243 件 (23 ファイル): src/core/choreo-v7.test.ts (形と検査 11 件)、src/core/sim-v7.test.ts (狙い直し・決定性・踏み込み 3 件)。`npm run build`、`validate-choreo v6.json` 違反なし (v6.json は新しい項目を使わないので v6.1 のまま)
- 気づき: 狙い直しの近さは検査が決める。細い弾 (r 0.03) は当たりの 1 拍前の狙い直しで通るが、0.5 拍前だと画面の隅で隣の格子点に逃げ場が無く違反。大きな弾 (r 0.12) は 1 拍前でも隅で違反。格子 (16 × 9、間隔 0.0625) の粗さが効いているので、振り付けで 0.5 拍の狙い直しを使いたくなったら、隅を避ける配置か検査の格子を細かくする判断が要る (検査は緩めない)
- 描画は sweep の予告を足しただけで、実物の見え方は v7.json を書いてからスクリーンショットで確認する
