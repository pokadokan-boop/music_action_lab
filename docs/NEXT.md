# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-02。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- docs/plan/v5-phase1.md (行動に拍の長さを持たせる) が本人の承認待ち。本人の返事 3 回分 (R1 への変更、返しの踏み込み、被弾で溜め解除) は反映済み。承認されたら、docs/concept.md → docs/decisions/v4-feedback.md → docs/plan/v5-flow-options.md (案 D と本人の返事 3 回) → docs/plan/v5-phase1.md → docs/choreo-format.md の順に読み、docs/plan/v5-phase2-player.md (セッション A: T1 ステップ 〜 T5 記録・譜・構え) を書いて実装に入る。既定値は Phase 1 の表を使い、理由を Phase 2 に書く
- セッション B (docs/plan/v5-phase2-enemy.md: T6 連なる攻撃の形式 〜 T8 公開) は A の後。v5.json は 17 攻撃 (phrase 0 の拍 0 を除く全メロディ音)
- 承認で「承認に含めるもの」5 点のどれかが否なら、その点だけ Phase 1 を直してから進む
- 現状の確認: `npm test` (150 件、15 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v4.json`
- 終了条件: セッション A の T1〜T5 が終わり、テストと公開 URL が更新されている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v4。人型の自機と雫形の敵、dash を捌けたら 1 拍止まる)
- 最新 commit: v5 の Phase 1 に本人の返事 3 回目を反映 (R1、踏み込み、溜め解除、遅延の読み)。その前が 3e66a27 (v4 不満の分解、案 D、Phase 1 初版)。コードは v4 のまま
- テスト: `npm test` 150 件 (15 ファイル) 通過
- 未 push: なし (push は gh の有効アカウントを `gh auth switch -u pokadokan-boop` で切り替えてから。2026-11-02 に kmae0914 で 403 になった)
- 本人の決め (2026-11-02): 流れの軸は案 D。敵は止めない (乗っ取りはコピーとセットでないと要らない)。溜めは動きながら持てる、被弾で解除、離した瞬間に放つ。ステップは無敵なし。攻撃 R1 / 回避 ○。強い相殺 = 溜めの放ちで相殺、ダメージだけ。派生は返し 1 つ (スティック入力があれば踏み込み)。敵の攻撃を全メロディ音に置く
- 本人の環境: 音の出力遅延 280 ms (Bluetooth イヤホン)。本人は遅れを感じていない。タイトルで遅延を体感で測る仕組みは次以降の希望
- 判断者: 最終実行 2026-11-01 (docs/steward/runs/2026-11-01.md)

## 本人に聞きたいこと
1. docs/plan/v5-phase1.md の承認 (「承認に含めるもの」5 点: 攻撃 R1 / 回避 ○、連なる攻撃の予告先行 1 拍、ダメージ量の既定、v4 の止まるを外す、拍 0 には置かない)。答えが無くても進められる範囲: なし (Phase 1 の承認は要る)
2. 曲の前に 2 拍のカウントを足して拍 0 にも攻撃を置くか。答えが無くても進められる範囲: 全部 (既定は置かない)
