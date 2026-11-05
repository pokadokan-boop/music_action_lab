# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-05。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v6 は作りかけ (セッション A 完了、B と C が残り)。公開 URL は v5 に両手が足された途中の状態。本人が遊ぶのは v6 完了後 (ここに「v6 完了」と書く)
- 次はセッション B (大技と見分け)。docs/plan/v6-phase1.md (T4〜T6、承認事項 2〜5、既定値) → docs/plan/v6-phase2-hands.md の完了記録 (両手放ちの記録 `double` / `pairMs`、`lastRelease`) → docs/choreo-format.md → assets/choreo/README.md → src/core/choreo.ts (型・hitboxAt・activeWindow・contactBeat) → src/core/sim.ts (tryCancel、checkDamage、playerAttack) → scripts/validate-choreo.ts の順に読み、docs/plan/v6-phase2-enemy.md を書いてそのまま実装に入る
- セッション B の中身: 攻撃の型 `slam` (1 音目に予告開始、発射装置 4 つが枠の 4 隅へ、2 音目に円 + 4 辺のレーザー)、通常と片手の放ちでは相殺不可、片手の放ちで被ダメ ×0.8 と吹っ飛び ×0.8、両手放ちで相殺 + 敵に 6 × j + 反動の配分 (敵 j / (R + j)、自機 R / (R + j)、R 0.5)、自機の吹っ飛び 0.2 (0.5 拍) と敵ののけぞり (差分、1 拍で減衰)、HP の小数、予告の描き分け (dash の道は当たりの区間だけ + 残像、shot は点線 + 発射点の輪、laser は帯)、v6.json (Z を slam に)、検査の読み替え (全メロディ音に攻撃か大技の予告の始まり、dodgeable は帯)
- 現状の確認: `npm test` (195 件、18 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v5.json`
- 終了条件: セッション B の完了記録が v6-phase2-enemy.md と v6-phase1.md にある

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6 作りかけ: 両手独立だけ入った v5)
- 最新 commit: v6 セッション A (両手独立。src/core/sim.ts の hands、L1 / F、両手放ちの窓、要約の命中と手の内訳、譜 3 行、sim-v6.test.ts)。その前は v5 の不満の分解と v6 Phase 1 (承認済み 2026-11-05)
- テスト: `npm test` 195 件 (18 ファイル) 通過。`npm run build` (tsc + vite) 通過
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 本人の決め (2026-11-05): 両手独立は v6 で / 大技の作り直し (囲む 4 辺のレーザー、両手放ちで相殺、反動は R と j で配分) も v6 で / 音は音作りのページ + Claude の初期値 / 放ちの直当ては要約に行動別の命中を足すだけ、ダメージはそのまま / 曲の最初の 2 拍の突進は残す / 溜め中の輪は見えた / 振動は入れない / 手によって音は区別しない / 返しの窓の表示は要らない / 返しの手触りを v6 の不満ノートの項目に
- 本人の環境: 音の出力遅延は Bluetooth 280 ms、有線 40 ms。イヤホン EarFun Air Pro 4+ のゲームモード (公称 50 ms 未満) は本人が帰宅後に確かめる。ステップの音が終わりに聞こえるのは Bluetooth の遅れの読み (docs/decisions/v5-feedback.md F1b)
- 判断者: 最終実行 2026-11-03、削除 7、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-03.md)

## 本人に聞きたいこと
1. イヤホンのゲームモードをオンにしたときの「音の出力遅延の補正」の値。答えが無くても進められる範囲: 全部 (ゲーム側の変更は無い)
2. ステップの音が「終わったタイミングで鳴る」のは有線でも同じか (docs/decisions/v5-feedback.md F1b)。有線でも同じなら別の原因を探す。答えが無くても進められる範囲: 全部
