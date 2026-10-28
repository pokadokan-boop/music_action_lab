# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-29。セッションの終わりに Claude が書き直す (書き方は CLAUDE.md「セッションの終わり方」)。

## 次の 1 手
- v3 は承認済み (docs/plan/v3-phase1.md「本人の返事」)。読む順: docs/concept.md (「曲と音の役割」を含む) → docs/decisions/v2-feedback.md (確かめた事実 F1〜F10) → docs/plan/v3-phase1.md → docs/decisions/commit-labels.md → docs/choreo-format.md → src/core/sim.ts・vec.ts・choreo.ts・render/canvas.ts・audio/engine.ts。docs/plan/v3-phase2.md (各タスクの詳細と既定値) を書き、承認を待たずに T1 (等方座標) から実装に入る。T1 を先に終えて commit してから残りを並列にしてよい (v2 と同じ ultracode)
- 並行の作業 (v3 と独立): docs/play-image.md「理想の 20 秒の動作イメージ」の下書き。本人の決め: v3 に含めない、1 フレーズでは短いので phrase 0〜8 の全体、下書きは Claude。読む順: vault:音楽アクション/入り口.md → 根本コンセプトアイデア.md → 音楽参考.md → docs/concept.md → v0〜v2 の不満 (vault と docs/decisions/v*-feedback.md)。絵・音・入力・判定を時刻つきで言語化し、出典を付け、本人が直す前提の叩き台と明記する。v3 のセッションの冒頭でサブエージェントに任せてよい
- commit の接頭辞は docs/decisions/commit-labels.md の新しい定義 (ゲームのコードは [作品])
- 現状の確認: `npm test` (89 件)、`npx tsx scripts/validate-choreo.ts assets/choreo/v2.json`
- 終了条件: v3 の完了条件 (docs/plan/v3-phase1.md) が全て満たされ、公開 URL で遊べ、不満ノートに v3 の節があり、docs/play-image.md の下書きがある

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v2。v3 は未着手)
- 最新 commit: v3 Phase 1 を本人の返事で修正し承認済みに。concept.md に「曲と音の役割」、docs/decisions/commit-labels.md を追加 (docs のみ。コードは 8b40250 のまま)
- テスト: `npm test` 89 件 (10 ファイル) 通過
- 未 push: なし。注意: push は gh の有効アカウントが pokadokan-boop のときだけ通る (2026-10-28 に kmae0914 になっていて 403 が出た。`gh auth switch --user pokadokan-boop` で直る)
- 回す仕組み: 段階 1 (NEXT.md とセッション規律) は稼働中。v3 の承認は不満ノート → 分解 → Phase 1 → 返事 1 回で済んだ。段階 2 (無人の実行) は未着手

## 本人に聞きたいこと
なし (v3 Phase 1 は返事の 5 点を反映して承認済みとして扱った。異議があれば止める)
