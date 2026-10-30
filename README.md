# music_action_lab
音楽アクションの最初の実験。20 秒の戦闘シーン (敵 1 体、曲 1 つ) を、遊んだ人間の不満だけを源泉にして育てる。

## 遊ぶ (v4)
- URL: https://pokadokan-boop.github.io/music_action_lab/
- PC のブラウザで開く。DualSense を USB か Bluetooth でつなぎ、ボタンを 1 回押すと認識される。キーボードでも遊べる
- 操作: 左スティック (WASD / 矢印) で移動、× (Space / J) で攻撃。常に浮いていて重力は無い
- 攻撃の向きはスティック (WASD) の向き。無入力なら敵の方向。当たるのは前方の扇 (見えている扇がそのまま判定) の中だけ
- 敵の突進・レーザー・叩きつけは、すべて予告開始時の自機の位置を狙う (追尾はしない)。立ち止まっていると当たる
- 敵の攻撃が自機に触れる瞬間の前 100 ms〜後 50 ms に、来る方向へ向けて攻撃すると相殺できる。触れた後でも 50 ms 以内なら被弾が取り消される。予告が黄の攻撃 (突進・レーザー) は相殺でき、赤 (叩きつけ) は相殺できず避けるしかない
- タイトルの「調整」で相殺の窓・自機と敵の大きさ・扇の半径・向きの許容角を動かせる。選んだ値は結果の要約の先頭行に出るので、不満ノートに貼れば次の版の既定値に反映される
- v4 で入ったもの: 自機は人型、敵は雫形で、構え (立つ・攻撃・相殺・被弾・構える / 攻撃の型ごと・止まっている) が変わる。突進を捌けた (相殺した、または当たらなかった) ときだけ、敵は通り過ぎた所で 1 拍止まる。これは「結果で分岐する動き」の部品を 1 箇所試したもので、一連の流れの設計は次の版 (docs/plan/v4-phase1.md)
- 振り付けは v4 の 1 本。「はじめる」はクリックか Enter (ブラウザの制約で、最初の音の有効化にはクリックかキーが要る)
- 20 秒で終わり、結果画面に記録の要約が出る。「コピー」して不満ノートに貼る
- 曲候補を聴く: https://pokadokan-boop.github.io/music_action_lab/candidates.html

## 不満を書く
vault の `音楽アクション/<版> 不満.md` (v4 なら `v4 不満.md`) に書く。1 回の不満につき 4 行以内: 版 / 何が / いつ (phrase 番号か場面) / どう嫌か。好きだった点は `+` を頭に付けて任意で。自由記述でも分解できる (docs/decisions/v2-feedback.md)。

## 次のセッションの手順
- 次は `claude` を開くだけでよい。Claude が docs/NEXT.md の「次の 1 手」から始める (規律は CLAUDE.md「セッションの始め方」「区切りの作り方」)
- 不満から次の版を作る一般の手順:
  1. docs/concept.md (保護対象) を読む
  2. vault の不満ノートと、貼られた結果の要約を読む
  3. 不満を具体的な変更に落とす。変更が concept.md の保護対象を侵すなら棄却する
  4. 2 案比較: 不満が指す軸を 1 つだけ変えた版と、直す前を並べて遊べるようにする (振り付けはデータなので、ファイルを足せば選択肢が増える)
  5. commit の先頭に `[作品]` (このゲームに属するもの: 曲・振り付け・config・ゲームのコードと文書) か `[仕組み]` (開発の流れ: NEXT.md・セッション規律・不満の受け口・hook など) を付ける (docs/decisions/commit-labels.md)

## 開発
```
npm install
npm run dev              # ローカルで遊ぶ
npm test                 # Vitest (拍グリッド、振り付けの検査、決定性)
npm run build            # 型チェック + ビルド
npm run gen:candidates   # 曲候補の再生成
npx tsx scripts/print-grid.ts assets/midi/candidate-2.mid        # 拍グリッドとフレーズ一覧
npx tsx scripts/validate-choreo.ts assets/choreo/v4.json         # 振り付けの検査 (自機狙い・等方座標・分岐の検査を含む)
npx tsx scripts/sync-report.ts assets/choreo/v4.json             # 音と動き・当たりのずれを ms で見る
node scripts/steward/collect.js                                  # 判断者が使うデータ (JSON) を見る
node scripts/steward/run.js --force                              # 無人の判断者を今すぐ走らせる (docs/plan/loop-phase2.md)
node scripts/steward/register.js query                           # Task Scheduler の登録状態 (create / delete / run もある)
```
- 合否条件は `acceptance.json`。Claude Code の hook が Edit/Write を止める (docs/decisions/acceptance-guard.md)
- 振り付けの形式: docs/choreo-format.md。v4 の狙い: assets/choreo/README.md。理想の動作イメージ (本人が直す叩き台): docs/play-image.md
- 設計と計画: docs/system-design.md、docs/plan/
- push すると GitHub Actions が Pages に配置する
