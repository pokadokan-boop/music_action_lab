# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-30。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v4 (流れを作るための部品) は完了 (docs/plan/v4-phase1.md「完了記録」)。流れの案 3 つ (A 弾き返す / B 呼びと応え / C 拍を奪い合う) を docs/plan/v5-flow-options.md に言葉で書いた。次は本人が選ぶか直すのを待つ。返事が来たら、docs/concept.md → docs/decisions/v3-feedback.md → docs/plan/v5-flow-options.md と返事 → docs/play-image.md の順に読み、選ばれた軸で docs/plan/v5-phase1.md (目的・完了条件・入れないもの) を書いて承認を求める。応えの音は 2〜3 案を聴き比べる形にする
- v4 の不満 (vault:音楽アクション/v4 不満.md) が来ていたら、docs/decisions/v4-feedback.md に分解し、v5 の Phase 1 に反映する
- 現状の確認: `npm test` (148 件、15 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v4.json`
- 終了条件: v5 の Phase 1 が本人の承認待ちになっている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v4。人型の自機と雫形の敵、dash を捌けたら 1 拍止まる)
- 最新 commit: v4 の完了記録と NEXT.md。v4 の本体は 2cb6b07 (分岐・構えの選択・記録) → a5188ce (音の口、v4.json、文書) → 姿 (figures.ts) の 3 commit
- テスト: `npm test` 148 件 (15 ファイル) 通過。`npm run build` 通過
- 未 push: なし。注意: push は gh の有効アカウントが pokadokan-boop のときだけ通る
- 回す仕組み: 段階 1 は稼働中。v3 の不満 → 分解 → v4 の案 → 本人の修正 (部品だけに) → 承認 → 実装 → 公開 が 1 日で回った。段階 2 の判断者は毎日 05:00 (docs/steward/runs/)
- 本人の環境: 音の出力遅延 280 ms (有線で変わるかは未回答)

## 本人に聞きたいこと
1. docs/plan/v5-flow-options.md の案 A / B / C のどれを軸にするか (混ぜるなら何をどこに)。同文書「本人に決めてほしいこと」の 5 点。答えが無くても進められる範囲: なし (流れの設計は本人が決める)
2. v4 を遊んで、姿が見分けられるか / dash を捌いた後に敵が止まる手応え、を v4 不満.md に。答えが無くても進められる範囲: 1 の返事があれば v5 の Phase 1 は書ける
3. 音の出力遅延 280 ms は有線で変わるか (docs/decisions/v3-feedback.md F6)。答えが無くても進められる範囲: 全部
4. docs/play-image.md 6 節 (10 件) は未回答のまま。v5-flow-options.md の「本人に決めてほしいこと」に 3 件 (終わり方、スティック、音の案) を移した
