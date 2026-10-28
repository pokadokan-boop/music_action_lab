import { describe, expect, it } from 'vitest';
import {
  classifyCommit,
  countObligations,
  firstSeenQuestions,
  parseQuestions,
  parseRunRecordNumbers,
  summarizeSession,
} from './collect.js';

describe('classifyCommit (docs/decisions/commit-labels.md)', () => {
  it('接頭辞をそのまま読む (定義の日以降)', () => {
    expect(classifyCommit({ subject: '[作品] 振り付け', date: '2026-10-29', files: ['assets/choreo/v3.json'] }).label).toBe('作品');
    expect(classifyCommit({ subject: '[仕組み] NEXT.md', date: '2026-10-29', files: ['docs/NEXT.md'] }).label).toBe('仕組み');
  });
  it('定義の日より前は src/ と assets/ を [作品] と読み替える', () => {
    expect(classifyCommit({ subject: '[仕組み] v2 T5: 相殺', date: '2026-10-27', files: ['src/core/sim.ts'] }).label).toBe('作品');
    expect(classifyCommit({ subject: '[仕組み] NEXT.md', date: '2026-10-27', files: ['docs/NEXT.md'] }).label).toBe('仕組み');
  });
  it('判断者の commit を見分ける', () => {
    const c = classifyCommit({ subject: '[仕組み] 判断者: 規律を 1 つ外す', date: '2026-10-30', files: ['CLAUDE.md'] });
    expect(c).toEqual({ label: '仕組み', steward: true });
  });
  it('接頭辞が無ければ不明', () => {
    expect(classifyCommit({ subject: 'init', date: '2026-10-29', files: [] }).label).toBe('不明');
  });
});

describe('countObligations', () => {
  it('義務語を数える', () => {
    const r = countObligations('必ず読む。本人に聞かない。禁止。必ず書く。', ['必ず', 'しない', '禁止']);
    expect(r.counts).toEqual({ 必ず: 2, しない: 0, 禁止: 1 });
    expect(r.total).toBe(3);
  });
});

describe('parseQuestions / firstSeenQuestions', () => {
  const v1 = '# NEXT\n## 本人に聞きたいこと\n1. v2 Phase 1 を承認するか\n';
  const v2 = '# NEXT\n## 本人に聞きたいこと\n1. v2 Phase 1 を承認するか\n2. 曲を変えるか\n\n## 他\n3. ここは数えない\n';
  it('番号つきの項目だけを節の中から取る', () => {
    expect(parseQuestions(v2)).toEqual(['v2 Phase 1 を承認するか', '曲を変えるか']);
    expect(parseQuestions('# NEXT\n## 本人に聞きたいこと\nなし\n')).toEqual([]);
  });
  it('初出日を古いリビジョンから引く', () => {
    const revisions = [
      { hash: 'a', date: '2026-10-27', questions: parseQuestions(v1) },
      { hash: 'b', date: '2026-10-28', questions: parseQuestions(v2) },
    ];
    expect(firstSeenQuestions(revisions, parseQuestions(v2))).toEqual([
      { text: 'v2 Phase 1 を承認するか', firstSeen: '2026-10-27' },
      { text: '曲を変えるか', firstSeen: '2026-10-28' },
    ]);
  });
});

describe('summarizeSession', () => {
  const lines = [
    { type: 'user', isMeta: true, timestamp: '2026-10-28T14:35:38.000Z', message: { role: 'user', content: 'x' } },
    { type: 'user', origin: { kind: 'human' }, timestamp: '2026-10-28T14:36:03.000Z', message: { role: 'user', content: 'hi' } },
    {
      type: 'assistant',
      timestamp: '2026-10-28T14:36:12.000Z',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cat docs/NEXT.md' } }] },
    },
    {
      type: 'assistant',
      timestamp: '2026-10-28T15:00:00.000Z',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'C:/x/docs/NEXT.md' } }] },
    },
    {
      type: 'assistant',
      timestamp: '2026-10-28T15:01:00.000Z',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git -C C:/x commit -F msg.txt' } }] },
    },
  ];
  it('本人の発言数、NEXT.md の読み書き、commit 数を出す', () => {
    const s = summarizeSession(lines.map((l) => JSON.stringify(l)).join('\n'));
    expect(s.humanTurns).toBe(1);
    expect(s.readNextEarly).toBe(true);
    expect(s.updatedNext).toBe(true);
    expect(s.commits).toBe(1);
    expect(s.start).toBe('2026-10-28T14:35:38.000Z');
    expect(s.end).toBe('2026-10-28T15:01:00.000Z');
  });
});

describe('parseRunRecordNumbers', () => {
  it('実行記録の 1 行目の数値を読む', () => {
    expect(parseRunRecordNumbers('数値: 削除 1、提案 0、質問 2、要望 0\n')).toEqual({ deletions: 1, proposals: 0, questions: 2, requests: 0 });
    expect(parseRunRecordNumbers('なにもない')).toBeNull();
  });
});
