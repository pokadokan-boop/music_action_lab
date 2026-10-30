# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-30。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v4 (流れを作るための部品) は完了 (docs/plan/v4-phase1.md「完了記録」)。次は v5 の準備: 流れの設計は本人が決める番なので、Claude は docs/play-image.md を叩き台に、捌いた後の流れの案を 2〜3 つ「言葉で」書く (実装しない)。読む順: docs/concept.md → docs/decisions/v3-feedback.md → docs/play-image.md → docs/plan/v4-phase1.md「次の計画 (v5) の予告」→ vault:音楽アクション/v4 不満.md (本人の反応があれば)。書き先は docs/plan/v5-flow-options.md。各案に、捌いた後に何が続くか / 何がリターンか (アクション性) / 音がどう曲に乗るか (応えの音の 2〜3 案を聴き比べる形) / 追いかけの扱い / 部品 (分岐・構え・音の口) の使い方、を揃えて書く。本人が選ぶか直してから v5 の Phase 1 を書く
- v4 の不満 (vault:音楽アクション/v4 不満.md) が先に来ていたら、docs/decisions/v4-feedback.md に分解してから上をやる
- 現状の確認: `npm test` (148 件、15 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v4.json`
- 終了条件: docs/plan/v5-flow-options.md があり、本人が案を選ぶか直すのを待っている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v4。人型の自機と雫形の敵、dash を捌けたら 1 拍止まる)
- 最新 commit: v4 の完了記録と NEXT.md。v4 の本体は 2cb6b07 (分岐・構えの選択・記録) → a5188ce (音の口、v4.json、文書) → 姿 (figures.ts) の 3 commit
- テスト: `npm test` 148 件 (15 ファイル) 通過。`npm run build` 通過
- 未 push: なし。注意: push は gh の有効アカウントが pokadokan-boop のときだけ通る
- 回す仕組み: 段階 1 は稼働中。v3 の不満 → 分解 → v4 の案 → 本人の修正 (部品だけに) → 承認 → 実装 → 公開 が 1 日で回った。段階 2 の判断者は毎日 05:00 (docs/steward/runs/)
- 本人の環境: 音の出力遅延 280 ms (有線で変わるかは未回答)

## 本人に聞きたいこと
1. v4 を遊んで、姿が見分けられるか / dash を捌いた後に敵が止まる手応え / v5 (流れ) に向けて思うこと、を v4 不満.md に。答えが無くても進められる範囲: 流れの案 (v5-flow-options.md) の下書きは進める
2. 音の出力遅延 280 ms は有線で変わるか (docs/decisions/v3-feedback.md F6)。答えが無くても進められる範囲: 全部
3. docs/play-image.md 6 節 (10 件) は未回答のまま。流れの案を書くときに Claude が仮の答えを置くので、違っていれば直してほしい
