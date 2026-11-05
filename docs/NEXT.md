# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-05。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v6 完了 (docs/plan/v6-phase1.md の完了記録 A / B / C)。公開 URL で遊べる。次は本人の不満 (vault:音楽アクション/v6 不満.md) を待つ
- 不満が来たら: docs/concept.md → v6 不満.md と貼られた要約と (あれば) 本人が作った音の JSON → docs/decisions/v5-feedback.md「記録して後回し」→ docs/plan/v6-phase1.md「入れないもの」の順に読み、docs/decisions/v6-feedback.md に分解し、v7 の Phase 1 (目的・完了条件・入れないもの) を書いて承認を求める。本人の音の JSON が来たら assets/sound/v6.json (または v7.json) に入れる (soundspec.test.ts の既定の音の性質のテストは、本人の音に合わせて書き換えるか外す)
- 不満が無い間にできること: 無し (手触りの判断は本人)。判断者 (docs/steward/) は毎日動く
- 現状の確認: `npm test` (207 件、20 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v6.json`
- 終了条件: v6 不満.md が書かれている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6: 両手独立 R1 / L1、大技 slam と両手放ち、予告 4 型の描き分け、音の仕様データ)。音作りのページ: 同 /sound.html
- 最新 commit: v6 セッション C (音の仕様 soundspec.ts と assets/sound/v6.json、合成器 synth.ts、engine の差し替え、sound.html、文書、不満ノート v6)。その前は セッション B (大技)、セッション A (両手)
- テスト: `npm test` 207 件 (20 ファイル) 通過。`npm run build` (tsc + vite、4 ページ) 通過。`validate-choreo v6.json` 違反なし
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 本人の決め (2026-11-05): 両手独立は v6 で / 大技の作り直し (囲む 4 辺のレーザー、両手放ちで相殺、反動は R と j で配分) も v6 で / 音は音作りのページ + Claude の初期値 / 放ちの直当ては要約に行動別の命中を足すだけ、ダメージはそのまま / 曲の最初の 2 拍の突進は残す / 溜め中の輪は見えた / 振動は入れない / 手によって音は区別しない / 返しの窓の表示は要らない / 返しの手触りを v6 の不満ノートの項目に
- 本人の環境: 音の出力遅延は Bluetooth 280 ms、有線 40 ms。イヤホン EarFun Air Pro 4+ のゲームモード (公称 50 ms 未満) は本人が帰宅後に確かめる。ステップの音が終わりに聞こえるのは Bluetooth の遅れの読み (docs/decisions/v5-feedback.md F1b)
- 確認できていないこと (本人の手で): 両手の輪、予告 4 型と大技の見え方、両手放ちの合わせやすさ、初期値の音、音作りのページの使い心地
- 判断者: 最終実行 2026-11-03、削除 7、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-03.md)

## 本人に聞きたいこと
1. v6 を遊んで vault:音楽アクション/v6 不満.md に (書いてほしいこと 6 点はノートの冒頭)。答えが無くても進められる範囲: なし (次の版の目的は不満から決める)
2. イヤホンのゲームモードをオンにしたときの「音の出力遅延の補正」の値と、ステップの音が開始に重なって聞こえるか。答えが無くても進められる範囲: 全部
