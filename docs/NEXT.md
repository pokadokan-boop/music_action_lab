# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-09。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- T5 (2 体目の姿: 決闘者)。**最終形態 (段 3) を先に作り、スクリーンショットを本人に見せて OK を取ってから** 段 1 と途中を作る。読む順: docs/plan/v7-phase2-enemy.md (T4 の表と完了記録) → docs/decisions/song-choice.md「選択」(像への注文: 鎧が増える + 剣が増えてマジカル、激しい動きは試作して見せる) → docs/decisions/v6-feedback.md 2026-11-07 (動きの作法) → src/render/figures.ts → src/core/pose.ts → prototypes/morph-slider.html (鍵フレーム 2 組と向きの補正の出発点)
- 作るもの: Choreo に敵の姿の id (`figure`。v6.json は書かず雫形のまま)、拍 → 段 (0〜2) と段の中の進み (0〜1) の計算 (core にテスト)、figures.ts に決闘者 (腕と脚は太さを持つ帯。段 1 剣 1 本の人型 → 段 2 鎧と 2 本目 → 段 3 浮遊剣が増えて体も大きく動く)、攻撃の型ごとの動き (構え → 予備 → 打点 → 余韻 → 構え。突き = laser、振り下ろし = heavy / 通常の laser、薙ぎ = sweep、踏み込み突き = dash、飛ぶ剣 = shot) を攻撃の向きで補正。段の切り替わりは小節 8 / 16 の頭
- 終了条件: 公開 URL の 2 曲目で 3 段 × 動きが Chrome のスクリーンショットと GIF で確認でき、本人に最終形態の絵を見せた。T4 の見え方 (突きの短い帯、紫の大上段、薙ぎの扇、飛ぶ剣) も同じスクリーンショットで確かめる
- その後: 不満ノート vault:音楽アクション/v7 不満.md を作り (書いてほしいことは docs/plan/v7-phase1.md 完了条件「文書」)、README「遊ぶ (v7)」を姿の説明で補い、公開 (`npm run build` → gh-pages)、v7-phase1.md に完了記録
- 現状の確認: `npm test` (250 件、24 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v7.json`、`npm run gen:choreo-v7` (v7.json を作り直す。差分が出ないこと)

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6.1 + セッション A。**T3 / T4 は未公開**。公開は T5 の後に 1 回)。音作りのページ: 同 /sound.html。曲候補: 同 /candidates.html
- 最新 commit: [作品] v7 T4 (v7.json 65 攻撃、heavy、gen-choreo-v7.ts、sim-heavy.test.ts、文書)。その前は [作品] v7: candidate-4 に決定 (song-choice.md「選択」)、[作品] v7 T3 (形式の拡張)
- テスト: `npm test` 250 件 (24 ファイル) 通過。`npm run build` 通過。`validate-choreo v7.json` / `v6.json` 違反なし
- 未 push: この区切りで push 済みなら無し (push は `gh auth switch -u pokadokan-boop` を先に)
- 2 曲目: candidate-4 (決闘者。160 BPM、24 小節 36 秒、melody 66 音)。v7.json は 65 攻撃 (大技 3 = 突き 2 / 3 / 4 → heavy の大上段)、敵 HP 40、反動耐性 0.6。設計は assets/choreo/README.md
- 本人の決め (2026-11-07〜09): candidate-4 / 像: 鎧が増えるのはそのまま、激しさが増すごとに剣を増やしてマジカルでも、体が激しく動いてもよい (激しい方が好き。プログラムで映えなければマジカル路線) / 5 と 6 の不満と「楽器ごとにキャラ」の思いつきは song-choice.md に記録 (3 曲目以降の材料) / 曲作りの指摘: 3 曲がリズム型・音色を共有していた (次の曲の作り方を変える材料)
- 本人の決め (2026-11-06〜07): v7 は A (2 曲目) / 40 秒前後 / 音楽と視覚は物語的に地続き / 資産としての絵は調査のみ / 承認は候補の選択だけ、行動の追加は Claude の裁量 / 高音の線は最初から / 2 体目の姿は最終形態を先に作って OK を取る
- 調整パネルを保存していた場合、v6.1 の既定の窓は効かない。要約の先頭行が「窓 前150/後100」でなければタイトルの「既定値に戻す」
- 判断者: 最終実行 2026-11-07、削除 1、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-07.md)

## 本人に聞きたいこと
1. (T5 で出す) 決闘者の最終形態 (段 3) のスクリーンショットの OK。答えが無くても進められる範囲: 動きの鍵フレームと段の計算の実装、T4 の見え方の確認
2. v6.1 を遊んで、扇が被った攻撃が当たるようになったか、返しの踏み込みが当たる位置になったか (v6 不満.md に追記でよい)。答えが無くても進められる範囲: 全部
