import { describe, expect, it } from 'vitest';
import { GameLog } from './log';
import { SCORE_LEGEND, buildScore, buildSummary } from './summary';
import { makeChoreo, makeGrid } from './test-fixtures';

describe('buildSummary', () => {
  const meta = { choreoId: 'test', song: 'fixture', date: '2026-10-27' };

  it('phrase 表に相殺列が入る (相殺 / 失敗の理由 / -)', () => {
    const log = new GameLog();
    log.push({ t: 5, beat: 10, kind: 'cancel', attackIndex: 0, phrase: 1 });
    log.push({ t: 9.5, beat: 19, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'angle' });
    log.push({ t: 9.6, beat: 19.2, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'timing' });
    log.push({ t: 9.7, beat: 19.4, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'angle' });
    log.push({ t: 5.2, beat: 10.4, kind: 'outcome', attackIndex: 0, phrase: 1, outcome: 'handled', branch: 'stop' });
    log.push({ t: 9.8, beat: 19.6, kind: 'outcome', attackIndex: 1, phrase: 2, outcome: 'hit', branch: 'normal' });
    const rows = buildSummary(log, makeChoreo(), makeGrid(), meta).split('\n');
    expect(rows).toContain('phrase | 攻撃 | 被弾 | 結果 | 相殺 | 自分の攻撃回数');
    expect(rows.find((r) => r.startsWith(' 0 |'))).toBe(' 0 | - | - | - | - | 0');
    expect(rows.find((r) => r.startsWith(' 1 |'))).toBe(' 1 | dash@10 | - | 捌けた (止まる) | 相殺 | 0');
    // 理由は重複を 1 つにまとめ、出た順に並べる
    expect(rows.find((r) => r.startsWith(' 2 |'))).toBe(' 2 | burst@19 | - | 被弾 | 失敗 (向き/タイミング) | 0');
    expect(rows.find((r) => r.startsWith(' 3 |'))).toBe(' 3 | shot@26 | - | - | - | 0');
  });

  it('相殺できた攻撃に失敗の押下があっても「相殺」が優先', () => {
    const log = new GameLog();
    log.push({ t: 4.9, beat: 9.8, kind: 'cancel-miss', attackIndex: 0, phrase: 1, reason: 'timing' });
    log.push({ t: 5, beat: 10, kind: 'cancel', attackIndex: 0, phrase: 1 });
    log.push({ t: 5.1, beat: 10.2, kind: 'damage', attackIndex: 0, phrase: 1 });
    const rows = buildSummary(log, makeChoreo(), makeGrid(), meta).split('\n');
    expect(rows.find((r) => r.startsWith(' 1 |'))).toBe(' 1 | dash@10 | 被弾 | - | 相殺 | 0');
  });
});

describe('buildScore (v5 のプレイヤーの譜)', () => {
  it('1 行 1 小節、16 分 1 マス、記号の優先順 (強 > 相 > 放 > 返 > 攻 > ス > 溜)、溜め中は charge から放ち/解除まで', () => {
    const log = new GameLog();
    const grid = makeGrid(120, 2); // 2 小節 = 8 拍
    log.push({ t: 0, beat: 0, kind: 'attack', cls: 'on', offsetMs: 0, action: 'normal' });
    log.push({ t: 0, beat: 0.5, kind: 'step', cls: 'on', offsetMs: 0 });
    log.push({ t: 0, beat: 0.75, kind: 'step', cls: 'miss', offsetMs: 0 });
    log.push({ t: 0, beat: 1.5, kind: 'charge' });
    log.push({ t: 0, beat: 3, kind: 'attack', cls: 'on', offsetMs: 0, action: 'release' });
    log.push({ t: 0, beat: 3, kind: 'cancel', attackIndex: 0, phrase: 0, strong: true });
    log.push({ t: 0, beat: 4, kind: 'attack', cls: 'on', offsetMs: 0, action: 'normal' });
    log.push({ t: 0, beat: 4, kind: 'cancel', attackIndex: 1, phrase: 1 });
    log.push({ t: 0, beat: 4.5, kind: 'attack', cls: 'off', offsetMs: 0, action: 'riposte', lunge: true });
    log.push({ t: 0, beat: 6, kind: 'charge' });
    log.push({ t: 0, beat: 6.5, kind: 'charge-break' });
    // 丸め: 7.1 拍の押下は最寄りの 16 分 (7.0) に
    log.push({ t: 0, beat: 7.1, kind: 'step', cls: 'miss', offsetMs: 0 });
    const lines = buildScore(log, grid);
    expect(lines[0]).toBe(SCORE_LEGEND);
    // 拍 0 攻 / 0.5 と 0.75 ス / 1.5〜3 溜 (マス 6〜11) / 3 放ちと強い相殺 → 強
    expect(lines[1]).toBe('小節  1 | 攻・スス ・・溜溜 溜溜溜溜 強・・・ |');
    expect(lines[2]).toBe('小節  2 | 相・返・ ・・・・ 溜溜・・ ス・・・ |');
    expect(lines).toHaveLength(3);
  });

  it('buildSummary は要約の後に譜、その後に phrase 表を出す', () => {
    const text = buildSummary(new GameLog(), makeChoreo(), makeGrid(), { choreoId: 't', song: 'f', date: 'd' });
    const lines = text.split('\n');
    const legend = lines.indexOf(SCORE_LEGEND);
    const table = lines.findIndex((l) => l.startsWith('phrase |'));
    expect(legend).toBeGreaterThan(0);
    expect(table).toBeGreaterThan(legend);
    expect(lines.filter((l) => l.startsWith('小節'))).toHaveLength(8);
  });
});
