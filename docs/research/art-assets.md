# 資産としての絵の作り方の調査 (2026-11-07)
目的: 絵が描けない本人 + コードを書く Claude で、2D 横視点の敵キャラの「資産としての絵」(静止画、構え 5 種のコマ、形態変化 3 段 = 15 コマ程度) を揃える方法を比べる。結論は書かない。本人が読んで次の版で決める (docs/plan/v7-phase1.md「目的」5、docs/concept.md「曲と絵の役割」)。
調べ方: search サブエージェントが Web を検索 (2026-11-07)。[公式] = ベンダーの公式ページや docs、[第三者] = 比較サイトやブログ (数値は要再確認)。公式ページが取れなかったものは末尾の「未確認」に。
前提: 今は線と面をコードで描いている (src/render/figures.ts、prototypes/morph-slider.html)。画像の資産を持つ段になったらエンジンの判断をやり直す (docs/plan/v4-phase1.md「エンジンの判断」の条件 d)。人間の役はコンセプトと反応 (docs/system-design.md)。

## 5 つの観点
1. 15 コマ (構え 5 × 形態 3) を揃えられるか、同一キャラに見えるか (一貫性)
2. 人間側の作業は何か (選ぶ・貼る・指示する・描く)
3. Claude が無人で確かめられるか (API の有無、スクリーンショットで検証できるか)
4. 費用と権利
5. ブラウザ + Canvas のまま使えるか (エンジン移行との関係)

## (a) AI 画像生成 + 一貫性の手立て
- 一貫性: 2026 年の主流は「1 枚に全コマを並べて出す」方式。Gemini の画像生成はキャラ参照画像を 4〜5 枚 (Pro はスタイル参照も含め最大 14 枚) 渡し、複数ターンで同一キャラを保つ設計 [公式] https://aistudio.google.com/docs/image-generation 。GPT Image 2.5 で参照 1 枚から 16 コマのシートを 1 プロンプトで出す例 [第三者] https://www.indiehackers.com/post/gpt-image-2-5-a-full-sprite-sheet-from-one-reference-110562d19f
- 実務の知見 (Claude 用のスキルとして整理されたもの): 既存の 1 コマを anchor にして「N コマを 1 行に」と頼む。コマ単位の生成はドリフトする。1 ストリップ 4〜8 コマまで。出力後に検出 → 共通スケールで正規化 → スライスが要る。失敗の型はコマのサイズ揺れ・色ドリフト・幻覚 [第三者] https://www.skills.lc/jamditis/claude-skills-journalism/jamditis-claude-skills-journalism-animated-sprite-gen-skill-md
- Stable Diffusion 系 (ControlNet OpenPose + IP-Adapter): 研究 (Sprite Sheet Diffusion) では主観の一貫性 0.89〜0.93 だが、「姿勢推定は誇張体型や非人型のスプライトで失敗し、手で注釈が要った」と明記 [論文] https://arxiv.org/html/2412.03685 。実用はキャラシート生成 → LoRA 学習 (10〜15 枚) の 2 段構え [第三者] https://diffusiondoodles.substack.com/p/how-to-train-a-lora
- Midjourney: v7 の Omni Reference (`--oref`) が同一キャラ維持の仕組み。公式 API は無い (Discord / Web 操作) [第三者] https://www.cometapi.com/how-to-use-omni-reference-in-midjourney-v7
- Scenario: 参照画像 + 独自モデル学習。スプライトシートは「画像 → 動画 → コマを切り出して並べる」手順で専用の機能は無い [公式 help] https://help.scenario.com/en/articles/create-spritesheets-with-scenario
- Layer.ai: 表情シート・差分のツール、独自スタイル学習。スプライトシートの機能は未記載 [公式] https://layer.ai/pricing
- 形態 3 段は参照を差し替えて「同じ骨格と配色で装飾を増やす」指示になるので、段ごとに別キャラ扱いのドリフトが起きやすい (anchor 方式の制約からの推定。直接の出典なし)
- 人間の作業: 良いコマを選ぶ、anchor の 1 枚を決める、色ドリフトを目で弾く。描かないが「選ぶ」量が多い
- 無人検証: Gemini / OpenAI / Layer / Scenario (Starter 以上) は API あり。Claude が生成 → スライス → 画像を読んで粗い確認はできる。厳密な一貫性は CLIP 類似度などの数値化が要る。Midjourney は無人化できない
- 費用と権利: Gemini 画像 1 枚 $0.03〜0.13、全画像に SynthID の透かし [公式] https://aistudio.google.com/docs/pricing 。OpenAI は画像出力 $30 / 1M トークン [公式] https://developers.openai.com/api/docs/pricing 。Scenario の Free は個人・評価のみ、Starter $15/月〜で API と商用可 [公式] https://help.scenario.com/en/articles/pricing-plans/ 。Layer $10/月〜、全ユーザー商用可 [公式] https://help.layer.ai/en/articles/11057280-commercial-use 。Midjourney は有料加入者が生成物を所有 [第三者] https://terms.law/2026/01/15/midjourney-commercial-use-rights-complete-2026-guide/ 。著作権: 米国著作権局は「プロンプトだけでは著作者性なし」。Steam はプレイヤーに見える AI 生成物の申告が要る [第三者] https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/
- Canvas: 出力は PNG なので drawImage でそのまま。スライスと正規化は Node で書ける。エンジンに依存しない

