# acceptance.json の編集ガード (2026-10-21)
- `.claude/settings.json` の PreToolUse hook (Edit|Write) が `scripts/guard-acceptance.js` を呼び、`tool_input.file_path` の末尾が acceptance.json なら exit 2 で止める
- 確認: Edit で `sceneSeconds` を 20 → 21 にしようとして hook が止めた (stderr に禁止の理由が出た)。forward slash とバックスラッシュの両方のパス形式で止まることをスクリプト単体でも確認した
- 止まらないもの: Bash 経由の書き換え (sed、node 等)。hook はツール名で発火するため。抑止としての位置づけで、機械強制ではない
- 変更が要るとき: 人間に理由を示し、人間が編集する
