import { describe, expect, it } from 'vitest';
import { GameLog } from './log';
import { buildSummary } from './summary';
import { makeChoreo, makeGrid } from './test-fixtures';

describe('buildSummary', () => {
  const meta = { choreoId: 'test', song: 'fixture', date: '2026-10-27' };

  it('phrase 表に相殺列が入る (相殺 / 失敗の理由 / -)', () => {
    const log = new GameLog();
    log.push({ t: 5, beat: 10, kind: 'cancel', attackIndex: 0, phrase: 1 });
    log.push({ t: 9.5, beat: 19, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'angle' });
    log.push({ t: 9.6, beat: 19.2, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'timing' });
    log.push({ t: 9.7, beat: 19.4, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'angle' });
    const rows = buildSummary(log, makeChoreo(), makeGrid(), meta).split('\n');
    expect(rows).toContain('phrase | 攻撃 | 被弾 | 相殺 | 自分の攻撃回数');
    expect(rows.find((r) => r.startsWith(' 0 |'))).toBe(' 0 | - | - | - | 0');
    expect(rows.find((r) => r.startsWith(' 1 |'))).toBe(' 1 | dash@10 | - | 相殺 | 0');
    // 理由は重複を 1 つにまとめ、出た順に並べる
    expect(rows.find((r) => r.startsWith(' 2 |'))).toBe(' 2 | burst@19 | - | 失敗 (向き/タイミング) | 0');
    expect(rows.find((r) => r.startsWith(' 3 |'))).toBe(' 3 | shot@26 | - | - | 0');
  });

  it('相殺できた攻撃に失敗の押下があっても「相殺」が優先', () => {
    const log = new GameLog();
    log.push({ t: 4.9, beat: 9.8, kind: 'cancel-miss', attackIndex: 0, phrase: 1, reason: 'timing' });
    log.push({ t: 5, beat: 10, kind: 'cancel', attackIndex: 0, phrase: 1 });
    log.push({ t: 5.1, beat: 10.2, kind: 'damage', attackIndex: 0, phrase: 1 });
    const rows = buildSummary(log, makeChoreo(), makeGrid(), meta).split('\n');
    expect(rows.find((r) => r.startsWith(' 1 |'))).toBe(' 1 | dash@10 | 被弾 | 相殺 | 0');
  });
});
