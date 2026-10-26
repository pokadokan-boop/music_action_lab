# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-27。セッションの終わりに Claude が書き直す (書き方は CLAUDE.md「セッションの終わり方」)。

## 次の 1 手
- v2 の Phase 1 と Phase 2 (docs/plan/v2-phase1.md、docs/plan/v2-phase2.md) の一括承認を本人から取る。承認されたら両文書の冒頭に「承認済み」と日付を書き、セッション S1 = T1 (立ち上がり時刻の測定の道具) → T2 (基準の検証と記録) に入る
- 読む順: docs/concept.md → docs/plan/v2-phase1.md → docs/plan/v2-phase2.md → docs/choreo-format.md → src/audio/engine.ts
- 現状の確認: `npm test`、`npx tsx scripts/sync-report.ts assets/choreo/a2.json`
- 終了条件 (S1): docs/decisions/v2-timing-standard.md に測定値と 2 判定の整合が書かれ、基準の採否を本人に聞く状態で止まる

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/
- 最新 commit: v2 の Phase 2 文書と、Phase 1 の修正 (一括承認、8 方向の撤廃、v2.json への一本化)。作品側は A' の叩きつけ 80 ms (d1df1d1) から変わっていない
- テスト: `npm test` 42 件 (7 ファイル) 通過
- 未 push: なし

## 本人に聞きたいこと
1. v2 の Phase 1 と Phase 2 を一括で承認するか。答えが無くても進められる範囲: なし (承認前に実装コードは書かない)
