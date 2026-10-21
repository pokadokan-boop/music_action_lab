# v0 計画 Phase 2 (前半): 基盤・合否条件・拍グリッド・曲候補
作成 2026-10-21。Phase 1 は docs/plan/v0-phase1.md (承認済み)。この文書はセッション A (T0 → T6 → T2 → T1、人間が曲を選ぶまで) の詳細。後半 (T7 → T3 → T4 → T5) は docs/plan/v0-phase2-game.md。

実装前に読むもの: docs/concept.md (保護対象)、この文書。vault の原本は読まなくてよい (必要な言葉は concept.md に写してある)。

## 共通の決め
### ディレクトリ
```
music_action_lab/
  package.json  vite.config.ts  tsconfig.json  .gitignore
  index.html          ゲーム本体 (後半)
  candidates.html     曲候補を聴くページ
  acceptance.json     合否条件 (T6。hook で Edit/Write を止める)
  .claude/settings.json   hook 登録
  .github/workflows/deploy.yml   Pages 配置
  scripts/gen-candidates.ts      曲候補の生成
  scripts/guard-acceptance.js    hook 本体
  assets/midi/candidate-1.mid .. -3.mid
  assets/choreo/a.json  b.json   (後半)
  src/core/      純粋関数。DOM・Audio に触らない。Vitest の対象
  src/audio/     Web Audio。時計の正
  src/input/     Gamepad・キーボード (後半)
  src/render/    Canvas 描画 (後半)
  src/ui/        タイトル・結果画面 (後半)
  src/config.ts  手触りの調整値 (速度・射程・半径)。[作品] 扱い
  docs/decisions/song-choice.md  曲の選択と理由
```

### 座標と単位
- 画面は 16:9。位置は正規化座標 x, y ∈ [0, 1]。y = 0 が上
- 時間の単位は秒。拍は小数つきの拍番号 (beat)。`beatSec = 60 / bpm`。`sec = beat * beatSec`
- 固定ステップ dt = 1/120 秒。描画は requestAnimationFrame で、音の時計から経過時間を読んで必要な回数だけ step する

### 時計
- `src/core/clock.ts`: `GameClock { now: number; advanceTime(ms): number[] }`。advanceTime は進んだ分の step 時刻を返す。テストで使う
- ブラウザでは `AudioContext.currentTime - startTime` を now にする。音の予約は startTime 基準で絶対時刻に置く (lookahead 100 ms、25 ms ごとに予約)

### 拍グリッド
- `src/core/grid.ts`: `buildGrid(midiJson): Grid`。Grid = `{ bpm, beatSec, beatsPerBar, totalBeats, durationSec, melodyOnsets: number[] (拍番号), phrases: Phrase[] }`
- Phrase = `{ index, startBeat, endBeat, noteBeats: number[] }`。メロディトラック (名前 `melody`) を、1 拍以上の休符で切る。切れ目が無ければ 2 小節ごとに切る
- テンポは最初の 1 つを使う (候補は一定テンポで作る)

### 振り付け形式 (後半で中身を書く。形式はここで固定)
```json
{
  "id": "a",
  "song": "candidate-2",
  "intent": "音の高低に合わせて敵が上下する",
  "attacks": [
    {
      "phrase": 0,
      "type": "dash",
      "telegraphBeat": 8,
      "hitBeat": 10,
      "activeBeats": 0.25,
      "path": [{ "beat": 8, "x": 0.75, "y": 0.5 }, { "beat": 10, "x": 0.3, "y": 0.5 }],
      "hitbox": { "shape": "circle", "r": 0.06 }
    }
  ]
}
```
- type は `dash` (本体が path を動き、active 区間の本体が当たり) / `burst` (path 終点の円が hitBeat で発生。予告は中心 → 中間 → 外側の同心円を拍ごとに出す) / `shot` (hitBeat に path 終点へ向けて弾を出す。予告は線)
- path の補間は区間ごとにイージングアウト (`1 - (1 - t)^3`)
- `hitBeat` は拍、半拍、またはその phrase の noteBeats のいずれかに一致する
- `src/core/choreo.ts`: 型、`validateChoreo(choreo, grid, acceptance): Violation[]`、`hitboxAt(attack, beat): Shape | null`、`enemyPosAt(choreo, beat)`

