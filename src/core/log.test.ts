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
    log.push({ t: 1, beat: 2, kind: 'attack', cls: 'on', offsetMs: 10, aimDeg: 0, enemyInFan: true });
    log.push({ t: 1.5, beat: 3, kind: 'attack', cls: 'off', offsetMs: -30, aimDeg: 270, enemyInFan: false });
    log.push({ t: 1, beat: 2, kind: 'hit' });
    log.push({ t: 5, beat: 10, kind: 'damage', attackIndex: 0, phrase: 1 });
    const text = log.summary({ choreoId: 'a', song: 'c1', date: '2026-10-21' });
    expect(text).toContain('攻撃 2 回 (表 1, 裏 1, 外 0) 命中 1');
    expect(text).toContain('向き 扇内 1 / 扇外 1');
    expect(text).toContain('平均 -10 ms (早い側)');
    expect(text).toContain('被弾 1 回: 攻撃0(phrase 1)');
    expect(text).toContain('相殺 0 回、失敗 0 回 (タイミング 0 / 届かず 0 / 向き 0)');
  });

  it('要約に相殺の回数と失敗の理由の内訳が入る', () => {
    const log = new GameLog();
    log.push({ t: 5, beat: 10, kind: 'cancel', attackIndex: 0, phrase: 1 });
    log.push({ t: 9, beat: 18, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'timing' });
    log.push({ t: 9.5, beat: 19, kind: 'cancel-miss', attackIndex: 1, phrase: 2, reason: 'angle' });
    log.push({ t: 13, beat: 26, kind: 'cancel-miss', attackIndex: 2, phrase: 3, reason: 'reach' });
    const text = log.summary({ choreoId: 'a', song: 'c1', date: '2026-10-27' });
    expect(text).toContain('相殺 1 回、失敗 3 回 (タイミング 1 / 届かず 1 / 向き 1)');
  });
});

describe('GameLog の v5 の行 (行動・溜め)', () => {
  it('行動ごとの回数と拍の乗り、溜めの回数、強い相殺の回数が入る', () => {
    const log = new GameLog();
    log.push({ t: 1, beat: 2, kind: 'step', cls: 'on', offsetMs: 0 });
    log.push({ t: 1.1, beat: 2.25, kind: 'step', cls: 'miss', offsetMs: 50 });
    log.push({ t: 2, beat: 4, kind: 'attack', cls: 'on', offsetMs: 0, action: 'normal' });
    log.push({ t: 2.5, beat: 5, kind: 'attack', cls: 'off', offsetMs: 0 }); // action 省略は通常
    log.push({ t: 3, beat: 6, kind: 'charge' });
    log.push({ t: 4, beat: 8, kind: 'attack', cls: 'on', offsetMs: 0, action: 'release' });
    log.push({ t: 4, beat: 8, kind: 'cancel', attackIndex: 0, phrase: 1, strong: true });
    log.push({ t: 5, beat: 10, kind: 'attack', cls: 'miss', offsetMs: 80, action: 'riposte', lunge: true });
    log.push({ t: 6, beat: 12, kind: 'charge' });
    log.push({ t: 6.5, beat: 13, kind: 'charge-break' });
    const text = log.summary({ choreoId: 'a', song: 'c1', date: '2026-11-02' });
    expect(text).toContain('攻撃 4 回 (表 2, 裏 1, 外 1)');
    expect(text).toContain(
      '行動: ステップ 2 回 (乗った 1) / 通常 2 (表 1 裏 1 外 0、右 2 左 0) / 返し 1 (表 0 裏 0 外 1、右 1 左 0、踏み込み 1) / 放ち 1 (表 1 裏 0 外 0、右 1 左 0、両手放ち 0)',
    );
    expect(text).toContain('溜め 2 回 (放ち 1 / 被弾で解除 1) 強い相殺 1 回');
  });
});

describe('GameLog の v6 の行 (命中の内訳・手の内訳・両手放ち)', () => {
  it('命中を通常 / 返し / 放ち / 両手放ちに分け、行動ごとに右 / 左の数、放ちに両手放ちの数が入る', () => {
    const log = new GameLog();
    log.push({ t: 1, beat: 2, kind: 'attack', cls: 'on', offsetMs: 0, action: 'normal', hand: 'left' });
    log.push({ t: 1, beat: 2, kind: 'hit', action: 'normal', damage: 1, hand: 'left' });
    log.push({ t: 2, beat: 4, kind: 'attack', cls: 'on', offsetMs: 0, action: 'release', hand: 'right' });
    log.push({ t: 2, beat: 4, kind: 'hit', action: 'release', damage: 3, hand: 'right' });
    log.push({ t: 2.1, beat: 4.2, kind: 'attack', cls: 'on', offsetMs: 0, action: 'release', hand: 'left', double: true, pairMs: 100 });
    log.push({ t: 2.1, beat: 4.2, kind: 'hit', action: 'release', damage: 3, hand: 'left', double: true });
    const text = log.summary({ choreoId: 'a', song: 'c1', date: '2026-11-05' });
    expect(text).toContain('攻撃 3 回 (表 3, 裏 0, 外 0) 命中 3 (通常 1 / 返し 0 / 放ち 1 / 両手放ち 1)');
    expect(text).toContain('通常 1 (表 1 裏 0 外 0、右 0 左 1)');
    expect(text).toContain('放ち 2 (表 2 裏 0 外 0、右 1 左 1、両手放ち 1)');
  });
});
