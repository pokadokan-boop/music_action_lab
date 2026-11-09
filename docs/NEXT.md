# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-09。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- 本人の確認待ち: 決闘者の最終形態 (段 3) の絵と動きの OK。見る場所は https://pokadokan-boop.github.io/music_action_lab/figure.html (段 3 の行。「打点で止める」で打点、スライダーで向きと進み) と、同 `figure.html?beat=28.6,29.1,30.1,31.2` (大技 1 回目の実際の画面) / `?beat=62.1,70.3,88.6,94.1` (段 2 の大技、段 3 の薙ぎ・飛ぶ剣・大技)。雑なところ (頭・剣・鎧・浮遊剣・動き) を vault:音楽アクション/v7 不満.md に。直しは src/render/duelist.ts の POSES / MOTIONS / 部品の描画
- 待ちの間にできること: v7-phase1.md の完了記録 (T1〜T6 の結果と、計画からのずれ: 敵 HP 40、150 度の薙ぎの狙い直し 1.5 拍、全部の段を一度に作った理由)。figure.html の静止画モードで小節 1〜6 (段 1) と 9〜14 (段 2) の見え方も確かめる (まだ大技の前後しか見ていない)
- 不満が来たら: docs/decisions/v7-feedback.md に分解し、v7.1 で直す (v6 → v6.1 と同じ流れ)。読む順: docs/concept.md → v7 不満.md → 要約 → docs/decisions/v6-feedback.md
- 現状の確認: `npm test` (255 件、25 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v7.json`、`npm run gen:choreo-v7` (差分が出ないこと)

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ 。**main への push で GitHub Actions が公開する** (.github/workflows/deploy.yml) ので、push = 公開。T5 まで公開済み (push 後 2〜3 分で反映)。姿の確認: 同 /figure.html。音作り: 同 /sound.html。曲候補: 同 /candidates.html
- 最新 commit: [作品] v7 T5 (決闘者の姿、段と位相、figure.html)。その前は [仕組み] NEXT.md、[作品] v7 T4 (v7.json 65 攻撃、heavy)、[作品] v7: candidate-4 に決定、[作品] v7 T3
- テスト: `npm test` 255 件 (25 ファイル) 通過。`npm run build` 通過。`validate-choreo v7.json` / `v6.json` 違反なし
- 未 push: この区切りで push 済みなら無し (push は `gh auth switch -u pokadokan-boop` を先に。今のセッションで切り替え済み)
- v7 の中身: 2 曲目 candidate-4 (決闘者。160 BPM、24 小節 36 秒)、v7.json 65 攻撃 (大技 3 = 突き 2 / 3 / 4 → heavy の大上段)、敵 HP 40、反動耐性 0.6、figure duelist。設計は assets/choreo/README.md、形式は docs/choreo-format.md (heavy / figure / move / 位相 / 段)
- 不満の受け口: vault:音楽アクション/v7 不満.md (2026-11-09 作成。書いてほしいこと 7 点)
- 本人の決め (2026-11-07〜09): candidate-4 / 像: 鎧が増える + 剣を増やしてマジカル + 体が激しく動く (両方入れた) / 5 と 6 の不満と「楽器ごとにキャラ」は song-choice.md に記録 / 曲作りの指摘: 3 曲がリズム型・音色を共有していた (次の曲の作り方を変える材料)
- 本人の決め (2026-11-06〜07): v7 は A (2 曲目) / 40 秒前後 / 音楽と視覚は物語的に地続き / 資産としての絵は調査のみ / 承認は候補の選択だけ / 高音の線は最初から / 2 体目の姿は最終形態を先に作って OK を取る
- 調整パネルを保存していた場合、v6.1 の既定の窓は効かない。要約の先頭行が「窓 前150/後100」でなければタイトルの「既定値に戻す」
- 判断者: 最終実行 2026-11-07、削除 1、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-07.md)

## 本人に聞きたいこと
1. 決闘者の最終形態 (段 3) の絵と動きの OK、または雑なところ (figure.html の段 3 の行と `?beat=94.1` の実際の画面)。答えが無くても進められる範囲: v7-phase1.md の完了記録、段 1 / 2 の見え方の確認、不満が来てからの分解
2. 2 曲目を遊んでの不満 (v7 不満.md の「書いてほしいこと」)。答えが無くても進められる範囲: 同上
3. v6.1 (1 曲目) の当たりと踏み込みの直しの確認は、2 曲目の不満と一緒でよい
