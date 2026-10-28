// 判断者が使う専門家の道具にデータを用意する (docs/plan/loop-phase2.md T1)。
// 依存なし。出力は JSON を stdout に。判断はしない。
//
// 用意するもの:
//   commits   : [作品] / [仕組み] の分類と週ごとの推移 (docs/decisions/commit-labels.md の定義)
//   rules     : 規律の文書の行数と義務語の数、git 履歴での行数の推移
//   global    : global CLAUDE.md の行数と義務語 (測るだけ。変更は提案に留める)
//   questions : NEXT.md「本人に聞きたいこと」の各項目の初出日、system-design.md の未決事項、proposals/ の承認待ち
//   sessions  : ~/.claude/projects/<slug>/*.jsonl から、本人の発言数、NEXT.md を最初に読んだか、終わりに更新したか
//   feedback  : vault の不満ノートの更新日時
//   tests     : vitest の件数
//   steward   : これまでの実行記録と Scheduler の登録状態

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 義務語。判断者が増減してよい (根拠: 規制分析の restriction counting)。
export const OBLIGATION_WORDS = [
  '必ず',
  'しない',
  '禁止',
  '待たない',
  '求めない',
  'べき',
  '以内',
  '限る',
  '触らない',
  'してはいけない',
];

// 規律として数える文書 (repo 相対)。glob は loop-*.md だけ。
export const RULE_DOCS = ['CLAUDE.md', 'README.md', 'docs/system-design.md', 'docs/steward/judge.md'];
export const RULE_DOC_GLOB_DIR = 'docs/plan';
export const RULE_DOC_GLOB_PREFIX = 'loop-';

// 接頭辞の定義が変わった日 (docs/decisions/commit-labels.md)。これより前は src/ と assets/ を [作品] と読み替える。
export const LABEL_DEFINITION_DATE = '2026-10-29';

export const TASK_NAME = 'music_action_lab-steward';

export function classifyCommit({ subject, date, files }) {
  const steward = /^\[仕組み\] 判断者:/u.test(subject);
  let label = null;
  if (subject.startsWith('[作品]')) label = '作品';
  else if (subject.startsWith('[仕組み]')) label = '仕組み';
  if (date < LABEL_DEFINITION_DATE && files.some((f) => f.startsWith('src/') || f.startsWith('assets/'))) {
    label = '作品';
  }
  return { label: label ?? '不明', steward };
}

export function countObligations(text, words = OBLIGATION_WORDS) {
  const counts = {};
  let total = 0;
  for (const w of words) {
    const n = text.split(w).length - 1;
    counts[w] = n;
    total += n;
  }
  return { counts, total };
}

// NEXT.md の「本人に聞きたいこと」節から、番号つきの項目を取り出す。
export function parseQuestions(nextMd) {
  const lines = nextMd.split(/\r?\n/u);
  const start = lines.findIndex((l) => /^##\s*本人に聞きたいこと/u.test(l));
  if (start < 0) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/u.test(line)) break;
    const m = line.match(/^\s*(\d+)[.)]\s*(.+)$/u);
    if (m) items.push(m[2].trim());
  }
  return items;
}

export function questionKey(text) {
  return text.replace(/\s+/gu, '').slice(0, 40);
}

// 各リビジョンの質問一覧 (古い順) から、現在開いている質問の初出日を求める。
export function firstSeenQuestions(revisions, current) {
  const firstSeen = new Map();
  for (const rev of revisions) {
    for (const q of rev.questions) {
      const key = questionKey(q);
      if (!firstSeen.has(key)) firstSeen.set(key, rev.date);
    }
  }
  return current.map((text) => ({ text, firstSeen: firstSeen.get(questionKey(text)) ?? null }));
}

export function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function collectCommits(repo) {
  const raw = git(repo, ['log', '--format=%x01%h%x09%ad%x09%s', '--date=short', '--name-only']);
  const commits = [];
  for (const block of raw.split('\x01').slice(1)) {
    const [head, ...rest] = block.split('\n');
    const [hash, date, subject] = head.split('\t');
    const files = rest.map((l) => l.trim()).filter(Boolean);
    commits.push({ hash, date, subject, files, ...classifyCommit({ subject, date, files }) });
  }
  const byLabel = {};
  const weekly = {};
  for (const c of commits) {
    byLabel[c.label] = (byLabel[c.label] ?? 0) + 1;
    const w = isoWeek(c.date);
    weekly[w] ??= { week: w, 作品: 0, 仕組み: 0, 不明: 0, 判断者: 0 };
    weekly[w][c.label] += 1;
    if (c.steward) weekly[w].判断者 += 1;
  }
  const lastWork = commits.find((c) => c.label === '作品');
  const streak = commits.findIndex((c) => c.label === '作品');
  return {
    total: commits.length,
    byLabel,
    weekly: Object.values(weekly).sort((a, b) => a.week.localeCompare(b.week)),
    lastWorkCommit: lastWork ? { hash: lastWork.hash, date: lastWork.date, subject: lastWork.subject } : null,
    mechanismStreakSinceLastWork: streak < 0 ? commits.length : streak,
    recent: commits.slice(0, 30).map(({ files, ...c }) => ({ ...c, fileCount: files.length })),
  };
}