### 合否条件 `acceptance.json`
```json
{
  "sceneSeconds": 20,
  "telegraphLeadBeatsMin": 2,
  "hitOnGridToleranceMs": 1,
  "gridSubdivision": 2,
  "dodgeTimeMarginRatio": 0.2,
  "determinism": { "sameInputSameLogHash": true }
}
```
- hitOnGridToleranceMs は浮動小数の丸め幅であり、意味上は 0 ms
- 避けられる位置: 連続する当たり i-1, i について、12×12 の格子点のうち i の active 区間で一度も当たらない点 p と、i-1 で当たらない点 q が存在し、`dist(p, q) <= playerSpeed * (t_i - t_{i-1}) * (1 - dodgeTimeMarginRatio)`。playerSpeed は src/config.ts から読む (手触りの調整で変わるため acceptance には置かない)

### commit の規律
- メッセージ先頭に `[仕組み]` か `[作品]`。基盤・テスト・hook・配置は `[仕組み]`、曲・振り付け・config の調整は `[作品]`
- commit は pokadokan-boop 名義で行う。リポジトリローカルに `user.name = pokadokan-boop`、`user.email = 326803683+pokadokan-boop@users.noreply.github.com` を設定する (本人の他のアカウントとの結びつきを公開 commit に残さない)
- 日本語メッセージは scratchpad のファイルに書いて `git commit -F` で渡す

## T0 (リポジトリ基盤)
事前条件: なし。node 24、git 2.52、gh (pokadokan-boop を含む複数アカウントが登録済み) がある。

実装:
1. `git init`。上記の user.name / user.email をローカル設定
2. `npm create vite@latest` 相当を手で置く: vanilla-ts テンプレートの最小構成 (index.html、src/main.ts、vite.config.ts、tsconfig.json)。devDependencies に vite、typescript、vitest、tsx。dependencies に @tonejs/midi
3. vite.config.ts: `base: '/music_action_lab/'`、`build.rollupOptions.input` に index.html と candidates.html。test は `environment: 'node'`
4. .gitignore: node_modules、dist、tmp
5. `gh auth switch --user pokadokan-boop` → `gh auth setup-git` (git の資格情報を gh に向け、他アカウントの資格情報で push されるのを防ぐ) → `gh repo create pokadokan-boop/music_action_lab --public --source . --push`
6. `.github/workflows/deploy.yml`: push to main で `npm ci && npm run build` → actions/upload-pages-artifact → actions/deploy-pages。`gh api -X POST repos/pokadokan-boop/music_action_lab/pages -f build_type=workflow` で Pages を有効化
7. 空ページに「music_action_lab v0」と書いて push。Actions の完了を `gh run watch` で待ち、URL `https://pokadokan-boop.github.io/music_action_lab/` を開いて確認する
8. プロジェクトの CLAUDE.md「文書」に docs/plan/ の 3 本を追記

成果物: 開ける URL、最初の commit (`[仕組み] リポジトリ基盤と Pages 配置`)。
確認: `npm run build` の終了コード 0、URL が 200 で開く。

## T6 (合否条件の固定)
事前条件: T0。

実装:
1. `acceptance.json` を上記の内容で置く
2. `scripts/guard-acceptance.js`: stdin の JSON から `tool_input.file_path` を読み、正規化して末尾が `acceptance.json` なら stderr に理由を書いて exit 2。それ以外は exit 0
3. `.claude/settings.json`:
   ```json
   { "hooks": { "PreToolUse": [ { "matcher": "Edit|Write",
     "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guard-acceptance.js\"" } ] } ] } }
   ```
   パスは forward slash。hook 登録は保存のみで反映される
4. 確認: Edit で acceptance.json に 1 文字足そうとして止まること。止まった事実を docs/decisions/acceptance-guard.md に 2 行で記録する (Bash 経由は止まらないことも書く)

成果物: acceptance.json、hook、確認記録。commit `[仕組み] 合否条件と編集ガード`。

## T2 (拍グリッドと振り付け形式)
事前条件: T0、T6。

