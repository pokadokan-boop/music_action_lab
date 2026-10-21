# v0 計画 Phase 2 (後半): 振り付け・ゲーム本体・入力と記録・配置
作成 2026-10-21。Phase 1 は docs/plan/v0-phase1.md (承認済み)。前半 (T0 → T6 → T2 → T1) と共通の決め (座標・時計・振り付け形式・合否条件・commit 規律) は docs/plan/v0-phase2-core.md。この文書はセッション B (T7 → T3 → T4 → T5) の詳細。

セッション B の始めに読むもの: docs/concept.md、docs/plan/v0-phase2-core.md「共通の決め」、docs/choreo-format.md、docs/decisions/song-choice.md、src/core/ の型 (choreo.ts、sim.ts、log.ts)。

## T7 (振り付け 2 本)
事前条件: T1 で曲が選ばれ、song-choice.md に記録されている。T2 の validateChoreo が動く。

実装:
1. 選ばれた曲の grid を出し、phrases と各 phrase の noteBeats を一覧にする (scripts/print-grid.ts を作って表示。使い捨てでよいが commit する)
2. phrase ごとに「このフレーズでこの攻撃」を 2 通り書く。方針は分ける:
   - A: 音の高低に敵の上下を合わせる。メロディが上がる phrase は敵が上へ dash、下がれば下へ。長い音は burst、短い音の連なりは shot
   - B: 拍の表裏で使い分ける。表拍の音に dash、裏拍 (半拍) の音に shot、phrase の終わりに burst
   - どちらも最初の 1 phrase は攻撃なし (曲と敵の動きを見せる)。敵は攻撃していない間も拍ごとに小さく上下して拍を示す (choreo の `idle: { amplitude: 0.02 }` を形式に足す。T2 の形式に無い項目はここで追加し、docs/choreo-format.md も更新する)
