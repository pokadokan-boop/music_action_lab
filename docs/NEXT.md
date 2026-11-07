# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-11-07。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v7 Phase 1 (docs/plan/v7-phase1.md) は承認済み 2026-11-07。次は Phase 2 セッション A: docs/plan/v7-phase2-song.md を書いて実装に入る (候補 3 曲の生成 + candidates.html + シーンの選択の口)。承認は要らない
- 読む順: docs/concept.md (「範囲」の注記と「曲と絵の役割」) → docs/plan/v7-phase1.md (全部。特に「目的」「既定値」「聞きたいこと」の答え済み) → docs/decisions/v6-feedback.md「本人の返事」(2026-11-06〜07 の言葉。曲調の好み、起伏の形、大技から通常攻撃、連撃と踏み込み、人型 = 引き継ぐ側の体、高音の線は最初から) → docs/decisions/song-choice.md → scripts/gen-candidates.ts → src/core/grid.ts (フレーズの切り方。`melody` トラックだけを読む) → src/audio/pitch.ts (音高の案が曲から何を取るか) → prototypes/morph-slider.html (2 体目の姿と動きの出発点。T5 で使う)
- セッション A の終了条件: 候補 3 曲 (candidate-4〜6。各 40 秒前後、起伏の形が 3 つとも違う、`melody` + `lead-high` を最初から) が candidates.html で聴け、像・大技のイメージ・起伏の形が添えてある。タイトルでシーンを選べる骨組みがある。本人に「1 つ選んで番号と理由を一言」と聞いて区切る。待ちの間に調査 C (docs/research/art-assets.md。Web 検索は search サブエージェント) と T3 (形式: 連撃 `group`・踏み込み `approach`・声部 `track`・検査) を進めてよい
- 現状の確認: `npm test` (212 件、20 ファイル)、`npm run build`、`npx tsx scripts/validate-choreo.ts assets/choreo/v6.json`

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v6.1)。音作りのページ: 同 /sound.html。曲候補: 同 /candidates.html
- 最新 commit: [仕組み] v7 Phase 1 承認済みの印、prototypes/morph-slider.html (形態変化スライダーの最終版)、NEXT.md。その前は Phase 1 の書き直し (行動の拡張は Claude の裁量、候補に大技と起伏の形、高音の線は最初から)、v6-feedback.md に本人の返事、[作品] v6.1
- テスト: `npm test` 212 件 (20 ファイル) 通過。`npm run build` 通過。`validate-choreo v6.json` 違反なし
- 未 push: なし (push は `gh auth switch -u pokadokan-boop` を先に)
- 本人の決め (2026-11-07): v7 Phase 1 承認 / 承認は候補の選択だけ、行動の追加は Claude の裁量 / 曲は生成でよい / 像は獣と機械に縛らない、人型は「引き継ぐ側の体」(部品を継ぎ足せる骨組み) / 起伏の形は縛らない (右肩上がり・山型・自壊) / 高音の線は最初から (背景のフレーズが残る一貫性 = オスティナート) / 2 体目の姿は最終形態を先に作って OK を取る / 動きの作法 (跳びつきは両の後ろ脚で蹴る、薙ぎ払いは一息で前腕が先行、腕は顔に被らない角度で止めて顔を背中側へ、叩きつけは向き固定、被弾は小技と大技、膝は前)
- 本人の決め (2026-11-06): v7 は A (2 曲目) / 40 秒 (20〜120 秒の範囲) / 音楽と視覚は物語的に地続き (concept.md「曲と絵の役割」) / 資産としての絵は調査のみ / 1 曲目には飽きている
- v6 の不満の要点: 命中 0 (→ v6.1 で判定を直した) / 返し「すごい移動する」(→ 敵へ補正) / 窓 前 150 後 100 (→ 既定に) / 大技の相殺は好き、スローモーション的な演出は後で (ヒットストップ形式) / ステップは 3 版続けて 0 回 / 音作りは元気な時に
- 調整パネルを保存していた場合、v6.1 の既定の窓は効かない。要約の先頭行が「窓 前150/後100」でなければタイトルの「既定値に戻す」
- 判断者: 最終実行 2026-11-07、削除 1、提案 0、質問 0、要望 0 (docs/steward/runs/2026-11-07.md)

## 本人に聞きたいこと
1. なし (次に聞くのは候補 3 曲ができてから: どれを選ぶか、番号と理由を一言)
2. v6.1 を遊んで、扇が被った攻撃が当たるようになったか、返しの踏み込みが当たる位置になったか (v6 不満.md に追記でよい)。答えが無くても進められる範囲: 全部
