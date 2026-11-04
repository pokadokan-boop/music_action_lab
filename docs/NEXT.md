# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-05。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v5 の不満は分解済み (docs/decisions/v5-feedback.md)。v6 の Phase 1 (docs/plan/v6-phase1.md) を本人に出して承認待ち
- 承認が来たら: docs/plan/v6-phase1.md → docs/decisions/v5-feedback.md → docs/choreo-format.md → src/core/sim.ts (handleAttackButton、playerAttack、tryCancel) の順に読み、セッション A の Phase 2 (docs/plan/v6-phase2-hands.md: L1 と手ごとの溜め、両手放ちの窓、返しの窓の表示、記録と譜 3 行) を書いてそのまま実装に入る。公開は 3 セッション目の最後に 1 回。途中の push は公開 URL を作りかけにするので、NEXT.md に「v6 作りかけ」と書く
- 承認の返事に修正があれば v6-phase1.md を直してから (v5 のときと同じ。冒頭に日付と直した点)
- 現状の確認: `npm test` (182 件、17 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v5.json`
- 終了条件: v6-phase1.md が承認され、セッション A の Phase 2 が書けている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v5 のまま)
- 最新 commit: v5 の不満の分解と v6 Phase 1 (docs/decisions/v5-feedback.md、docs/plan/v6-phase1.md、CLAUDE.md の文書一覧)。コードは v5 セッション B から変えていない
- テスト: `npm test` 182 件 (17 ファイル)。`npm run build` 通過 (2026-11-02 の確認のまま)
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 本人の決め (2026-11-05): 両手独立 (R1 / L1) は v6 で実装 (テンポの細かい曲で後で必要になる) / 大技の作り直し (4 本のレーザー、両手放ちで相殺) も v6 に入れる / 音は音作りのページ + Claude の初期値 / 放ちの直当ては要約に行動別の命中を足すだけ、ダメージはそのまま / 曲の最初の 2 拍の突進は残す / 溜め中の輪は見えた / コントローラの振動は入れない (そのうち強度設定つきで)
- 本人の環境: 音の出力遅延は Bluetooth 280 ms、有線 40 ms で「遅延がほぼなくなった」。イヤホン EarFun Air Pro 4+ はゲームモード (公称 50 ms 未満) があり、本人が帰宅後に確かめる。ゲーム側の対策は無い (自分の音だけが遅れる構造。docs/decisions/v5-feedback.md F1)
- 判断者: 最終実行 2026-11-03、削除 7、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-03.md)

## 本人に聞きたいこと
1. docs/plan/v6-phase1.md の承認 (「承認に含めるもの」5 点: L1 の追加、大技の相殺は両手放ちだけ、ダメージと HP の小数、吹っ飛びとのけぞり、振り付けの検査の読み替え)。答えが無くても進められる範囲: なし (Phase 1 は承認が要る)
2. 左手のキーボードのキー (既定 F)、大技のレーザーの向き (既定 ×)、返しの窓の表示 (既定 入れる)。答えが無くても進められる範囲: 全部 (既定で)
3. イヤホンのゲームモードをオンにしたときの「音の出力遅延の補正」の値。答えが無くても進められる範囲: 全部 (ゲーム側の変更は無い)
