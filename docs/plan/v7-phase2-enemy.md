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

## T4 (v7.json と README)。2026-11-09 に書いた。曲は candidate-4 (決闘者。docs/decisions/song-choice.md「選択」)
曲の形 (`npx tsx scripts/print-stages.ts`): 160 BPM (1 拍 0.375 秒)、24 小節 = 96 拍、36.0 秒。melody 66 音 (段 1 / 2 / 3 = 14 / 22 / 30)、フレーズは 1 小節ずつ 24 個 (phrase 番号 = 小節番号)。小節内の音の位置 (拍):
| 段 | 偶数小節 | 奇数小節 | 段の最後の小節 (大技) |
|---|---|---|---|
| 1 (小節 0〜7) | 0, 2 | 0 | 28, 29, 30 (長い音) |
| 2 (小節 8〜15) | 0, 1, 2 | 0, 2 | 60, 60.5, 61, 62 (長い音) |
| 3 (小節 16〜23) | 0, 0.5, 1.5, 2 | 0, 1, 2 | 92, 92.5, 93, 93.5, 94 (長い音) |

### 大技と、そこから派生する通常攻撃
大技「三連突きからの大上段」= 短い音の数だけ突き (連撃 `group`。2 発目以降は当たりの 1 拍前に狙い直す `aimBeat`) → 長い音で振り下ろし。突きの数は段で 2 → 3 → 4 と増える (曲の音型どおり)。
| 行動 | 型 | 形 | 由来 |
|---|---|---|---|
| 突き | `laser` + `length` 0.32、r 0.025、0.25 拍 | 剣先から短い線。1 発目は踏み込んでから (単発なら `approach`、連撃の先頭なら JSON の path に固定の踏み込み) | 大技の三連突き |
| 振り下ろし (大上段) | `laser` + `length` 0.6、r 0.07、0.5 拍、**`heavy`** | 長く太い線。大技の締め。両手放ちだけで相殺でき、片手の放ちは軽減 (slam と同じ規則) | 大技の大上段 |
| 振り下ろし (通常) | `laser` + `length` 0.45、r 0.045、0.25 拍 | 大上段の小さい版。通常の相殺ができる | 大上段の派生 |
| 踏み込み突き | `dash` r 0.03 (本体) | 剣を構えて突進。v6 の dash と同じ形 (出発 → 0.5 拍で自機 → 0.5 拍行き過ぎ) | 三連突きの「踏み込み」だけを取り出した |
| 薙ぎ払い | `sweep` 120〜150 度、length 0.3、r 0.03、0.5 拍 | 段 2 以降。剣の振りを横に | 大上段の派生 (段が進んで剣の振りが大きくなる) |
| 飛ぶ剣 | `shot` r 0.02 | 段 3 だけ。本人の「激しさが増すごとに剣自体を増やしてマジカルに」。浮いた剣を飛ばす | 段 3 の姿 (T5) と対応 |

### 小節の型 (起伏の形 = 右肩上がり)
| 段 | 偶数小節 | 奇数小節 | 大技の小節 |
|---|---|---|---|
| 1 | 突き (approach) → 振り下ろし (通常) | 踏み込み突き (dash) | 突き ×2 (連撃) → 大上段 |
| 2 | 突き (固定の踏み込み) → 突き (狙い直し) → 振り下ろし (通常。狙い直し) の連撃 | 踏み込み突き (dash) → 薙ぎ払い 120 度 | 突き ×3 → 大上段 |
| 3 | 飛ぶ剣 ×2 (2 発目は狙い直し) → 突き (固定の踏み込み) → 振り下ろし (通常) | 突き → 突き (狙い直し) → 薙ぎ払い 150 度 | 突き ×4 → 大上段 |
小節 0 は拍 0 の音に攻撃を置けない (予告が 2 拍要る) ので、拍 0 で構え、拍 2 の音に突き (v6 の phrase 0 と同じ扱い)。攻撃は 65 (66 音 − 拍 0)。大技は 3 回 (小節 7 / 15 / 23)。

### 位置の設計 (敵の動きがつながるように)
- 段ごとの構えの位置 G (段 1 x 0.60 / 段 2 0.58 / 段 3 0.56) と踏み込みの終点 L (G の 0.14 左)。y は小節ごとに 中央 / 上 0.09 / 下 0.09 を巡回させて単調にしない
- 攻撃の path は、前の攻撃の path の終点 (拍と位置) から始める。終点の後に戻りのキーフレーム (G へ) を書いて、次の攻撃の最初の点に合わせる。これで敵が飛ばない。dash と approach は自機の位置で path が変わるので、その後は次の攻撃の最初の点へ 1〜2 拍かけて滑る (v6 と同じ割り切り)
- 連撃の 2 発目以降は path を 1 点 (L) にし、踏み込みは先頭の path に固定で書く。`approach` (自機へ寄る) を連撃の中で使うと、各発の JSON の位置と実際の位置がずれて敵が揺れるため、approach は単発の突き (段 1 の偶数小節) だけに使う

