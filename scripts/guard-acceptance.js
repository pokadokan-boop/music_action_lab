// PreToolUse hook: Edit / Write が acceptance.json を触ろうとしたら exit 2 で止める。
// 合否条件はエージェントが変えられない場所に置く (docs/feasibility.md「実現可能性のフック」)。
// Bash 経由の書き換えは止められない。抑止としての位置づけ。

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string') {
    process.exit(0);
  }
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('/acceptance.json') || normalized === 'acceptance.json') {
    process.stderr.write(
      'acceptance.json は合否条件のため Edit/Write を禁止している。変更が要るなら人間に理由を示して判断を求める。\n',
    );
    process.exit(2);
  }
  process.exit(0);
});