3. 両方を `validateChoreo` に通し、Violation が空になるまで直す。直した内容は intent と一緒に `assets/choreo/README.md` に 2〜3 行ずつ書く (人間が不満を書くときの照合用)
4. テスト `choreo-assets.test.ts`: assets/choreo/*.json を全部読み、選ばれた曲の grid で validate して空であること

成果物: assets/choreo/a.json、b.json、assets/choreo/README.md、print-grid.ts、テスト。commit `[作品] 振り付け A と B`。

## T3 (ゲーム本体)
事前条件: T7。

実装:
1. `src/core/sim.ts` を埋める:
   - プレイヤー: 入力ベクトル × playerSpeed × dt で移動。画面内にクランプ。常に浮いている (重力なし)
   - 攻撃: 入力の立ち上がりで発生。敵との距離が `meleeRange + rangeAssist` 以内なら、`meleeRange` 以内になるまで敵の方向へ寄せてから当たり判定。命中で敵 HP -1。攻撃の拍位置を分類: 最寄りの拍から `onBeatWindowBeats` 以内 = `on`、最寄りの半拍から同窓以内 = `off`、それ以外 = `miss`。log に `attack` を記録 (offsetMs は最寄りの拍からのズレ)
   - 敵: `enemyPosAt(choreo, beat)`。`hitboxAt` が返す形とプレイヤー円が重なれば被弾。1 攻撃につき被弾は 1 回まで。プレイヤー HP -1。log に `damage` (attackIndex つき)
   - 終了: `now >= sceneSeconds`。HP が 0 でも 20 秒は続ける (手触りを最後まで見るため)。結果画面へ
2. `src/render/canvas.ts`: 四角と線で描く
   - プレイヤーは小さな四角、敵は少し大きい四角。両方に拍ごとの明滅 (拍の頭で明るく、イージングアウトで戻る) を入れてテンポを示す
   - 予告: dash は進路の線、burst は同心円 (拍の数だけ。中心 → 中間 → 外側へイージングアウトで動く)、shot は射線
   - HP: 画面下に細い線 2 本 (プレイヤー左、敵右)。HP が減ると線の色だけ変わる。数字は出さない
   - 拍の位置を示す薄い目盛りを画面上端に出す (小節 1 本、拍 4 本)
3. `src/audio/engine.ts` に `scheduleSfx(cls, atSec)`: `on` は高い短音、`off` は中くらい、`miss` は低くくぐもった音。曲と同じ時計で予約する
4. `src/ui/title.ts`: 曲名、A / B の選択 (左右で選びボタンで決定、キーボードは A / B キー)、操作説明 3 行。選択で AudioContext を作って開始
5. `src/main.ts`: タイトル → ゲーム → 結果の遷移。requestAnimationFrame ごとに `engine.now()` を読み、前回からの差分を advanceTime に渡して step、描画
6. `window.__game = { renderToText(): string, advanceTime(ms) }` を露出 (後の自動操作用。v0 では使わない)

成果物: 遊べる 1 画面。commit は `[仕組み] ゲーム本体の骨格と描画` と、config の数値を触った場合の `[作品] 手触りの初期値`。
確認: vitest が通る (sim の determinism を含む)。ブラウザでキーボード操作で 20 秒遊べることを自分で開いて確認する (Playwright は入れない。開いてコンソールにエラーが無いことまで)。

## T4 (入力と記録)
事前条件: T3。

実装:
1. `src/input/gamepad.ts`: 毎フレーム `navigator.getGamepads()` を読む。標準マッピングの `axes[0], axes[1]` を左スティック (デッドゾーン 0.2)、`buttons[0]` を攻撃、`buttons[9]` を決定にする。接続イベントで「DualSense 接続」をタイトルに表示
2. `src/input/keyboard.ts`: WASD と矢印で移動、Space と J で攻撃、Enter で決定
3. `src/input/index.ts`: 両方を合成して `InputState { move: {x, y}, attackPressed: boolean, confirm: boolean }` を返す
4. 記録 (T2 の GameLog を使う): 攻撃ごとの offsetMs と cls、被弾ごとの attackIndex と phrase、命中数。終了時に `summary()`:
   - 振り付け (A/B)、曲名、日時
   - 攻撃回数、on / off / miss の数、offsetMs の平均と標準偏差、早い側か遅い側か
   - phrase ごとの行: 攻撃 type、被弾したか、その phrase 中の攻撃回数
5. `src/ui/result.ts`: summary をテキストで表示。「コピー」ボタンで `navigator.clipboard.writeText`。「もう一度」でタイトルへ
6. `window.__game.renderToText()` は現在の state を 10 行以内のテキストにする

成果物: 入力層、記録層、結果画面。commit `[仕組み] 入力と記録`。
確認: vitest (summary の文字列テストを 1 つ足す)。DualSense を挿して動くことは人間に頼む (Claude の環境では確認できない)。

## T5 (配置と不満の受け口)
事前条件: T4。

実装:
1. push して Actions の完了を待ち、URL でタイトルが開くことを確認
2. vault に `音楽アクション/v0 不満.md` を作る (vault ルートは CLAUDE.local.md)。中身:
   - 冒頭に URL と、結果画面のコピーを貼る場所
   - 書き方: 1 回の不満につき 4 行以内。「振り付け (A/B)」「何が」「いつ (phrase 番号か場面)」「どう嫌か」。好きだった点は任意で `+` を頭に付けて書く
   - 日付見出しで区切る
3. README.md (リポジトリ) に次を書く:
   - 遊び方 (URL、DualSense かキーボード、20 秒)
   - 次のセッションの手順: docs/concept.md → vault の不満ノート → 結果画面のコピー、の順で読み、不満を v1 の変更に落とす。変更が concept.md の保護対象を侵すなら棄却する。曲・振り付け・config の変更は `[作品]`、それ以外は `[仕組み]`
   - 2 案比較の使い方: v1 は A / B のどちらかを直した版と、直す前を並べる
4. プロジェクトの CLAUDE.md「文書」に README と不満ノートの場所を追記

成果物: URL、不満ノート、README。commit `[仕組み] 配置と不満の受け口`。
確認: URL をスマホでも開いてタイトルが出ること (操作はできなくてよい) を人間に頼む。

## v0 完了の確認 (Phase 1「完了条件」との照合)
| 完了条件 | 確認方法 |
|---|---|
| URL で 20 秒遊べる | 人間が DualSense で 1 回遊ぶ |
| 攻撃がフレーズに振り付けられ拍に乗る | choreo-assets.test が通る |
| 振り付け 2 本を切り替えられる | タイトルで A / B |
| 終了時に記録がテキストで出る | 結果画面のコピーを不満ノートに貼れる |
| 不満を書く場所がある | vault の v0 不満.md |
| 合否条件がファイルにありテストが読む | acceptance.json と vitest |
| git 履歴で仕組みと作品が区別できる | `git log --oneline` の先頭タグ |

## 時間の見込みと切り方
- セッション B は T7 → T3 → T4 → T5 の順。T3 の途中で長くなったら、T3 の commit を切ってから終え、次のセッションはこの文書の T4 から再開する
- 人間の確認待ち (DualSense、スマホ) は T5 の後にまとめる。待ちの間に止まらない