## (b) AI 3D モデル生成 → 決まった角度でレンダして 2D のコマに
- 一貫性: 1 体の 3D モデルから角度と姿勢を変えて描くので、同一キャラの問題はほぼ消える。代わりに形態 3 段は 3 体のモデル (か 1 体の改変) が要る
- Tripo: リグの種類は二足 / 四足 / 六足 / 八足 / 鳥 / 蛇 / 水棲。プリセット動作 100 以上だが 90 以上は二足用で、非人型は 16 種。GLB / FBX 出力 [公式] https://developers.tripo3d.com/en/models/rig https://developers.tripo3d.com/en/models/animation
- Meshy: 自動リグは「標準的な二足の人型のみ」。付属動作は歩き・走り、他は有料の Animation API [公式] https://docs.meshy.ai/en/api/rigging-and-animation
- 構えはプリセット動作の 1 フレームを切るか、Blender で手付け。非人型・異形はリグが通らない率が上がる
- 2D 化: Blender のヘッドレス実行で GLB → 透過 PNG をバッチ化する MIT のツールあり (4 方向、オートクロップ) [公式 repo] https://github.com/coreway-labs/blender-sprite-render 。横視点なら角度は 1 つ
- 人間の作業: 生成モデルの見た目の採否、リグ失敗時の作り直しの判断。ポーズを手で付けるなら Blender の操作
- 無人検証: Tripo / Meshy とも API あり (Meshy は Pro 以上)。Blender はヘッドレスで動く。生成 → リグ → 動作 → レンダ → PNG まで無人の流れにでき、結果は Claude が画像を読んで確かめられる
- 費用と権利: Meshy Free 100 クレジット/月で出力は CC BY 4.0、Pro 月 3,084 円で生成物は利用者所有、API は Pro 以上 [公式] https://www.meshy.ai/pricing 。Tripo Free は CC BY 4.0 かつ非商用、商用は有料 (約 $12〜20/月) [第三者] https://costbench.com/software/ai-3d-generation/tripo-ai/free-plan/ 。Blender の出力画像は自由
- Canvas: 成果物は PNG のコマなのでそのまま。将来 3D のエンジンに行くならモデルがそのまま資産になる唯一の方法

## (c) パラメトリックなベクタ / 手続き描画 (今の延長。コードで骨組みと部品を描く)
- 一貫性: 同じ部品を同じコードで描くので定義上 100%。構え 5 種は関節の角度の表、形態 3 段は部品の差し替えと値 (prototypes/morph-slider.html がこの形)。絵の魅力はコードを書く側の造形力に依存し、手続き描画そのものを担う既製ライブラリは見当たらない (Canvas の骨格ライブラリは画像を骨に貼る前提) [第三者] https://github.com/Laquendi/Cani2D
- 2D 骨アニメのツールとの違い: Spine は Essential $69 / Professional $379 (セール時。runtime を使うには editor のライセンスが要る)、spine-ts の Canvas 版はメッシュ・クリッピング非対応 (WebGL なら全部) [公式] https://esotericsoftware.com/spine-purchase https://esotericsoftware.com/git/runtimes/spine-ts 。Rive は runtime が MIT、エディタは Free (書き出しにスプラッシュ) / $9 月で除去 [公式] https://rive.app/pricing 。DragonBones は無料 OSS。Godot は Skeleton2D / Bone2D / Polygon2D でカットアウト、AnimationPlayer で動かす (公式 docs は作業中の表記) [公式] https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html 。いずれも「部品の絵」は別に要る (描くか (a) (d) (e) で用意)。コードで部品まで描く純手続き型だけが絵の調達ゼロ
- 人間の作業: 見た目への反応 (形・色・動きの好み) を返すだけ。描く・選ぶ・貼るは不要。骨ツールを使う場合はエディタの操作が要る
- 無人検証: 最も強い。Canvas の描画結果をヘッドレスブラウザでスクリーンショットし Claude が読む。関節の角度の表は単体テストで検査できる。外部 API 不要、費用ゼロ
- 費用と権利: 純手続き型は費用ゼロ、権利は自分 (AI 支援のコードは、人の実質的な改変が無ければ保護されにくいとの整理あり。上の promise.legal)。Rive runtime は MIT、Spine は editor 購入
- Canvas: 純手続き型は Canvas に密結合 (移行時は描画コードの書き直し)。Rive / Spine はエンジン横断の runtime があり移行に強い (Spine の Canvas 版は機能制限)

