# music_action_lab
音楽アクションの最初の実験。20 秒の戦闘シーン (敵 1 体、曲 1 つ) を、遊んだ人間の不満だけを源泉にして育てる。

## 遊ぶ (v0)
- URL: https://pokadokan-boop.github.io/music_action_lab/
- PC のブラウザで開く。DualSense を USB か Bluetooth でつなぎ、ボタンを 1 回押すと認識される。キーボードでも遊べる
- 操作: 左スティック (WASD / 矢印) で移動、× (Space / J) で攻撃。常に浮いていて重力は無い
- タイトルで振り付け A / B を選ぶ (十字キー左右、A / B キー)。「はじめる」はクリックか Enter (ブラウザの制約で、最初の音の有効化にはクリックかキーが要る)
- 20 秒で終わり、結果画面に記録の要約が出る。「コピー」して不満ノートに貼る
- 曲候補を聴く: https://pokadokan-boop.github.io/music_action_lab/candidates.html

## 不満を書く
vault の `音楽アクション/v0 不満.md` に書く。1 回の不満につき 4 行以内: 振り付け (A/B) / 何が / いつ (phrase 番号か場面) / どう嫌か。好きだった点は `+` を頭に付けて任意で。

## 次のセッションの手順
- 次は `claude` を開くだけでよい。Claude が docs/NEXT.md の「次の 1 手」から始める (規律は CLAUDE.md「セッションの始め方」「セッションの終わり方」)
- 不満から次の版を作る一般の手順:
  1. docs/concept.md (保護対象) を読む
  2. vault の不満ノートと、貼られた結果の要約を読む
  3. 不満を具体的な変更に落とす。変更が concept.md の保護対象を侵すなら棄却する
  4. 2 案比較: 不満が指す軸を 1 つだけ変えた版と、直す前を並べて遊べるようにする (振り付けはデータなので、ファイルを足せば選択肢が増える)
  5. commit の先頭に `[作品]` (曲・振り付け・src/config.ts の調整) か `[仕組み]` (それ以外) を付ける

## 開発
```
npm install
npm run dev              # ローカルで遊ぶ
npm test                 # Vitest (拍グリッド、振り付けの検査、決定性)
npm run build            # 型チェック + ビルド
npm run gen:candidates   # 曲候補の再生成
npx tsx scripts/print-grid.ts assets/midi/candidate-2.mid        # 拍グリッドとフレーズ一覧
npx tsx scripts/validate-choreo.ts assets/choreo/a.json          # 振り付けの検査
```
- 合否条件は `acceptance.json`。Claude Code の hook が Edit/Write を止める (docs/decisions/acceptance-guard.md)
- 振り付けの形式: docs/choreo-format.md。A / B の狙い: assets/choreo/README.md
- 設計と計画: docs/system-design.md、docs/plan/
- push すると GitHub Actions が Pages に配置する
