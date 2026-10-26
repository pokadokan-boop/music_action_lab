# music_action_lab
音楽アクションの最初の実験 (20 秒の戦闘シーン) と、それを自律で回す仕組みを一緒に育てるプロジェクト。人間はコンセプトと、手触りへの反応・不満を返す役に限る。

## 文書
- docs/system-design.md: 最初の実験の方向、仕組みの設計、時間の制約、未決事項。作業前に「最初の実験の方向」を読む
- docs/concept.md: 最初の実験で扱うゲームの範囲。保護対象
- docs/feasibility.md: 音楽とゲームの技術調査と実現可能性
- docs/plan/v0-phase1.md: v0 の目的とタスク一覧 (承認済み)。docs/plan/v0-phase2-core.md がセッション A (T0〜T1)、docs/plan/v0-phase2-game.md がセッション B (T7〜T5) の詳細
- docs/plan/v1-phase1.md: v1 (曲に乗っている感じ)。完了記録あり
- docs/plan/loop-phase1.md: 回す仕組み (引き継ぎファイル NEXT.md とセッション規律)。次のセッションはまずこれを承認して実装し、続けて v2 に入る
- docs/plan/v2-phase1.md: v2 (当たりの時刻の基準と「捌く」)。「新しいセッションの始め方」の節に読む順がある
- docs/research/av-sync-verification.md: 音と絵の同期を耳で聴かずに確かめる方法の調査
- docs/choreo-format.md: 振り付けデータの形式と機械検査
- docs/decisions/: 曲の選択、合否条件ガードの確認など、実験中の決定の記録
- README.md: 遊び方、不満の書き方、次のセッション (v1) の手順、開発コマンド
- 不満の受け口: vault:音楽アクション/v0 不満.md。v1 を作るセッションは docs/concept.md → このノート → 貼られた結果の要約、の順に読む

## vault の参照
- vault ルートの絶対パスは `CLAUDE.local.md` (git 未追跡) に書く。公開リポジトリにローカルのパスを置かないため
- 文書中の `vault:<パス>` は vault ルートからの相対パス
- 構想の経緯 (出発点・問題意識・旧プロジェクト refine_idea の教訓・外部の意見): vault:with-codexの後継-人間を不満の源泉にする自律システム.md
- ゲームのアイデア原本: vault:音楽アクション/ (入口は vault:音楽アクション/入り口.md)
- 思いついた段階のアイデアは vault 側に置かれる。仕様になったもの・実装計画はこのプロジェクト側に書き、vault の関連ノートは必要時に読みに行って取り込めるものを取り込む (vault:_meta/integration-with-ai.md 1.4)
