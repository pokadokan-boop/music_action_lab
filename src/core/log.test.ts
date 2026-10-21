import { describe, expect, it } from 'vitest';
import { GameLog } from './log';

describe('GameLog', () => {
  it('同じ内容なら同じハッシュ、違えば違う', () => {
    const a = new GameLog();
    const b = new GameLog();
    a.push({ t: 1.00001, beat: 2, kind: 'attack', cls: 'on', offsetMs: 3 });
    b.push({ t: 1.00002, beat: 2, kind: 'attack', cls: 'on', offsetMs: 3 }); // 1e-4 未満の差は同じ
    expect(a.hash()).toBe(b.hash());
    b.push({ t: 2, beat: 4, kind: 'hit' });
    expect(a.hash()).not.toBe(b.hash());
  });

  it('要約に回数とズレが入る', () => {
    const log = new GameLog();
    log.push({ t: 1, beat: 2, kind: 'attack', cls: 'on', offsetMs: 10 });
    log.push({ t: 1.5, beat: 3, kind: 'attack', cls: 'off', offsetMs: -30 });
    log.push({ t: 1, beat: 2, kind: 'hit' });
    log.push({ t: 5, beat: 10, kind: 'damage', attackIndex: 0, phrase: 1 });
    const text = log.summary({ choreoId: 'a', song: 'c1', date: '2026-10-21' });
    expect(text).toContain('攻撃 2 回 (表 1, 裏 1, 外 0) 命中 1');
    expect(text).toContain('平均 -10 ms (早い側)');
    expect(text).toContain('被弾 1 回: 攻撃0(phrase 1)');
  });
});
