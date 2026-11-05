# v6 計画 Phase 2 セッション C: 音の仕組みと音作りのページ、文書、公開
作成 2026-11-05。Phase 1 (docs/plan/v6-phase1.md、承認済み 2026-11-05) の T7〜T9。承認は不要 (CLAUDE.md「承認の扱い」)。接頭辞は `[作品]`。この セッションの最後に push して公開する (v6 の公開は 1 回)。

## 事前条件
- セッション A (両手) と B (大技) が完了している。`npm test` 200 件、`npm run build` 通過
- src/audio/engine.ts (撥弦を鳴らす `scheduleSfx`、溜めの持続音 `startCharge` / `stopCharge`)、pluck.ts (`renderPluck`)、pitch.ts (音高の 3 案)、main.ts の `playSfx`、measure.html (OfflineAudioContext の使い方)

## T7 (音の仕様と合成器)
- `src/audio/soundspec.ts` (純粋): 音の名前 9 つ (step / normalOn / normalOff / normalMiss / riposte / release / double / cancel / charge)、層 (osc / fm / noise / pluck × 音量・半音差・波形・包絡・滑り・ローパス・歪み・FM・ノイズ・撥弦・溜め始めの音量)、1 音 4 層まで、既定値と範囲、`normalizeLayer` / `normalizeSound` / `normalizeBank` (無い項目は既定、範囲外は端、知らない項目は捨てる、無い音は既定で埋める)、`soundDuration`、`layerHz`
- `assets/sound/v6.json`: 既定の音 (Claude の初期値。本人の言葉から)
- `src/audio/synth.ts`: `playSound` (1 音) と `startSustained` (持続音。音高と層の音量を riseSec で上げる。progress で途中から)。BaseAudioContext を受け、乱数を使わない (ゲームと OfflineAudioContext で同じ波形)
- engine.ts: `bank` を持ち (`setBank`)、`scheduleSfx` は種類 → 音の名前で bank を鳴らす。`startCharge` は bank.charge の持続音。`double` を足す。撥弦の前計算は synth の cache に移す
- pitch.ts: `SoundAction` に `double` (音高は放ちと同じ)。sim に `lastAttackDouble`、main.ts が両手放ちの 2 つ目を double で鳴らす

## T8 (音作りのページと初期値)
- `sound.html` + `src/sound.ts`: 音の名前の選択、基音 (MIDI) の数値、層のつまみ (種類で出し分け)、層の追加・削除、鳴らす / 曲の 1 小節と重ねる (3 拍目) / 波形を描く (OfflineAudioContext)、溜めの進み具合、JSON の書き出し・コピー・読み込み、「この音をゲームに使う」(localStorage `mal.soundBank`)、既定に戻す
- ゲーム (main.ts) は開始のたびに localStorage を読み、あれば既定の代わりに使う。要約の先頭行に「音色 既定 (v6)」か「音色 自作 (sound.html)」
- 初期値: 放ち = 歪んだ鋸歯 + 中音域 (+27 半音 ≈ 830 Hz) の下がるレーザー風 + 1 オクターブ下の「ドン」+ 高域ノイズの「スカン」(0.35 秒)。両手放ち = 同じ 4 層を厚く。溜め = 鋸歯 + ローパス 1200 に、進むと 1 オクターブ下の FM (比 1.41) が 0 から足される。ステップ・通常・返し・相殺 = v5 の撥弦の値を 1 層で

## T9 (文書・不満ノート・公開・完了記録)
- docs/sound-format.md (仕様と使い方)、README「遊ぶ (v6)」(音作りのページ、Bluetooth の注意、要約の読み方、開発コマンド)、CLAUDE.md の文書一覧、タイトルと index.html の版表記、vault:音楽アクション/v6 不満.md (書いてほしいこと 6 点)
- push → GitHub Actions で公開。NEXT.md に「v6 完了」

## テスト
- src/audio/soundspec.test.ts: 正規化 (既定値・端・知らない項目・4 層まで・fallback)、既定の v6.json が 9 音を持ち正規化で変わらない、撥弦の値が v5 のまま、放ち / 両手放ちの層の性質 (鋸歯 + 歪み、約 830 Hz の下がる層、−12 半音、ノイズ、0.5 秒以内、両手放ちは厚い)、溜めの FM が 0 から足される
- Web Audio は node に無いので、鳴らす側は Chrome で: sound.html の波形描画 (放ちと溜め)、保存と既定に戻す、ゲームを 1 回通して要約が出ること

## 既定値
| 項目 | 値 | 理由 |
|---|---|---|
| 層の上限 | 4 | Phase 1 |
| 歪み | tanh(k x)、k = 1 + drive × 20 | 0 で素通し、1 で強い歪み |
| 持続音の止め方 | 0.04 秒のフェード | v5 の CHARGE_FADE_SEC と同じ |
| 自作の音の置き場 | localStorage `mal.soundBank` | 公開を待たずにゲームで聴ける。正本は JSON (v6.json) |
| 音作りのページの曲 | candidate-2 の 1 小節目、3 拍目に鳴らす | 曲の中で聞こえ方を見るため |

## 完了記録 (2026-11-05)
| 項目 | 結果 |
|---|---|
| T7 仕様 | soundspec.ts (型・既定値・範囲・正規化・長さ)、assets/sound/v6.json (9 音)。テスト 7 件 (soundspec.test.ts) |
| T7 合成器 | synth.ts: osc / fm / noise / pluck × 歪み (WaveShaper) × ローパス × 包絡 (撥弦は音量だけ)、音高の滑り、持続音 (音高と層の音量を riseSec で上げる、progress で途中から、フェードで止める)。文脈ごとの前計算 (ノイズ・撥弦・歪みの曲線) |
| T7 engine | `DEFAULT_SOUND_BANK`、`setBank` / `getBank`、`scheduleSfx` が bank を鳴らす (種類 → 音の名前)、`startCharge(…, progress)`、`double`。pluck.ts は renderPluck と pluckSpec を残す (テストと synth が使う) |
| T8 ページ | sound.html / src/sound.ts。Chrome で確認: 放ちと溜めの波形が描ける (8316 / 7047 ピクセル点灯)、保存で localStorage に 4.6 KB、既定に戻すで消える、コンソールにエラー無し |
| T8 ゲーム | main.ts が開始時に localStorage を読んで setBank。要約の先頭行に音色の出どころ。両手放ちの 2 つ目は double の音。Chrome でゲームを 1 回通し、v6 の要約 (命中の内訳、手の内訳、大技の行、3 行の譜) が出てエラー無し (自動操作タブなので入力は無し、被弾 14) |
| T9 文書 | docs/sound-format.md、README「遊ぶ (v6)」、CLAUDE.md の文書一覧、タイトルと index.html を v6 に、vault:音楽アクション/v6 不満.md |
| テスト・ビルド | `npm test` 207 件 (20 ファイル)、`npm run build` (tsc + vite。sound.html を含む 4 ページ) 通過 |

確認できていないこと (本人の手で): 初期値の音の良し悪し (Claude は判定しない)、音作りのページの使い心地、Bluetooth / 有線 / ゲームモードでの聞こえ方。
