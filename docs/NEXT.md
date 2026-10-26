# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-27。セッションの終わりに Claude が書き直す (書き方は CLAUDE.md「セッションの終わり方」)。

## 次の 1 手
- v2 (docs/plan/v2-phase1.md) の Phase 1 の承認を本人から取る。承認されたら Phase 2 (各タスクの詳細) を書いて承認を得て、T1 (立ち上がり時刻の測定の道具) から実装する
- 読む順: docs/concept.md → docs/plan/v2-phase1.md → docs/choreo-format.md → docs/decisions/v1-feedback.md
- 現状の確認: `npm test`、`npx tsx scripts/sync-report.ts assets/choreo/a2.json`
- 終了条件: v2 の T1 の道具が a2 の 3 種類の攻撃について立ち上がり時刻を ms で出し、値が commit されている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/
- 最新 commit: 回す仕組みの段階 1 (NEXT.md とセッション規律) を実装。作品側は A' の叩きつけ 80 ms (d1df1d1) から変わっていない
- テスト: `npm test` 42 件 (7 ファイル) 通過
- 未 push: なし

## 本人に聞きたいこと
1. v2 Phase 1 (docs/plan/v2-phase1.md) を承認するか。答えが無くても進められる範囲: なし (承認前に実装コードは書かない)