実装:
1. `src/core/clock.ts` と `clock.test.ts`: advanceTime(1000) が 120 step を返す。端数は持ち越す
2. `src/core/grid.ts` と `grid.test.ts`: テスト用に小さな MIDI を @tonejs/midi で生成して buildGrid に渡す。bpm、totalBeats、phrases の切れ目を検査する
3. `src/core/choreo.ts` と `choreo.test.ts`:
   - `validateChoreo` の 4 検査: (a) telegraphBeat が hitBeat より `telegraphLeadBeatsMin` 以上前、(b) hitBeat がグリッド (1/gridSubdivision 拍) か phrase の noteBeats に `hitOnGridToleranceMs` 以内で一致、(c) 避けられる位置の存在 (共通の決めのアルゴリズム)、(d) path の beat が単調増加
   - `hitboxAt`: dash は active 区間 `[hitBeat, hitBeat + activeBeats]` の本体円、burst は同区間の終点円、shot は hitBeat から弾が画面外に出るまでの弾の円 (弾速は config)
   - テストは acceptance.json を読み、違反する振り付けを 4 種類与えて各 Violation が出ること、正しい振り付けで空になることを見る
4. `src/core/log.ts`: `GameLog { events: Event[]; summary(): string; hash(): string }`。Event は `{ t, beat, kind: 'attack' | 'hit' | 'damage', offsetMs?, attackIndex?, cls?: 'on' | 'off' | 'miss' }`。hash は events の JSON の FNV-1a (依存を増やさない)
5. `src/core/sim.ts`: `step(state, input, dt): state` の骨格。敵位置は `enemyPosAt`、プレイヤー移動・攻撃・当たりは後半で埋める。determinism テスト: 同じ入力列を 2 回流して log.hash が一致
6. `src/config.ts`: `playerSpeed 0.6`、`playerRadius 0.04`、`enemyRadius 0.05`、`meleeRange 0.12`、`rangeAssist 0.06`、`shotSpeed 0.8`、`onBeatWindowBeats 0.125`
7. docs/choreo-format.md に形式の説明を 40 行以内で書く (後半のセッションと、不満を書く人間が読む)

成果物: src/core/ 一式とテスト、docs/choreo-format.md。commit `[仕組み] 拍グリッド・振り付け形式・記録`。
確認: `npx vitest run > tmp/vitest.log 2>&1` の終了コード 0 と、ログ内の `Tests N passed` 行を読む。

## T1 (曲候補と選択)
事前条件: T0、T2 (grid が候補を読めることを確認に使う)。

実装:
1. `src/audio/engine.ts`: `createEngine(): { ctx, start(midiJson, atSec), scheduleSfx(kind, atSec), now() }`。トラックごとに音色を固定: melody は矩形波、bass は三角波、drums はノイズ短音 (36 キック、38 スネア、42 ハット)。音量は -12 dB 程度。lookahead 予約
2. `scripts/gen-candidates.ts`: 3 候補を決め打ちのパターンで生成し `assets/midi/` に書く。長さは「約 20 秒」になる小節数 (`round(20 / barSec)` 小節)
   - 1: ジャージークラブ風。BPM 140 台。キックが 3-3-2 の跳ねる配置、メロディは 1 小節 4 音以下
   - 2: トラップ風ハーフタイム。BPM 140 台だがスネアは半分の速さ、ベースが長く鳴る。メロディは少なく間が多い
   - 3: ミニマルテクノ風。BPM 130 台。4 つ打ちキック、同じ 2 音の反復、メロディは 2 小節で 1 回動く
   - トラック名は `melody` / `bass` / `drums`。drums はチャンネル 10
   - 音楽参考.md の言葉は目安。機械判定はしない
3. `candidates.html` + `src/candidates.ts`: 3 候補のボタン。押すと engine で再生 (ユーザー操作後に AudioContext を作る)。各候補の狙いを 1 行表示。スマホでも押せる大きさ
4. 配置して URL を人間に渡す。人間が 1 つ選び、理由を一言返す
5. `docs/decisions/song-choice.md` に候補 3 つの狙い、選ばれた候補、理由を記録

成果物: engine、生成スクリプト、3 つの .mid、候補ページ、選択記録。commit は `[作品] 曲候補 3 つ` と `[仕組み] 音の再生と候補ページ` に分ける。
確認: `npx tsx scripts/gen-candidates.ts` の終了コード 0。grid.test に実物の candidate-1.mid を読むテストを 1 つ足し、phrases が 1 つ以上出ること。候補ページをブラウザで開いて 3 つ鳴ること (人間に確認を頼む)。

## セッション A の終わり方
- T1 まで commit と push が済んでいる
- 人間に候補ページの URL を渡し、選択を待つ
- 次のセッションは docs/plan/v0-phase2-game.md と docs/decisions/song-choice.md から始める
