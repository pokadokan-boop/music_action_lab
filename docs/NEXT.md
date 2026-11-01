# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-02。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- docs/plan/v5-phase1.md (行動に拍の長さを持たせる) が本人の承認待ち。承認されたら、docs/concept.md → docs/decisions/v4-feedback.md → docs/plan/v5-flow-options.md (案 D と本人の返事 2 回) → docs/plan/v5-phase1.md → docs/choreo-format.md の順に読み、docs/plan/v5-phase2-player.md (セッション A: T1 ステップ 〜 T5 記録・譜・構え) を書いて実装に入る。既定値は Phase 1 の表を使い、理由を Phase 2 に書く
- セッション B (docs/plan/v5-phase2-enemy.md: T6 連なる攻撃の形式 〜 T8 公開) は A の後。v5.json は 17 攻撃 (phrase 0 の拍 0 を除く全メロディ音)
- 承認で「承認に含めるもの」5 点のどれかが否なら、その点だけ Phase 1 を直してから進む
- 現状の確認: `npm test` (150 件、15 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v4.json`
- 終了条件: セッション A の T1〜T5 が終わり、テストと公開 URL が更新されている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v4。人型の自機と雫形の敵、dash を捌けたら 1 拍止まる)
- 最新 commit: 3e66a27 v4 不満の分解 (docs/decisions/v4-feedback.md)、v5 の案 D と本人の返事 (docs/plan/v5-flow-options.md)、v5 の Phase 1 (docs/plan/v5-phase1.md、承認待ち)。コードは v4 のまま
- テスト: `npm test` 150 件 (15 ファイル) 通過
- 未 push: この commit と NEXT.md の commit (push を試みる。gh の有効アカウントが pokadokan-boop のときだけ通る)
- 本人の決め (2026-11-02): 流れの軸は案 D。敵は止めない (乗っ取りはコピーとセットでないと要らない)。溜めは動きながら持てて被弾で切れない、離した瞬間に放つ。ステップは無敵なし。強い相殺 = 溜めの放ちで相殺、ダメージだけ。派生は返し 1 つ。敵の攻撃を全メロディ音に置く
- 本人の環境: 音の出力遅延 280 ms (有線で変わるかは未回答)
- 判断者: 最終実行 2026-11-01 (docs/steward/runs/2026-11-01.md)

## 本人に聞きたいこと
1. docs/plan/v5-phase1.md の承認 (「承認に含めるもの」5 点: 回避ボタン ○/K、連なる攻撃の予告先行 1 拍、ダメージ量の既定、v4 の止まるを外す、拍 0 には置かない)。答えが無くても進められる範囲: なし (Phase 1 の承認は要る)
2. 同文書「本人に聞きたいこと」4 点 (カウントイン、返しの踏み込み、ボタン、溜め中の被弾)。答えが無くても進められる範囲: 全部 (既定で進む)
3. 音の出力遅延 280 ms は有線で変わるか。v5 の相乗りの確認は有線が前提。答えが無くても進められる範囲: 全部