export function listRuleDocs(repo) {
  const docs = RULE_DOCS.filter((p) => fs.existsSync(path.join(repo, p)));
  const dir = path.join(repo, RULE_DOC_GLOB_DIR);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(RULE_DOC_GLOB_PREFIX) && name.endsWith('.md')) docs.push(`${RULE_DOC_GLOB_DIR}/${name}`);
    }
  }
  return docs;
}

export function collectRules(repo) {
  const docs = listRuleDocs(repo).map((p) => {
    const text = fs.readFileSync(path.join(repo, p), 'utf8');
    const lines = text.split(/\r?\n/u).length;
    const ob = countObligations(text);
    return { path: p, lines, obligationTotal: ob.total, obligations: ob.counts };
  });
  // 履歴: 規律文書を触った commit ごとに、その時点の各文書の行数
  const history = [];
  const paths = docs.map((d) => d.path);
  const log = git(repo, ['log', '--reverse', '--format=%h %ad', '--date=short', '--', ...paths]).trim();
  for (const line of log ? log.split('\n') : []) {
    const [hash, date] = line.split(' ');
    const lines = {};
    let total = 0;
    for (const p of paths) {
      const r = spawnSync('git', ['-C', repo, 'show', `${hash}:${p}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (r.status !== 0) continue;
      const n = r.stdout.split(/\r?\n/u).length;
      lines[p] = n;
      total += n;
    }
    history.push({ hash, date, total, lines });
  }
  return { docs, totalLines: docs.reduce((a, d) => a + d.lines, 0), totalObligations: docs.reduce((a, d) => a + d.obligationTotal, 0), history };
}

export function collectGlobal() {
  const p = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, 'utf8');
  return { path: p, lines: text.split(/\r?\n/u).length, obligationTotal: countObligations(text).total, readOnly: true };
}

export function collectQuestions(repo, today) {
  const nextPath = 'docs/NEXT.md';
  const current = fs.existsSync(path.join(repo, nextPath)) ? parseQuestions(fs.readFileSync(path.join(repo, nextPath), 'utf8')) : [];
  const revisions = [];
  const log = git(repo, ['log', '--reverse', '--format=%h %ad', '--date=short', '--', nextPath]).trim();
  for (const line of log ? log.split('\n') : []) {
    const [hash, date] = line.split(' ');
    const r = spawnSync('git', ['-C', repo, 'show', `${hash}:${nextPath}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (r.status === 0) revisions.push({ hash, date, questions: parseQuestions(r.stdout) });
  }
  const open = firstSeenQuestions(revisions, current).map((q) => ({ ...q, ageDays: q.firstSeen ? daysBetween(q.firstSeen, today) : null }));

  const sd = path.join(repo, 'docs/system-design.md');
  let unresolved = [];
  if (fs.existsSync(sd)) {
    const lines = fs.readFileSync(sd, 'utf8').split(/\r?\n/u);
    const i = lines.findIndex((l) => /^#+\s*未決事項/u.test(l));
    if (i >= 0) {
      for (const l of lines.slice(i + 1)) {
        if (/^#/u.test(l)) break;
        if (/^\s*-\s+/u.test(l)) unresolved.push(l.replace(/^\s*-\s+/u, '').trim());
      }
    }
  }

  const propDir = path.join(repo, 'docs/steward/proposals');
  const proposals = fs.existsSync(propDir)
    ? fs.readdirSync(propDir).filter((n) => n.endsWith('.md')).map((n) => {
        const m = n.match(/^(\d{4}-\d{2}-\d{2})/u);
        return { file: `docs/steward/proposals/${n}`, date: m ? m[1] : null, ageDays: m ? daysBetween(m[1], today) : null };
      })
    : [];
  return { open, unresolvedInSystemDesign: unresolved, proposals };
}

export function projectSlug(repo) {
  return path.resolve(repo).replace(/[^A-Za-z0-9]/gu, '-');
}

export function summarizeSession(jsonlText) {
  let humanTurns = 0;
  let first = null;
  let last = null;
  const earlyTools = [];
  let updatedNext = false;
  let commits = 0;
  for (const line of jsonlText.split('\n')) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.timestamp) {
      if (!first || o.timestamp < first) first = o.timestamp;
      if (!last || o.timestamp > last) last = o.timestamp;
    }
    if (o.type === 'user' && !o.isMeta && o.origin && o.origin.kind === 'human') humanTurns += 1;
    if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      for (const part of o.message.content) {
        if (part.type !== 'tool_use') continue;
        const input = JSON.stringify(part.input ?? {});
        if (earlyTools.length < 10) earlyTools.push(input);
        if ((part.name === 'Edit' || part.name === 'Write') && input.includes('NEXT.md')) updatedNext = true;
        if (part.name === 'Bash' && /git (-C \S+ )?commit/u.test(input)) commits += 1;
      }
    }
  }
  return {
    start: first,
    end: last,
    humanTurns,
    readNextEarly: earlyTools.some((i) => i.includes('NEXT.md')),
    updatedNext,
    commits,
  };
}

export function collectSessions(repo) {
  const dir = path.join(os.homedir(), '.claude', 'projects', projectSlug(repo));
  if (!fs.existsSync(dir)) return { dir, sessions: [] };
  const sessions = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    const s = summarizeSession(fs.readFileSync(p, 'utf8'));
    sessions.push({ id: name.replace(/\.jsonl$/u, ''), sizeBytes: st.size, mtime: st.mtime.toISOString(), ...s });
  }
  sessions.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  return { dir, sessions };
}

export function readVaultRoot(repo) {
  const p = path.join(repo, 'CLAUDE.local.md');
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf8').match(/vault ルート:\s*`([^`]+)`/u);
  return m ? m[1] : null;
}

export function collectFeedback(repo) {
  const root = readVaultRoot(repo);
  if (!root) return { vaultRoot: null, notes: [] };
  const dir = path.join(root, '音楽アクション');
  if (!fs.existsSync(dir)) return { vaultRoot: root, notes: [] };
  const notes = fs
    .readdirSync(dir)
    .filter((n) => /不満\.md$/u.test(n))
    .map((n) => ({ note: `音楽アクション/${n}`, mtime: fs.statSync(path.join(dir, n)).mtime.toISOString() }));
  return { vaultRoot: root, notes };
}

export function collectTests(repo) {
  const bin = path.join(repo, 'node_modules', 'vitest', 'vitest.mjs');
  if (!fs.existsSync(bin)) return { available: false };
  const out = path.join(os.tmpdir(), `steward-vitest-${process.pid}.json`);
  const r = spawnSync(process.execPath, [bin, 'run', '--reporter=json', `--outputFile=${out}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    return { available: true, ok: j.success === true, total: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, files: Array.isArray(j.testResults) ? j.testResults.length : null };
  } catch {
    return { available: true, ok: false, exitCode: r.status };
  } finally {
    fs.rmSync(out, { force: true });
  }
}

export function parseRunRecordNumbers(text) {
  const m = text.match(/削除\s*(\d+)[、,]\s*提案\s*(\d+)[、,]\s*質問\s*(\d+)[、,]\s*要望\s*(\d+)/u);
  if (!m) return null;
  return { deletions: +m[1], proposals: +m[2], questions: +m[3], requests: +m[4] };
}

export function collectSteward(repo) {
  const runsDir = path.join(repo, 'docs/steward/runs');
  const runs = fs.existsSync(runsDir)
    ? fs
        .readdirSync(runsDir)
        .filter((n) => n.endsWith('.md'))
        .sort()
        .map((n) => ({ file: `docs/steward/runs/${n}`, ...(parseRunRecordNumbers(fs.readFileSync(path.join(runsDir, n), 'utf8')) ?? { unparsed: true }) }))
    : [];
  const skipsPath = path.join(repo, '.steward', 'skips.log');
  const skips = fs.existsSync(skipsPath) ? fs.readFileSync(skipsPath, 'utf8').trim().split('\n').filter(Boolean).slice(-20) : [];
  const q = spawnSync('schtasks', ['/Query', '/TN', TASK_NAME], { encoding: 'utf8' });
  return {
    runs,
    runCount: runs.length,
    deletionsTotal: runs.reduce((a, r) => a + (r.deletions ?? 0), 0),
    skips,
    scheduledTask: { name: TASK_NAME, registered: q.status === 0 },
  };
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function collectAll(repo, today = localDate()) {
  return {
    generatedAt: new Date().toISOString(),
    today,
    repo,
    commits: collectCommits(repo),
    rules: collectRules(repo),
    global: collectGlobal(),
    questions: collectQuestions(repo, today),
    sessions: collectSessions(repo),
    feedback: collectFeedback(repo),
    tests: collectTests(repo),
    steward: collectSteward(repo),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  process.stdout.write(JSON.stringify(collectAll(repo), null, 2));
}
