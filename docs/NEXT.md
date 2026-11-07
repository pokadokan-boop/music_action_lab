# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-07。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- 本人の選択待ち: 2 曲目の候補 (candidates.html の 4〜6。像・大技・起伏の形つき) から 1 つ。番号と理由を一言。答えは docs/decisions/song-choice.md「2 曲目の候補 > 選択」に書く
- 待ちの間にやったこと: 調査 C (docs/research/art-assets.md) と T3 (形式: 連撃の狙い直し group / aimBeat、踏み込み approach、薙ぎ払い sweep、laser の length、声部 track。docs/plan/v7-phase2-enemy.md の完了記録 T3、docs/choreo-format.md) は済み
- 曲が決まったら: docs/plan/v7-phase2-enemy.md に T4 / T5 の詳細を書き足してから実装。T4 (v7.json。大技を軸に通常攻撃を派生、連撃と踏み込みを起伏に合わせて置く。狙い直しは当たりの 1 拍前が目安で検査が決める。音高の案 1 / 2 を 2 曲目の調で成り立たせる: src/audio/pitch.ts の chord は F マイナー決め打ちなので、振り付けに調を持たせて移調する) → T5 (2 体目の姿。最終形態を先に作り本人に見せる。出発点は prototypes/morph-slider.html、動きの作法は docs/decisions/v6-feedback.md 2026-11-07)。読む順: docs/plan/v7-phase1.md → docs/plan/v7-phase2-enemy.md → docs/choreo-format.md → assets/choreo/v6.json と README → src/core/choreo.ts → src/render/figures.ts → prototypes/morph-slider.html
- 現状の確認: `npm test` (243 件、23 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v6.json`、`npx tsx scripts/print-stages.ts`

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6.1 + セッション A: 候補ページに 2 曲目の候補 3 曲、タイトルのシーンの口)。音作りのページ: 同 /sound.html。曲候補: 同 /candidates.html
- 最新 commit: [作品] v7 T3 (形式の拡張)。その前は [仕組み] 調査 C (docs/research/art-assets.md)、[作品] v7 セッション A (candidate-4 決闘者 / 5 結晶 / 6 火の鳥、lead の声、src/core/scene.ts、candidates.html、scripts/print-stages.ts)
- テスト: `npm test` 243 件 (23 ファイル) 通過。`npm run build` 通過。`validate-choreo v6.json` 違反なし
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 2 曲目の候補 (docs/decisions/song-choice.md): 4 = ドラムンベース風・右肩上がり・剣を持つ人型の決闘者・三連突きからの大上段 / 5 = テクノ・山型・多面体の結晶と衛星・衛星の収束格子 / 6 = 3 連のスウィング・自壊・炎をまとう鳥・急降下と火の輪。melody の音数 14 / 22 / 30、14 / 26 / 11、14 / 22 / 30。lead-high は最初から同じ音型
- 本人の決め (2026-11-07): v7 Phase 1 承認 / 承認は候補の選択だけ、行動の追加は Claude の裁量 / 曲は生成でよい / 像は縛らない、人型は「引き継ぐ側の体」/ 起伏の形は縛らない / 高音の線は最初から (オスティナート) / 2 体目の姿は最終形態を先に作って OK を取る / 動きの作法 (docs/decisions/v6-feedback.md 2026-11-07)
- 本人の決め (2026-11-06): v7 は A (2 曲目) / 40 秒 (20〜120 秒の範囲) / 音楽と視覚は物語的に地続き (concept.md「曲と絵の役割」) / 資産としての絵は調査のみ
- 調整パネルを保存していた場合、v6.1 の既定の窓は効かない。要約の先頭行が「窓 前150/後100」でなければタイトルの「既定値に戻す」
- 判断者: 最終実行 2026-11-07、削除 1、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-07.md)

## 本人に聞きたいこと
1. 2 曲目の候補 4〜6 のどれにするか (番号と理由を一言。像や大技が気に入らなければそれも)。答えが無くても進められる範囲: 調査 C と T3 (形式と検査)
2. v6.1 を遊んで、扇が被った攻撃が当たるようになったか、返しの踏み込みが当たる位置になったか (v6 不満.md に追記でよい)。答えが無くても進められる範囲: 全部
