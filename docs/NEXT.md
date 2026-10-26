# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-27。セッションの終わりに Claude が書き直す (書き方は CLAUDE.md「セッションの終わり方」)。

## 次の 1 手
- v2 は完了 (docs/plan/v2-phase1.md「完了記録」)。次は本人が v2 を遊んで不満ノートに書くのを待つ。不満が来たら docs/concept.md → vault:音楽アクション/v0 不満.md の「v2」節と貼られた要約 → docs/decisions/v1-feedback.md の順に読み、不満を変更に落として docs/decisions/v2-feedback.md に分解を書く
- 不満がまだ無ければ、下の「本人に聞きたいこと」1 (レーザーの相殺窓) を先に 2 案で用意してもよい: 窓を当たりの 0.125 拍前に広げた版と今の版。ただし作品側の変更は不満を根拠にする原則なので、反応が無いうちは実装しない
- 現状の確認: `npm test` (89 件)、`npx tsx scripts/validate-choreo.ts assets/choreo/v2.json`、`npx tsx scripts/sync-report.ts assets/choreo/v2.json`
- 終了条件: 不満の分解が docs/decisions/v2-feedback.md にあり、次の版 (v3) の目的・完了条件・入れないものが docs/plan/v3-phase1.md に書かれて本人の承認待ちになっている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v2。タイトルに選択なし)
- 最新 commit: v2 のレビュー指摘の後片付け (4d2809e)。v2 の本体は T1〜T6 の 9 commit (dd2dbd6〜ba30a95)。当たりの時刻の基準の仮説は外れた (docs/decisions/v2-timing-standard.md)
- テスト: `npm test` 89 件 (10 ファイル) 通過。`npm run build` 通過
- 未 push: なし
- 回す仕組み: 段階 1 (NEXT.md とセッション規律) は稼働中。承認は版ごとに 1 回 (CLAUDE.md「承認の扱い」)。段階 2 (無人の実行) は未着手。今回 v2 の T1〜T6 を ultracode (並列サブエージェント) で 1 セッションで通せたので、段階 2 の最初のキューは「不満の分解 → v3 の計画」が候補

## 本人に聞きたいこと
1. レーザーの相殺の窓。レーザーは自機の位置を狙うので、射線上に立ったままだと当たりの最初の step (8 ms) で被弾し、相殺はその step に押下が乗ったときだけ成立する。遊んで「相殺できない」と感じたら、受付窓を当たりの 0.125 拍前 (表の判定窓と同じ) に広げる案がある。答えが無くても進められる範囲: 不満ノートの反応を待つ (今の仕様のまま)
2. 結果画面の「当たりの処理遅れ」の値。Chrome の自動操作タブでは 346〜649 ms と出たが、描画の間引きによる可能性が高い。手で遊んだときの値が 50 ms を超えていたら知らせてほしい。答えが無くても進められる範囲: 全部
