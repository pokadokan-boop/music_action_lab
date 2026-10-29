// 無人の判断者を起動する (docs/plan/loop-phase2.md T3)。Task Scheduler から毎日呼ばれる。
//   1. 直近の活動 (repo のファイル更新、セッションログの更新) があれば飛ばして .steward/skips.log に書く
//   2. collect.js でデータを JSON にする
//   3. claude -p に docs/steward/judge.md とデータを渡す。使える道具は ALLOWED_TOOLS に絞る
//   4. 判断者が記録を作らなかったら、失敗の記録をこのスクリプトが書いて commit する
// 手動実行: node scripts/steward/run.js [--force] (--force は活動の判定を飛ばす)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll, localDate, projectSlug } from './collect.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stateDir = path.join(repo, '.steward');
const runsDir = path.join(repo, 'docs', 'steward', 'runs');
const GUARD_MINUTES = Number(process.env.STEWARD_GUARD_MINUTES || 30);
const TIMEOUT_MS = Number(process.env.STEWARD_TIMEOUT_MIN || 40) * 60 * 1000;
// 暴走の安全弁。設計上の上限ではないので、足りなければ env で上げる
const MAX_BUDGET_USD = process.env.STEWARD_MAX_BUDGET_USD || '15';
// 判断者に許す道具。これ以外は無人なので自動的に拒否される
const ALLOWED_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash(git *)',
  'Bash(rtk *)',
  'Bash(npm *)',
  'Bash(node *)',
  'Bash(schtasks *)',
];

function log(line) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.appendFileSync(path.join(stateDir, 'run.log'), `${new Date().toISOString()} ${line}\n`);
  process.stderr.write(`${line}\n`);
}

// 一番新しい更新と、それがどのファイルかを返す (飛ばした理由を後から追えるように)
function latestActivity() {
  let latest = { ms: 0, file: null };
  const consider = (file, ms) => {
    if (ms > latest.ms) latest = { ms, file };
  };
  const tracked = spawnSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  for (const f of tracked) {
    try {
      consider(f, fs.statSync(path.join(repo, f)).mtimeMs);
    } catch {
      /* 削除済み */
    }
  }
  const sessions = path.join(os.homedir(), '.claude', 'projects', projectSlug(repo));
  if (fs.existsSync(sessions)) {
    for (const n of fs.readdirSync(sessions)) {
      if (n.endsWith('.jsonl')) consider(`session:${n}`, fs.statSync(path.join(sessions, n)).mtimeMs);
    }
  }
  return latest;
}

function resolveExe(name) {
  const r = spawnSync('where', [name], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const lines = r.stdout.split(/\r?\n/u).map((s) => s.trim()).filter(Boolean);
  return lines.find((s) => /\.(exe|cmd)$/iu.test(s)) ?? lines[0] ?? null;
}

function writeFailureRecord(today, reason) {
  fs.mkdirSync(runsDir, { recursive: true });
  const file = path.join(runsDir, `${today}.md`);
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(
    file,
    `数値: 削除 0、提案 0、質問 0、要望 0\n\n# ${today} の判断者の実行 (失敗)\n- 起動スクリプトが書いた。判断者は記録を作らなかった\n- 理由: ${reason}\n- 生のログ: .steward/ (git 無視)\n`,
  );
  const rel = `docs/steward/runs/${today}.md`;
  spawnSync('git', ['-C', repo, 'add', rel]);
  const msg = path.join(stateDir, 'failure-msg.txt');
  fs.writeFileSync(msg, `[仕組み] 判断者: ${today} の実行の失敗\n\n${reason}\n`);
  const c = spawnSync('git', ['-C', repo, 'commit', '-q', '-F', msg, '--', rel], { encoding: 'utf8' });
  log(`failure record committed: exit ${c.status}`);
  return true;
}

function main() {
  const force = process.argv.includes('--force');
  const today = localDate();
  fs.mkdirSync(stateDir, { recursive: true });

  if (!force) {
    const latest = latestActivity();
    const ageMin = (Date.now() - latest.ms) / 60000;
    if (ageMin < GUARD_MINUTES) {
      const when = new Date(latest.ms).toISOString();
      fs.appendFileSync(path.join(stateDir, 'skips.log'), `${today} 直近 ${ageMin.toFixed(1)} 分に活動があったので飛ばした (${latest.file} が ${when} に更新)\n`);
      log(`skip: activity ${ageMin.toFixed(1)} min ago (${latest.file} at ${when})`);
      return 0;
    }
  }

  if (fs.existsSync(path.join(runsDir, `${today}.md`))) {
    log(`skip: record for ${today} already exists`);
    return 0;
  }

  let data;
  try {
    data = collectAll(repo, today);
  } catch (e) {
    log(`collect failed: ${e.message}`);
    writeFailureRecord(today, `collect.js が失敗: ${e.message}`);
    return 1;
  }
  const dataPath = path.join(stateDir, `data-${today}.json`);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

  const claude = resolveExe('claude');
  if (!claude) {
    writeFailureRecord(today, 'claude が見つからない (where claude が失敗)');
    return 1;
  }

  const judge = fs.readFileSync(path.join(repo, 'docs', 'steward', 'judge.md'), 'utf8');
  const prompt = `${judge}\n\n---\n今日: ${today}\nデータ (同じものが ${path.relative(repo, dataPath).replace(/\\/gu, '/')} にある):\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;

  const args = [
    '-p',
    '--output-format',
    'json',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--max-budget-usd',
    MAX_BUDGET_USD,
    '--no-session-persistence',
    '--name',
    '判断者',
  ];
  log(`start judge: ${claude}`);
  const r = spawnSync(claude, args, { cwd: repo, input: prompt, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(stateDir, `judge-${today}.stdout.json`), r.stdout ?? '');
  fs.writeFileSync(path.join(stateDir, `judge-${today}.stderr.txt`), r.stderr ?? '');

  let summary = '';
  try {
    const j = JSON.parse(r.stdout);
    summary = `cost ${j.total_cost_usd} USD, turns ${j.num_turns}, is_error ${j.is_error}`;
  } catch {
    summary = 'stdout は JSON ではない';
  }
  log(`judge exit ${r.status} (${r.error ? r.error.message : 'no spawn error'}); ${summary}`);

  if (!fs.existsSync(path.join(runsDir, `${today}.md`))) {
    writeFailureRecord(today, `判断者が記録を作らなかった。exit ${r.status}${r.error ? ` (${r.error.message})` : ''}。${summary}`);
    return 1;
  }
  return r.status === 0 ? 0 : 1;
}

process.exitCode = main();
