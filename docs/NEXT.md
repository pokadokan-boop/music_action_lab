# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-30。区切りごとに Claude が書き直す (書き方は CLAUDE.md「区切りの作り方」)。

## 次の 1 手
- v4 の Phase 1 (docs/plan/v4-phase1.md) は本人の承認待ち。承認されたら、docs/concept.md → docs/decisions/v3-feedback.md → docs/plan/v4-phase1.md (「承認に含めるもの」の可否を本人の返事から拾う) → docs/play-image.md → docs/choreo-format.md → src/core/sim.ts・choreo.ts・render/canvas.ts・audio/pluck.ts の順に読み、docs/plan/v4-phase2.md を書いて承認を待たずに T1 (応えの窓) から実装に入る
- 「承認に含めるもの」の既定: 返事が無い点は「可」として進める。ただし concept.md の注記 (姿) は承認が明示されるまで書かず、Unity への移行は「移らない」で進める
- 返事が「Unity に移る」なら実装に入らず、回し方 (ビルド・確認・配置) の計画を docs/plan/engine-move.md に書いて止まる
- 現状の確認: `npm test` (131 件、14 ファイル)、`npx tsx scripts/validate-choreo.ts assets/choreo/v3.json`
- 終了条件: v4 の完了条件が全て満たされ、公開 URL で遊べ、不満ノートに v4 の節がある

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v3。扇の既定値だけ 1.6 に更新)
- 最新 commit: v3 の不満の分解 (docs/decisions/v3-feedback.md)、扇の既定値 1.6、v4 Phase 1 (承認待ち)
- テスト: `npm test` 131 件 (14 ファイル) 通過
- 未 push: なし。注意: push は gh の有効アカウントが pokadokan-boop のときだけ通る
- 回す仕組み: 段階 1 は稼働中。段階 2 の判断者は 2026-10-29 に初回実行 (削除 3)。v3 の不満は本人が遊んだ当日に分解と v4 の案まで進んだ (1 往復)
- 本人の環境: 音の出力遅延の補正が 280 ms (Claude の Chrome は 56 ms)。自分の攻撃の音が押してから 0.65 拍遅れて聞こえる環境なので、「自分の音が曲に乗る」評価はこの値を見てから読む

## 本人に聞きたいこと
1. docs/plan/v4-phase1.md の承認と、「承認に含めるもの」4 点 (姿を入れる / 追いかけを無くす方向 / 応えの音は調の 5 音から選ぶ / ブラウザのまま続ける)。答えが無くても進められる範囲: なし (版の承認は 1 回要る)
2. 音の出力遅延 280 ms は Bluetooth の音声機器の値に見える。有線で遊べるなら、要約の「音の出力遅延の補正」が何 ms になるか見てほしい。答えが無くても進められる範囲: 全部 (v4 の実装は進む)
3. docs/play-image.md 6 節 (10 件) は未回答のまま。急がない