## (d) ピクセルアートの生成・編集ツール
- 一貫性: PixelLab は「参照画像 + 各コマの骨格 (keypoints)」で生成する animate with skeleton を持つ。キャンバスは 16〜256 px 角。推奨は「1 コマ固定 → 2 コマ生成」の繰り返しで、guidance / fixed head / palette / seed で揺れを抑える。二足と四足の骨格に対応 [公式 docs] https://www.pixellab.ai/docs/tools/animate-with-skeleton 。Retro Diffusion は API に advanced animation (参照画像必須、32〜256 px、4〜16 コマ、idle / attack / custom など) と 7 方向の rotate。参照画像を最大 9 枚受け付け、「1 度作ったキャラを参照に回す」運用を推奨 [公式 repo] https://github.com/Retro-Diffusion/api-examples 。Aseprite は手描き・編集のツール (買い切り、出力は自由) [公式] https://www.aseprite.org/faq 。形態 3 段の差分は inpaint で元絵から派生させる手順
- 人間の作業: PixelLab は骨格を直す・コマを選ぶ (GUI 前提の工程が多い)。Retro Diffusion は API 運用なら選ぶだけ。Aseprite を使うなら描く
- 無人検証: 両方 API と MCP あり (PixelLab: Python SDK + MCP、Retro Diffusion: API v2 + MCP)。小さな px なら Claude の画像読みでも確認しやすい
- 費用と権利: Retro Diffusion は前払いクレジットで画像 $0.03〜0.18、animation $0.14〜0.25 [公式 repo]。学習データは許諾済みのピクセルアーティストの作品と明記。PixelLab は第三者で $12/月〜、商用可・出力での AI 学習禁止 [第三者] https://knowara.com/?p=2821
- Canvas: PNG のコマなのでそのまま。ドット絵は `imageSmoothingEnabled = false` で整数倍に表示

## (e) 素材集・外注
- 一貫性: 既製の敵パック (itch.io / Unity Asset Store / OpenGameArt) は待機・歩き・攻撃・被弾・死亡が定番で、このゲーム固有の構え (跳びつき・薙ぎ払い・叩きつけ) と形態 3 段が揃う確率は低い。別パックを混ぜると崩れる。外注は一貫性が最も高いが時間がかかる
- 相場: Fiverr のスプライトシートは $50〜100 / 1 アクション (3〜30 コマ、8 日納期) 級 [出品] https://fiverr.com/sungeek76/create-2d-spritesheet-for-your-indie-game 。スタジオは待機・歩き 1 本 $150〜500、戦闘技 $500〜1,500、1 キャラ一式 $2,000〜8,000 [第三者] https://www.juegostudio.com/blog/2d-animation-budget-for-video-games 。15 コマなら Fiverr で数百〜千数百ドル、修正の往復に数週間
- 人間の作業: 素材集は探す・選ぶ・ライセンスを読む。外注は仕様書を書き、納品を見て修正を頼む (本人の目が要る)
- 無人検証: 素材集は購入後の PNG を Claude が検査できるが、探索と購入は人。外注は無人化できない
- 費用と権利: itch.io はパックごとにライセンスが違う (CC0 / CC-BY / 独自 / 非商用) [第三者] https://cinevva-site.pages.dev/guides/game-asset-licenses 。Unity Asset Store の素材は EULA 準拠なら他エンジンでも使える [公式] https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines 。外注は契約で権利を取れ、人の手描きなので著作権も通常どおり
- Canvas: PNG なので無関係。Spine 形式で納品される外注は runtime のライセンスに注意

