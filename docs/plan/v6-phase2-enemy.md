# v6 計画 Phase 2 セッション B: 大技と見分け (slam、片手軽減と両手相殺、予告の描き分け、v6.json)
作成 2026-11-05。Phase 1 (docs/plan/v6-phase1.md、承認済み 2026-11-05) の T4〜T6。承認は不要 (CLAUDE.md「承認の扱い」)。接頭辞は `[作品]`。公開はセッション C の最後に 1 回。

## 事前条件
- セッション A が完了している (docs/plan/v6-phase2-hands.md の完了記録): 両手の放ちに `double` / `pairMs`、`hand`
- src/core/choreo.ts の型・`hitboxAt`・`activeWindow`・`contactBeat`・`incomingDir`・`resolveAttack`・`validateChoreo`、src/core/sim.ts の `tryCancel`・`checkDamage`・`movePlayer`、src/render/canvas.ts の `drawTelegraph`

## T4 (slam の形式・検査・描画)
- 攻撃の型 `slam`。項目: `hitbox.r` (叩きつけの円)、`frameHalf` (円を囲む正方形の半幅)、`laserR` (4 辺のレーザーの太さ)。`telegraphBeat` が 1 音目 (飛び上がりと発射装置の射出)、`hitBeat` (+ `impactDelayBeats`) が 2 音目 (叩きつけと 4 辺)。狙いは burst と同じ (発生点を自機の位置へ平行移動)
- 当たりの形に `group` (複数の円・線分の集まり) を足す。slam の当たりは円 1 つ + 線分 4 つ (4 隅を結ぶ辺) の group。`hitDistance` は部品の最小、扇との重なりは部品のどれか、相殺の閃光の位置は円の中心
- 来る方向 (`incomingDir`): 円の中心から自機へ (burst と同じ)
- 検査: `slam-shape` (frameHalf と laserR があり、frameHalf > hitbox.r + laserR)。`dodgeable` は group の当たりで今の規則のまま (帯か枠の外に安全な格子点があること)。「全メロディ音に攻撃」のテストは hitBeat か slam の telegraphBeat で見る
- 描画: 予告は中心の同心円 (burst と同じ) + 発射装置 4 つが敵から 4 隅へ飛ぶ点 + 4 辺の淡い破線 (進むほど濃く) + 帯 (円の外・枠の内側) の薄い塗り。色は「両手」(紫)。当たりの間は円の塗りと 4 辺の太い線。構えは burst と同じ

## T5 (片手軽減・両手相殺・ジャスト率・反動)
- slam は通常攻撃・返しでは相殺の対象にならない (cancel-miss も記録しない。uncancelable と同じ扱い)
- 片手の放ち (double でない release) が時刻と向きを満たせば `mitigate` (記録 kind `mitigate`、attackIndex、hand)。相殺はしない。以後この攻撃の被ダメは ×0.8、吹っ飛びも ×0.8
- 両手放ち (double の release) が時刻と向きを満たせば相殺 (cancel に `double: true`、`just: j`)。j = 1 − |押下 − 当たりの発生拍| / 窓の片側 (早い側 cancelEarlyMs、遅い側 cancelLateMs) を 0〜1 に収める。敵に `damage.release × 2 × j`。反動の総量 `slam.recoil` (0.2) を敵 j / (R + j)、自機 R / (R + j) で分ける (R = choreo.knockbackResist、省略 0.5。R + j = 0 なら敵 0、自機 全部)。記録 cancel に `recoil: { enemy, player }`
- 被弾 (slam): ダメージ `slam.damage` (2)、mitigate 済みなら ×0.8。HP は小数を許す。自機は円の中心から外へ `slam.knockback` (0.2、mitigate なら ×0.8) を `slam.knockbackBeats` (0.5 拍) で等速に吹っ飛び、その間は入力 (移動・ステップ) を受けない。記録 damage に `damage` と `mitigated`
- 自機の反動 (両手相殺) も同じ吹っ飛びの仕組み (向きは円の中心から外、距離は配分ぶん)。敵の反動は振り付けの位置に乗せる差分 (向きは自機から敵へ、距離 × (1 − 経過 / 1 拍) で減衰)
- 要約: 「大技 n 回 (片手軽減 a / 両手相殺 b、ジャスト率 平均 x)」を buildSummary に (choreo から slam を数える)。phrase 表の相殺列は slam なら「両手相殺」「片手軽減」「-」

## T6 (予告の見分けと v6.json)
- dash: 道の破線は当たりのある区間 (impactBeat 〜 窓の終わり) だけ。構えへの移動 (予告開始 〜 impactBeat) は敵の残像 (少し前の位置に薄い円を 2 つ) で見せる
- shot: 射線は細かい点線、発射点に小さな輪。laser: 当たりの太さの帯 (半透明、進むほど濃く)。slam: T4
- `assets/choreo/v6.json`: v5.json の Z モチーフ (phrase 2, 5, 8) の laser を外し、burst を slam に (telegraphBeat は 1 音目の拍 8 / 24 / 40、hitBeat 10.5 / 26.5 / 42.5、frameHalf 0.3、laserR 0.04、uncancelable と chained を外す)。他は v5 のまま。14 攻撃。v5.json は外す (git 履歴に残る)
- テスト (choreo-assets / sim-v3 / sim-v5 / sim-v6) を v6.json に (攻撃番号: phrase 1 の laser は 2 のまま、phrase 3 の dash は 6 → 5)