### 仕組みの変更 (`heavy`)
- Attack に `heavy?: boolean` を足す。`isHeavy(atk)` = `type === 'slam' || heavy`。sim の相殺 (放ちだけが対象、片手は軽減、両手で相殺 + ジャスト率 + 反動) と被弾 (ダメージ 2、吹っ飛び) は `atk.type === 'slam'` を `isHeavy` に替える。吹っ飛びの向きは、円なら中心から外 (slam のまま)、線分なら線分の最寄り点から外 (線の上なら射線の向き)
- 要約の「大技 n 回」の行と phrase 表の列も `isHeavy` で見る。予告と当たりの色 (紫) も同じ
- 検査 `heavy-shape`: heavy は laser / sweep / slam にだけ付けられる (shot / dash / burst の heavy は違反)。dash と shot の相殺は本体や弾の形で見ていて、両手放ちの「叩き落とす」感じに合わないため
- 構え (pose.ts) は変えない (heavy の laser は laser の構え)

### 生成
`scripts/gen-choreo-v7.ts` が小節の型から assets/choreo/v7.json を書く (gen-candidates.ts と同じ考え。65 攻撃を手で書くより、型と位置の設計を 1 箇所に置く)。実行は `npm run gen:choreo-v7`。`validate-choreo` 違反なし、テスト: assets の検査 (v7.json は 65 攻撃、拍 0 以外の全メロディ音に hitBeat、大技 3 つは heavy の laser)、heavy の laser の sim (通常攻撃は対象外、片手で軽減、両手で相殺とダメージ、被弾 2 と吹っ飛び)

### 既定値 (Claude の決め)
| 項目 | 値 | 理由 |
|---|---|---|
| シーンの長さ `sceneSeconds` | 36 | 曲の長さ (96 拍 × 0.375 秒) |
| 敵 HP `enemyHp` | 40 | Phase 1 の既定 24 は「攻撃の数が倍」の読みだったが、実際は 65 攻撃 (v6 の 4.6 倍)。v6 の HP 12 / 14 攻撃 ≈ 0.86 を 65 に掛けると 56 だが、本人の「生き残りが基本目標で、削り切れたらストーリーが変わるくらい」(song-choice.md) に合わせ、削り切るのが難しい側の 40 にした |
| 狙い直しの拍 | 当たりの 1 拍前 | T3 の気づき: r 0.03 以下は 1 拍前で通り、0.5 拍前は隅で違反。r 0.07 の大上段も 1 拍前なら横に 0.094 動けばよく、走れる距離 0.18 の内 |
| 大上段の形 | length 0.6、r 0.07、0.5 拍 | slam の円 (r 0.16) ほど逃げ場を狭めないが、1 拍前の狙い直しで「歩いていれば当たらない」を無くす。両手放ちの見せ場 |
| 突きの踏み込み | 0.5 拍で 0.14 (固定) / approach 1 拍で最大 0.12 | 接触距離 × 1.5 は残す。長さ 0.32 の突きが自機に届く距離 |
| 反動耐性 `knockbackResist` | 0.6 | 剣士は踏ん張る。v6 の 0.5 より少しだけ敵側が動かない (ジャストなら敵 1 : 自機 0.6) |

## 完了記録 T3 (2026-11-07)
- 形式: `group` / `aimBeat` / `approach` / `track` / `length` / `type: "sweep"` + `sweepDeg` (src/core/choreo.ts、docs/choreo-format.md「連撃・踏み込み・薙ぎ払い・声部」)。グリッドに `trackOnsets`
- 仕組み: sim の `resolveStarted` が `aimBeat` でもう一度解決し直す (`reaimed`)。`applyApproach` が踏み込みのキーフレームを足す。`hitboxAt` に laser の `length` と sweep の回る線分。`sweepArc` で予告の扇。構えは laser と同じ
- 検査: `aim-beat` (範囲と「連撃の 2 発目以降だけ」)、`approach-shape`、`sweep-shape`、`track-known`。`dodgeable` の走れる距離は `aimBeat` から当たりまで
- テスト 243 件 (23 ファイル): src/core/choreo-v7.test.ts (形と検査 11 件)、src/core/sim-v7.test.ts (狙い直し・決定性・踏み込み 3 件)。`npm run build`、`validate-choreo v6.json` 違反なし (v6.json は新しい項目を使わないので v6.1 のまま)
- 気づき: 狙い直しの近さは検査が決める。細い弾 (r 0.03) は当たりの 1 拍前の狙い直しで通るが、0.5 拍前だと画面の隅で隣の格子点に逃げ場が無く違反。大きな弾 (r 0.12) は 1 拍前でも隅で違反。格子 (16 × 9、間隔 0.0625) の粗さが効いているので、振り付けで 0.5 拍の狙い直しを使いたくなったら、隅を避ける配置か検査の格子を細かくする判断が要る (検査は緩めない)
- 描画は sweep の予告を足しただけで、実物の見え方は v7.json を書いてからスクリーンショットで確認する

