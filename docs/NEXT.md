# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-06。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- 本人の答え待ち: 次の版 (v7) の方向。Claude の推奨は「2 曲目 (= 2 体目の敵)」(docs/decisions/v6-feedback.md「次の方向」)。答えが来たら docs/concept.md →「次の方向」の表 → docs/decisions/song-choice.md (候補 3 曲の性格) → docs/choreo-format.md の順に読み、v7 の Phase 1 (目的・完了条件・入れないもの) を docs/plan/v7-phase1.md に書いて承認を求める。A (2 曲目) なら concept.md「範囲」の「敵 1 体、曲 1 つ」を「20 秒のシーンを 2 つ」に広げる文を承認に含める
- v6.1 (命中判定・返しの踏み込み・窓 150 / 100) は公開済み。本人が遊んで v6 不満.md に追記したら、同じ docs/decisions/v6-feedback.md に追記する (別ファイルにしない)
- 不満が無い間にできること: 無し (手触りと方向の判断は本人)。判断者 (docs/steward/) は毎日動く
- 現状の確認: `npm test` (212 件、20 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v6.json`
- 終了条件: 本人が v7 の方向を答えている

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6.1: 両手独立、大技 slam、予告 4 型、音の仕様データ + 命中は敵の体の重なり・返しは敵へ踏み込み・窓 前 150 / 後 100)。音作りのページ: 同 /sound.html
- 最新 commit: [作品] v6.1 (src/core/sim.ts playerAttack の命中と踏み込み、src/core/vec.ts fanAngleCoversCircle、src/config.ts defaultTuning、テスト、README、docs/choreo-format.md、docs/decisions/v6-feedback.md)。その前は v6 セッション C
- テスト: `npm test` 212 件 (20 ファイル) 通過。`npm run build` 通過。`validate-choreo v6.json` 違反なし
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- v6 の不満の要点 (2026-11-06、有線 40 ms): 命中 0 / 攻撃 33 (扇が被って見えるのに当たらない → v6.1 で判定を直した) / 返し 3 回「すごい移動する」(→ 敵へ補正) / 窓は前 150 後 100 が欲しい (→ 既定に) / 大技の相殺は好き、決まったらスローモーション的な演出が欲しい (後回し。曲は止められないのでヒットストップ形式) / 相殺して合間に攻撃するのが楽しい / 今の曲でできる最大限をやった気がするので別の曲かエンジンか、と本人が問うている / 音作りは元気な時に / ステップは 3 版続けて 0 回
- 調整パネルを保存していた場合、v6.1 の既定の窓は効かない。要約の先頭行が「窓 前150/後100」でなければタイトルの「既定値に戻す」
- 判断者: 最終実行 2026-11-03、削除 7、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-03.md)

## 本人に聞きたいこと
1. v7 の方向。A: 2 曲目 (= 2 体目の敵。candidate-1 144 BPM ジャージークラブ風 / candidate-3 132 BPM ミニマルテクノ風 / 新しい候補から選ぶ。行動は増やさず持ち込む) / B: エンジンの移行 / C: 今の曲で後回しを消化 (回避が活きる配置、大技相殺のヒットストップ、20 秒の終わり方)。Claude の推奨は A (理由は docs/decisions/v6-feedback.md「次の方向」。B は移す条件が来ていない)。答えが無くても進められる範囲: なし (concept.md「範囲」に触れる)
2. A なら、2 曲目を既存の候補 (1 か 3) から選ぶか、Claude が新しい候補を 2〜3 曲作って聴き比べるか。既定: 新しい候補を作る (今の曲と性格の違う、テンポが細かい / 音の密度が高いもの)。答えが無くても進められる範囲: 候補作りまで
3. v6.1 を遊んで、扇が被った攻撃が当たるようになったか、返しの踏み込みが「当たる位置」になったか (v6 不満.md に追記でよい)。答えが無くても進められる範囲: 全部