## テスト (src/core/sim-slam.test.ts と既存の更新)
1. slam の当たり: 円の中は当たる、帯 (円の外・枠の内側) は当たらない、辺の上は当たる、枠の外は当たらない
2. 通常攻撃では相殺できず cancel-miss も出ない。片手の放ちで mitigate が記録され、被ダメ 1.6、吹っ飛び 0.16
3. 両手放ち (0.2 拍差) で cancel に double と just、敵の HP が 6 × j 減る、反動の配分 (R 0.5)。窓の中心で j ≈ 1
4. 被弾で吹っ飛び 0.2 を 0.5 拍で動き、その間スティックを無視する
5. R + j = 0 でも壊れない (純粋関数 `splitRecoil`)
6. v6.json: 14 攻撃、全メロディ音 (拍 0 以外) が hitBeat か slam の telegraphBeat、Z は slam、検査違反なし、立ったままだと 14 攻撃全てに被弾、相殺できる 11 攻撃は立ったまま相殺できる

## 既定値
| 項目 | 値 | 理由 |
|---|---|---|
| frameHalf / laserR | 0.3 / 0.04 | Phase 1。帯は 0.184〜0.236 (自機の半径込み) |
| slam.damage / mitigateRatio | 2 / 0.8 | Phase 1 (承認事項 3) |
| slam.knockback / knockbackBeats | 0.2 / 0.5 拍 | Phase 1 (承認事項 4) |
| slam.recoil / recoilDecayBeats | 0.2 / 1 拍 | Phase 1 |
| knockbackResist (R) | 0.5 (choreo の値) | Phase 1。敵ごとに変えられる |
| j の基準 | 当たりの発生拍 (impactBeat) | slam は円と 4 辺が同時に出るので、接触拍と同じ。帯に立っていて接触しない (かすめる相殺) ときも同じ基準で j が出る |
| 予告の色 (両手) | 紫系 | 黄 (相殺できる) と赤 (v5 まで。無くなる) と区別 |

## 成果物
- src/core/choreo.ts、vec.ts、sim.ts、log.ts、summary.ts、pose.ts、config.ts、render/canvas.ts、assets/choreo/v6.json、テスト、docs/choreo-format.md、assets/choreo/README.md、README の該当行
- この文書の末尾に完了記録

## 完了記録 (2026-11-05)
| 項目 | 結果 |
|---|---|
| T4 形式 | `type: 'slam'`、`frameHalf` / `laserR`、`choreo.knockbackResist` (省略 0.5)。当たりの形に `GroupHit` (円 1 + 辺 4)。`touches` (部品のどれかに触れる)、`primaryHit`、`slamShape`、`slamCenter`。`contactBeat` / `dodgeable` / `checkDamage` / 扇の重なりは touches と group に対応。検査 `slam-shape`。構えは burst と同じ |
| T4 描画 | 予告は紫 (telegraphDouble)。同心円 + 4 隅へ飛ぶ発射装置 + 4 辺の破線 (進むほど濃く太く) + 帯の薄い塗り (evenodd)。当たりの間は円の塗りと 4 辺の太い線 (`drawHitbox` が group を再帰)。相殺の破片も group に対応 |
| T5 相殺 | `tryCancel` は `{ cancelled, damageApplied }` を返す。slam は通常攻撃と返しでは対象外 (cancel-miss も無し)。片手の放ちで `mitigate` (記録、`state.mitigated`)。両手放ち (`double`) で相殺: `just` (`justRate`、当たりの発生拍を基準)、敵に `damage.release × 2 × j`、反動は `splitRecoil` (R + j = 0 を保護)。自機は `knockback` (0.5 拍、入力無視)、敵は `enemyRecoil` (差分、1 拍で減衰) |
| T5 被弾 | slam のダメージ 2 (軽減で 1.6)、HP は小数。`damageAmount` で取り消しも同じ量を戻す。円の中心から外へ 0.2 (軽減で 0.16) 吹っ飛ぶ。damage に `damage` / `mitigated` |
| T5 要約 | 「大技 n 回 (片手軽減 a / 両手相殺 b、ジャスト率 平均 x%)」(buildSummary、slam があるときだけ)。phrase 表の相殺列は slam なら 両手相殺 / 片手軽減 / 失敗 (理由) / - |
| T6 予告 | dash: 当たりのある区間だけの道 + 構えへ動く間の残像 2 つ。shot: 細かい点線 + 発射点の輪。laser: 当たりの太さの帯 (進むほど濃く)。burst: 同心円だけ |
| T6 振り付け | `assets/choreo/v6.json` (14 攻撃。Z は slam、telegraphBeat 8 / 24 / 40、frameHalf 0.3、laserR 0.04)。v5.json は外した。`validate-choreo v6.json` 違反なし。dodgeable は帯の格子点が無くても枠の外 (reach 0.55 > 0.364) で通る |
| テスト | sim-slam.test.ts 7 件 (形と接触拍、slam-shape、justRate、splitRecoil、通常攻撃で相殺不可と被弾 2 と吹っ飛び 0.2 で入力無視、片手軽減 1.6 / 0.16、両手相殺の j と 6j と配分と敵の反動の消え方、窓の外の両手放ちは timing)。choreo-assets / sim-v3 / sim-v5 / sim-v6 を v6.json に (攻撃 6 → 5)。`npm test` 200 件 (19 ファイル)、`npm run build` 通過 |

確認できていないこと: 予告 4 型と slam の見え方 (帯・発射装置・枠) は自動操作タブでは描画が間引かれて撮れない (v5 と同じ)。本人が遊んで見る。変えなかったもの: 音 (セッション C)、調整パネル、X / Y の振り付け。
