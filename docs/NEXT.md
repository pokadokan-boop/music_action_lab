# NEXT.md: 次のセッションへの引き継ぎ
更新 2026-10-28。セッションの終わりに Claude が書き直す (書き方は CLAUDE.md「セッションの終わり方」)。

## 次の 1 手
- v3 の Phase 1 (docs/plan/v3-phase1.md) は本人の承認待ち。承認されたら、docs/concept.md → docs/decisions/v2-feedback.md (確かめた事実 F1〜F10) → docs/plan/v3-phase1.md → docs/choreo-format.md → src/core/sim.ts・vec.ts・choreo.ts・render/canvas.ts の順に読み、docs/plan/v3-phase2.md (各タスクの詳細と既定値) を書いて承認を待たずに T1 (等方座標) から実装に入る
- 「承認に含めるもの」3 点 (調整パネル / concept.md の 1 行 / play-image.md) の可否を本人の返事から拾い、否なら該当タスクを外す。返事が無い点は「可」として進め、concept.md の 1 行だけは承認が明示されるまで書かない
- 実装は v2 と同じく並列サブエージェントで通してよい。T1 (等方座標) が他の全てに効くので、T1 を先に終えて commit してから残りを並列にする
- 現状の確認: `npm test` (89 件)、`npx tsx scripts/validate-choreo.ts assets/choreo/v2.json`
- 終了条件: v3 の完了条件 (docs/plan/v3-phase1.md) が全て満たされ、公開 URL で遊べ、不満ノートに v3 の節がある

## 今の状態
- 公開 URL: https://pokadokan-boop.github.io/music_action_lab/ (v2。v3 は未着手)
- 最新 commit: v2 の不満の分解と v3 の Phase 1 (docs のみ。コードは 8b40250 のまま)
- テスト: `npm test` 89 件 (10 ファイル) 通過
- 未 push: なし (このセッションの終わりに push)
- 回す仕組み: 段階 1 (NEXT.md とセッション規律) は稼働中。本人は「不満ノートを書いた、見てほしい」の 1 行で呼んだ。段階 2 (無人の実行) は未着手

## 本人に聞きたいこと
1. docs/plan/v3-phase1.md の承認 (目的・完了条件・入れないもの)。答えが無くても進められる範囲: なし (版の承認は 1 回要る)
2. 同文書「承認に含めるもの」3 点: 調整パネルを実験の道具として入れてよいか (concept.md の「難易度調整変数」との関係) / concept.md に「曲は敵のもの、プレイヤーの音は別の楽器」の 1 行を足してよいか / 理想の 1 フレーズの動作イメージ (docs/play-image.md) を Claude が下書きしてよいか。答えが無くても進められる範囲: 調整パネルと play-image.md は進める。concept.md の 1 行は書かない
3. 「攻撃判定は自機の 1.2 倍」の「サイズ」は直径と読んだ (扇の半径 = 自機の直径 × 1.2 ≈ 0.06)。違えば調整パネルの倍率で直せる。答えが無くても進められる範囲: 全部
