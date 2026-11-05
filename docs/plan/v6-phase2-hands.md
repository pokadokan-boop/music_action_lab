# v6 計画 Phase 2 セッション A: 両手独立 (L1 と手ごとの溜め、両手放ちの窓、記録と譜 3 行)
作成 2026-11-05。Phase 1 (docs/plan/v6-phase1.md、承認済み 2026-11-05) の T1〜T3。承認は不要 (CLAUDE.md「承認の扱い」)。接頭辞は `[作品]`。公開はセッション C の最後に 1 回。

## 事前条件
- v5 のコード (src/core/sim.ts の `handleAttackButton` / `playerAttack` / `tryCancel` / `breakCharge`、src/input/、src/audio/engine.ts の `startCharge` / `stopCharge`、src/render/canvas.ts の溜めの輪、src/core/log.ts と summary.ts)
- `npm test` 182 件 (17 ファイル) 通過

## T1 (L1 と手ごとの溜め)
- input: `InputState.attackLeftPressed?: boolean` (省略は false。既存のテストとの互換)。keyboard は F、gamepad は L1 (buttons[4])。InputManager が合成する
- sim: `attackLatch` と `charge` を手ごとに `hands: { right: HandState; left: HandState }` (`HandState = { latch, charge }`) にする。`handleAttackButton` を手ごとに呼ぶ (右 → 左の順)。通常攻撃・返し・溜め・放ちの規則は v5 のまま、扇・向き・ダメージは共通。`playerAttack` に手を渡し、attack / hit / cancel / charge / charge-break の記録に `hand` を持たせる
- 持続音: 音は手で区別しない。`lastChargeBegin` は「溜め状態の手が 0 → 1 になった」とき、`lastChargeEnd` は「1 → 0 になった」ときだけ立てる (片手が放っても他方が溜め中なら鳴り続ける)。被弾は両手とも解除 (`breakCharge` が両手を見る)
- 輪: 右手は右半分 (−90°〜90°)、左手は左半分。両手で 1 周。半径の伸びは手ごとの開始拍から

## T2 (両手放ちの窓)
- config に `doubleWindowBeats: 0.25`。sim に `lastRelease: { hand, beat } | null`。放ちが起きたとき、他方の手の放ちが `doubleWindowBeats` 以内にあれば、この放ちの attack に `double: true` と `pairMs` (2 つの放ちの差) を付け、`lastRelease` を消す。無ければ `lastRelease` を置き換える
- v6 セッション A では double は記録だけ (大技の相殺はセッション B)。通常の攻撃に対しては 2 つの放ちがそれぞれ今までどおり判定される (先の放ちが強い相殺、後の放ちは扇の命中)

## T3 (記録・要約・譜 3 行)
- 要約: 「攻撃 n 回 (...) 命中 m (通常 a / 返し b / 放ち c / 両手放ち d)」。行動の行に手の内訳 `右 r 左 l` を通常・返し・放ちのそれぞれに
- 譜: 1 小節 3 行 (右 / 左 / 足)。右と左の行は手ごとの 攻 返 放 溜 相 強、足の行は ス。凡例に行の意味を足す
- タイトルの操作説明と README「遊ぶ」の操作の行、concept.md「範囲」の入力の注記 (L1 / F を足す)

## テスト (src/core/sim-v6.test.ts、log.test.ts、summary.test.ts に足す)
1. 左手が溜め中でも右手で通常攻撃と相殺ができ、左手の溜めは切れない (v5.json の laser、攻撃 2)
2. 両手放ちの窓: 0.2 拍差の 2 つ目の放ちに double と pairMs、0.3 拍差では付かない。先の放ちが消費されて 3 つ目には付かない
3. 被弾で両手とも解除され、charge-break が手ごとに 1 件、lastChargeEnd は 1 回
4. 持続音の始まりと終わり: 右 → 左の順に溜めると lastChargeBegin は 1 回。右を放っても lastChargeEnd は立たず、左を放つと立つ
5. attackLeftPressed を省いた入力で既存のテストがそのまま通る (sim-v5.test.ts は `state.hands.right.charge` に書き換える)
6. 要約の命中の内訳と手の内訳、譜 3 行

## 既定値
| 項目 | 値 | 理由 |
|---|---|---|
| 左手のボタン | L1 (buttons[4]) / F | Phase 1 の既定。答え無し |
| 両手放ちの窓 | 0.25 拍 | Phase 1 |
| 手の処理順 | 右 → 左 | 同じ step で両手が押されたとき、記録の順を決めておく。音と演出は後の手のものが残る (まれ) |

## 成果物
- src/input/*、src/core/sim.ts、src/config.ts、src/core/log.ts、src/core/summary.ts、src/render/canvas.ts、src/ui/title.ts、src/main.ts、テスト、docs/concept.md の注記、README の操作の行
- この文書の末尾に完了記録 (v5 と同じ表)

## 完了記録 (2026-11-05)
| 項目 | 結果 |
|---|---|
| T1 入力 | `InputState.attackLeftPressed` (省略は false)。keyboard F、gamepad L1 (buttons[4])。InputManager が合成し main.ts が sim に渡す |
| T1 sim | `attackLatch` / `charge` を `hands: { right, left }` (`HandState = { latch, charge }`) に。`handleAttackButton(state, hand, pressed, ...)` を右 → 左の順に呼ぶ。attack / hit / cancel / charge / charge-break に `hand`。`armedHands(state)` を export |
| T1 持続音 | 手で区別しない。`lastChargeBegin` は溜め状態の手が 0 → 1、`lastChargeEnd` は 1 → 0 のときだけ。被弾は両手とも解除 (手ごとに charge-break)。engine.ts は変えていない (1 つの持続音のまま) |
| T1 輪 | 右手は右半分 (−90°〜90°)、左手は左半分。半径の伸びは手ごとの開始拍から。自動操作タブでは描画が間引かれるので (v5 と同じ)、両手の輪は本人が遊んで見る |
| T2 両手放ち | config `doubleWindowBeats: 0.25`。sim `lastRelease`。他方の手の放ちが窓の中なら attack と hit に `double: true`、attack に `pairMs`。消費されるので 3 つ目には付かない。同じ手の連続では付かない。大技の相殺はセッション B |
| T3 要約 | 「命中 m (通常 a / 返し b / 放ち c / 両手放ち d)」、行動の行に「右 r 左 l」、放ちに「両手放ち n」。譜は 1 小節 3 行 (右 / 左 / 足)。hand の無い記録 (v5 以前) は右手として読む |
| T3 文書 | タイトルの操作説明、README「遊ぶ」の操作の行、concept.md「範囲」の 2026-11-05 の注記 |
| テスト | sim-v6.test.ts 7 件 (両手の溜めと持続音の始まり・終わり、被弾で両手解除、省略時の互換、両手放ちの窓 0.2 / 0.3 拍、同じ手の連続、v5.json の laser を左手溜め中に右手で相殺)。log.test 1 件、summary.test 1 件を足し、v5 の期待値を 3 行の譜と手の内訳に直した。`npm test` 195 件 (18 ファイル)、`npm run build` (tsc + vite) 通過 |

変えなかったもの: 振り付け (v5.json のまま。大技はセッション B)、音 (engine.ts / pluck.ts。セッション C)、調整パネルの項目。同じ step で両手が押されたときの音と演出は後の手 (左) のものだけ残る (まれ。既定値の表)。