## 完了記録 T4 (2026-11-09)
- 振り付け: assets/choreo/v7.json (65 攻撃、連撃の束 14、大技 3。36 秒、敵 HP 40、反動耐性 0.6)。生成は `npm run gen:choreo-v7` (scripts/gen-choreo-v7.ts)。`validate-choreo` 違反なし。設計と対応表は assets/choreo/README.md
- 仕組み: Attack に `heavy` (大技の相殺規則を laser / sweep にも。`isHeavy`)。sim の相殺・被弾、要約の大技の行、予告の色が `isHeavy` を見る。線分の大技の吹っ飛びは最寄り点から外 (線の上なら射線の向き)。検査 `heavy-shape`。docs/choreo-format.md「大技の印 heavy」
- テスト 250 件 (24 ファイル): src/core/sim-heavy.test.ts (isHeavy と検査、v7.json の大上段で 通常攻撃は対象外 / 片手軽減 / 両手相殺 / 被弾 2 と吹っ飛び)、choreo-assets.test.ts (v7.json の 65 攻撃と全メロディ音、段ごとの型、大技の形)。`npm run build` 通過
- 変更した既定 (計画からのずれ): 150 度の薙ぎ払いの狙い直しは 1.5 拍前 (1 拍前だと `dodgeable` 違反。検査は緩めない)。敵 HP は 24 でなく 40 (理由は README)。小節 0 は拍 2 の突きだけ (拍 0 の音には予告が間に合わない)
- 見え方 (スクリーンショット) は T5 で姿と一緒に確かめる

## T5 (2 体目の姿) の詳細と完了記録 (2026-11-09)
本人の注文 (song-choice.md「選択」): 鎧が増えるのはそのままでよい、激しさが増すごとに剣を増やしてマジカルでも、体が激しく動いてもよい (激しい方が好き。プログラムで映えなければマジカル)。両方入れた: 段 3 は浮遊剣 (マジカル) と、段が進むほど前傾と脚の開きが大きくなる動き (exaggerate)。
- 形態: 段 1 = 剣 1 本の軽装 (兜と面頬、肩当て小) → 段 2 = 肩当て・胸当て・兜の飾り、奥の手に 2 本目の剣 → 段 3 = 背中に浮遊剣 3〜4 本 (進み 50% で 4 本目)、胸当ての光の線と面頬の光。段の中で連続に変わるのは 肩当ての大きさ (段 2)、光の強さと浮遊剣の広がり (段 3)、腕の太さと肩幅 (全体の進み)
- 動き: 1 組の鍵フレーム (guard / draw / thrust / raise / down / raiseBoth / downBoth / windup / follow / crouch / lunge / castReady / cast / low) を動きの名前 (thrust / chop / heavyChop / sweep / dash / shot) ごとの鍵の列で補間する。打点への移りは post の最初の 10〜15% (約 30 ms) に置き、当たりの発生とほぼ同時に腕が伸び切る。形態で鍵フレームを 2 組持つ代わりに、段で誇張する (骨組みが人型のまま変わらないので 1 組で足りる。試作の「人型用と最終形態用の 2 組」は獣への変化のためだった)
- 作法 (docs/decisions/v6-feedback.md 2026-11-07): 膝は両脚とも前 (すねの相対角 ≤ 0)、薙ぎ払いは引きから振り抜きまで一息で 120 度で止めて顔を背中側へ、腕を真上に上げる構えでは腕を薄くして顔を隠さない、攻撃の向きの上下で腕は向きのぶん・顔と上体は半分ほど追う (大上段は 0.5)、腕と脚は太さを持つ帯 (暗い縁)
- 仕組み: Choreo.figure (teardrop / duelist)、Attack.move、core/pose.ts の enemyMotion (pre / post)、core/stage.ts の stageAt、render/duelist.ts、canvas.ts の分岐。確認ページ figure.html (段 × 動きの表、動かす / 打点で止める / 位相を手で、向きと進みのスライダー。`?beat=…` で v7.json をその拍まで進めた実際の画面)
- 本人に見せる絵: figure.html の段 3 の行と、`?beat=28.6,29.1,30.1,31.2` (大技 1 回目) / `?beat=62.1,70.3,88.6,94.1` (段 2 の大技、段 3 の薙ぎ・飛ぶ剣・大技) の静止画。Claude の確認: 突きの短い帯、紫の大上段の帯と吹っ飛び、薙ぎの回る線、飛ぶ剣の弾、段ごとの姿の違いが見分けられた。全部の段を一度に作ったのは、骨組みが共通で段 1 と途中が段 3 の部品を減らすだけで済んだため (「最終形態を先に」の目的は手戻りを避けることで、それは満たしている)。本人の OK が出るまでは手直しの対象
- テスト 255 件 (25 ファイル): stage.test.ts (段と進み)、pose.test.ts (enemyMotion と moveOf)、choreo-assets.test.ts (v7.json の figure と move)。描画は目視 (上の静止画)
- 気づき: 公開は main への push で GitHub Actions (.github/workflows/deploy.yml) が行うので、T3 / T4 の push の時点で公開されていた。NEXT.md の「未公開」は誤りだった。figure.html の静止画モードは、拍を指定して実際の画面を再現できるので、今後の絵の確認は Chrome で遊ぶより先にこれを使う (決定的で、本人にも URL で見せられる)