## 向き不向きの一覧 (方法 × 5 観点)
| 方法 | 1. 15 コマ・一貫性 | 2. 人間の作業 | 3. Claude の無人検証 | 4. 費用・権利 | 5. Canvas のまま |
|---|---|---|---|---|---|
| (a) AI 画像生成 | 1 行ストリップ + anchor で 4〜8 コマは実用。形態 3 段はドリフトしやすく選別が要る | 選ぶ (量が多い) | API あり。Midjourney は不可 | 1 枚数円〜十数円。Free 枠は非商用が多い。純 AI 部分は著作権なし、Steam 申告 | 可 (PNG) |
| (b) AI 3D → レンダ | 同一モデルなので一貫性は高い。非人型のリグが通るかが関門 | 選ぶ、リグ失敗の判断 | API + Blender ヘッドレスで全工程を無人化できる | Meshy Free は CC BY / Pro 月 3,084 円、Tripo の商用は有料 | 可 (PNG)。3D 移行時はモデルを再利用できる |
| (c) 手続き描画 / 骨ツール | 一貫性は定義上 100%。絵の魅力はコード側の造形次第 | 反応を返すだけ (骨ツールはエディタ操作) | 最も強い (スクリーンショット + 単体テスト、費用ゼロ) | 純手続きは無料・権利は自分。Spine は $69〜、Rive runtime は MIT | 純手続きは Canvas に密結合。Rive / Spine は横断 |
| (d) ピクセル生成ツール | 骨格指定 (PixelLab) や参照 9 枚 (Retro Diffusion) で一貫性の手立てが最も整っている。256 px 以下 | PixelLab は骨格直し (GUI)、Retro Diffusion は選ぶ | 両方 API + MCP あり | Retro Diffusion $0.03〜0.25 / 件、PixelLab $12/月〜 (第三者) | 可 (PNG、整数倍表示) |
| (e) 素材集・外注 | 素材集は固有の構えが揃いにくい。外注は最も一貫するが時間がかかる | 探す / 選ぶ、仕様書と修正指示 | 無人化できない (購入後の検査のみ) | 素材集 $0〜数十、外注 数百〜数千ドル | 可 (PNG) |

## このプロジェクトとの関係 (事実の整理。推奨ではない)
- 人間の役が「反応」に限られる (docs/system-design.md) のと合うのは、人間の作業が「反応を返すだけ」の (c) と、「選ぶだけ」にできる (a) (b) (d) の API 運用。(e) の外注は人間が仕様書と修正の往復を持つ
- 今の回し方 (Claude が作る → push → 公開 URL → 本人がスマホで不満) をそのまま使えるのは、Claude が無人で確かめられる (c) (b) (d) (a)。(c) 以外は外部 API の費用と鍵の管理が加わる
- 形態変化 (段ごとに姿が変わる、少しずつ獣っぽく、自壊で崩れる) は、(c) では値の連続で作れる。(a) (d) では段ごとに別の参照からの派生になり一貫性の手立てが要る。(b) ではモデルを 3 体 (か改変) 用意する
- 「人型は他者を引き継ぎやすい」(部品を継ぎ足せる骨組み) は、(c) の骨組み + 部品の構成と、(b) の人型リグ (Meshy / Tripo の二足が最も対応が厚い) に素直に乗る
- 画像の資産を持つ (a) (b) (d) (e) に進む判断は、エンジンの判断 (条件 d) と一緒に行う。PNG を Canvas で描くだけなら移行は要らないが、絵の資産が増えた先でスプライトの管理・アニメの編集が要るなら、そこで Godot などを再検討する

## 未確認のまま残っている点
- PixelLab の公式料金 (ページが動的読込で取れず)、Retro Diffusion と Rive Free の商用条件の原文、Midjourney の ToS 原文 (403)、Tripo の公式料金 (403)。いずれも第三者の数値のみ
- 各サービスの生成物の実例 (このゲームの像で試していない)。試すなら、選ばれた 2 曲目の敵の最終形態をコードで描いたあと、同じ像を (a) か (d) で 1 枚出して並べるのが比較になる
