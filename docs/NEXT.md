# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-29。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v3 は完了 (docs/plan/v3-phase1.md「完了記録」)。次は本人が v3 を遊んで不満ノート (vault:音楽アクション/v3 不満.md か、v2 不満.md「v3 について」の下) に書くのを待つ。不満が来たら docs/concept.md → そのノート → docs/decisions/v2-feedback.md → docs/play-image.md の順に読み、不満を変更に落として docs/decisions/v3-feedback.md に分解を書き、v4 の目的・完了条件・入れないものを docs/plan/v4-phase1.md に書いて承認を求める
- 不満がまだ無ければ: docs/play-image.md の「本人に直してほしい点」(6 節、10 件) に本人の返事が付いていないか見る。付いていれば文書に反映する。付いていなければ待つ (作品側の変更は不満を根拠にする)
- 本人が選んだ調整値 (要約の先頭行「調整 窓 前…/後… ms 大きさ … 扇 … 許容 …°」) が不満ノートに貼られていたら、src/config.ts の `defaultTuning` に反映して `[作品]` で commit する (パネルは残す)
- 現状の確認: `npm test` (131 件、14 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v3.json`
- 終了条件: 不満の分解が docs/decisions/v3-feedback.md にあり、v4 の Phase 1 が本人の承認待ちになっている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v3。タイトルに調整パネル)
- 最新 commit: v3 の完了記録と NEXT.md。v3 の本体は T1〜T7 の 8 commit (aae4d92 等方座標 → 6637719 楽器、+ sim-v3 のテスト)。同じ日に別セッションが段階 2 (無人の判断者) を commit しているので、履歴は交互に並んでいる
- テスト: `npm test` 131 件 (14 ファイル) 通過。`npm run build` 通過
- 未 push: なし。注意: push は gh の有効アカウントが pokadokan-boop のときだけ通る (`gh auth switch --user pokadokan-boop`)
- 回す仕組み: 段階 1 (NEXT.md と区切りの規律) は稼働中。2026-10-29 に「切ってください」を廃止 (CLAUDE.md「区切りの作り方」)。段階 2 (無人の専門家と判断者、docs/plan/loop-phase2.md) は別セッションで承認・実装され、Task Scheduler に `music_action_lab-steward` (毎日 05:00) が登録済み。判断者の状態はそのセッションの記録 (docs/steward/runs/) を見る
- 同じ作業ツリーで 2 つのセッションが動いた日の注意: 共有の index に相手のファイルがステージされていることがある。commit は `git commit -F <msg> -- <自分のパス>` でパスを指定する (この日の v3 の commit は全てそうした)

## 本人に聞きたいこと
1. v3 を遊んで、相殺が成立する手応え / 選んだ調整値 / 自分の音が曲と区別できるか / 捌きたくなるか、を不満ノートに。答えが無くても進められる範囲: なし (作品側の変更は不満を根拠にする)
2. docs/play-image.md の 6 節 (10 件)。特に 2 (dash の接触が裏拍 18.5 に来るのが意図どおりか。v3 はそのまま、予告の輪を 18.5 に収束させた) と 3 (向きと移動が同じスティックで、相殺のために倒すと動いてしまう)。答えが無くても進められる範囲: 文書は叩き台のまま置いておく
