# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-02。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v5 は完了 (docs/plan/v5-phase1.md「完了記録 セッション A」「完了記録 セッション B」)。公開 URL で遊べる。次は本人の不満 (vault:音楽アクション/v5 不満.md) を待つ
- 不満が来たら: docs/concept.md → v5 不満.md と貼られた要約 → docs/decisions/v4-feedback.md → docs/plan/v5-flow-options.md「記録して後回し」(スタイル、コピー + 乗っ取り、吸収と放出、ゲージ、大技、派生の追加) の順に読み、docs/decisions/v5-feedback.md に分解し、v6 の Phase 1 (目的・完了条件・入れないもの) を書いて承認を求める。案は「敵側の変化」と「プレイヤー側の行動の語彙」の両方の軸で出す (v4-feedback.md「仕組み側の学び」)
- 不満が無い間にできること: 無し (手触りの判断は本人)。判断者 (docs/steward/) は毎日動く
- 現状の確認: `npm test` (182 件、17 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v5.json`
- 終了条件: v5 不満.md が書かれている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v5: R1 攻撃と溜め・放ち、○ ステップ、返し、音高 3 案、譜。敵は 17 攻撃 (全メロディ音、拍 0 以外)、1 フレーズ 2 攻撃)
- 最新 commit: v5 セッション B (v5.json、連なる攻撃の形式と検査、敵の位置・構えの選び方、phrase 表、文書、不満ノート)。その前は 319a193 (セッション A)
- テスト: `npm test` 182 件 (17 ファイル) 通過。`npm run build` 通過。`validate-choreo v5.json` 違反なし
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 確認できていないこと (本人の手で): 自分の音の列が曲に乗るか、2 攻撃のフレーズが読めるか、溜め中の輪の見え方、音高 3 案の聴き比べ、実機の R1 / ○。曲の最初の 2 拍から突進が来る (phrase 0 の dash) が忙しければ phrase 0 だけ外す案
- 承認事項のうち使わなかったもの: 連なる攻撃の予告先行 1 拍 (全て 2 拍で置けた。acceptance.json は変えていない。docs/plan/v5-phase2-enemy.md)
- 本人の決め (2026-11-02): 流れの軸は案 D。敵は止めない (乗っ取りはコピーとセットでないと要らない)。溜めは動きながら持てる、被弾で解除、離した瞬間に放つ。ステップは無敵なし。攻撃 R1 / 回避 ○。強い相殺 = 溜めの放ちで相殺、ダメージだけ。派生は返し 1 つ (スティック入力があれば踏み込み)。敵の攻撃を全メロディ音に置く
- 本人の環境: 音の出力遅延 280 ms (Bluetooth イヤホン)。遅れは感じていない。タイトルで遅延を体感で測る仕組みは次以降の希望 (docs/decisions/v4-feedback.md)
- 判断者: 最終実行 2026-11-01 (docs/steward/runs/2026-11-01.md)

## 本人に聞きたいこと
1. v5 を遊んで vault:音楽アクション/v5 不満.md に (書いてほしいこと 6 点はノートの冒頭)。答えが無くても進められる範囲: なし (次の版の目的は不満から決める)
2. 曲の最初の 2 拍から突進が来るのはどうか (phrase 0 の dash)。忙しければ外す。答えが無くても進められる範囲: 全部 (そのまま)
