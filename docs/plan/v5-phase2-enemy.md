# v5 計画 Phase 2 (セッション B): 敵の配置
作成 2026-11-02。Phase 1 (docs/plan/v5-phase1.md、承認済み) の T6〜T8。セッション A (docs/plan/v5-phase2-player.md) の後。承認は要らない。接頭辞は `[作品]`。

## 決め: 予告の先行は 2 拍のまま (acceptance.json は変えない)
Phase 1 の承認事項 2 は「連なる攻撃の 2 つ目は予告先行 1 拍以上に緩める」だったが、配置を書いてみると全ての音に 2 拍の先行で置ける (Y の 4.5 と 6 は予告 2.5 と 4、X の 16 と 18 は 14 と 16、Z の 8 と 10.5 は 6 と 8)。予告が時間的に重なること (前の攻撃の当たりの瞬間に次の予告が出る) を検査は禁じていない。緩める必要が無い規則は緩めない。`chained` は印として残し (描画と検査の整合に使う)、`telegraph-lead` は全攻撃 2 拍。acceptance.json の編集ガード (docs/decisions/acceptance-guard.md) にも触れない。承認された「緩め」は使わなかった、と本人に伝える。

## T6 連なる攻撃の形式と検査
- `Attack.chained?: boolean`: 同じフレーズの 2 つ目の攻撃に付ける印。検査 `chain-order`: chained の攻撃は、同じフレーズに自分より hitBeat が小さい chained でない攻撃を持つこと
- 敵の位置 (`enemyPosAt`): 攻撃の間の補間に使う「前の終点」を、並び順の最後ではなく拍が最大の終点にする。単一キーフレームの攻撃 (shot / laser) を別の攻撃の path の中に入れ子にできるようにするため (今のままだと入れ子の後で古い点へ戻る動きが出る)
- 構えと向き (`enemyPose`、canvas の `enemyDir`): 予告〜当たりの窓が重なる攻撃が複数あるときは、当たりの窓が先に終わる攻撃を採る (先に来る攻撃の構え)。`currentAttack` を pose.ts に置く
- 予告の描画: chained な攻撃を後ろに持つ攻撃 (1 つ目) の動く輪を二重にする (2 連の印)
- 要約の phrase 表: 攻撃が 2 つのフレーズは 被弾 / 結果 / 相殺 の列を攻撃ごとに「/」で並べる (1 つなら今までどおり)

## T7 v5.json (17 攻撃)
同じモチーフには同じ 2 攻撃。拍 0 (phrase 0 の A♭4) には置かない。`after` は使わない。aim は全て player。
| モチーフ | 1 音目 | 2 音目 (chained) | 狙い |
|---|---|---|---|
| X (phrase 0 / 3 / 6。A♭4 → F4) | shot (A♭4。16 / 32。phrase 0 は無し) | dash (F4。2 / 18 / 34、接触 +0.5) | 呼びの一撃のあと本命の突進。相殺はどちらもできる |
| Y (phrase 1 / 4 / 7。E♭4 → F4) | shot (E♭4 の裏拍 4.5 / 20.5 / 36.5。沈んだ位置から) | laser (F4。6 / 22 / 38) | 裏拍の小さな弾のあとレーザー |
| Z (phrase 2 / 5 / 8。C5 → A♭4) | laser (C5。8 / 24 / 40。戻った位置から) | burst (A♭4。10.5 / 26.5 / 42.5。相殺不可) | 高い音でレーザー、叩きつけで締める。相殺不可は burst だけ (v4 と同じ) |

- phrase 0 は dash だけ (path 0 → 2 → 2.5 → 3。v4 の phrase 3 の形を 16 拍前へ)。曲の最初の 2 拍で突進の予告が出る (遊び始めが v4 より忙しい。本人の不満で見る)
- phrase 1 / 4 / 7 の laser の始点は dash の着地点の近く (v4 の phrase 4 と同じ形)。shot の単一キーフレームは laser の 4.5 の点と同じ位置に置く (敵の位置が飛ばない)
- phrase 2 / 5 / 8 の laser の単一キーフレームは burst の始点 (8 の位置) と同じ
- phrase 3 / 6 の shot の単一キーフレームは dash の始点 (16 の位置) と同じ
- shot の r は 0.02 (laser の太さと同じ)。telegraph は hitBeat − 2
- 攻撃の間隔は最短 1.5 拍 (Y)。`dodgeable` は素の移動速度で見るので、shot と laser (線) の安全位置は広く、通る見込み。通らなければ配置を変える (検査は緩めない)

## T8 文書・公開
- v4.json を外し、choreo-assets.test を `['v5.json']` に。sim-v3.test.ts (v4.json 依存) を v5.json に書き直す (分岐の試しは無くなるので、その 2 件は削る。after の仕組み自体のテストは sim.test.ts のフィクスチャに残る)。sim-v5.test.ts の攻撃番号を v5.json に合わせる
- docs/choreo-format.md (`chained`、enemyPosAt の前の終点、構えの選び方)、assets/choreo/README.md (v5 の狙いの表)、README (振り付けの行、コマンドの v5.json)、concept.md「範囲」の入力の注記 (R1 / ○)、vault:音楽アクション/v5 不満.md (書いてほしいこと)、docs/plan/v5-phase1.md の完了記録 (B)、NEXT.md
