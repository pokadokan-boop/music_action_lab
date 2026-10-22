// 遊びの記録。入力と拍のズレ、命中、被弾を時刻つきで溜め、要約と決定性の検査用ハッシュを出す。

export type EventKind = 'attack' | 'hit' | 'damage';
export type BeatClass = 'on' | 'off' | 'miss';

export interface LogEvent {
  t: number;
  beat: number;
  kind: EventKind;
  offsetMs?: number;
  cls?: BeatClass;
  attackIndex?: number;
  phrase?: number;
}

export interface SummaryMeta {
  choreoId: string;
  song: string;
  date: string;
  // 要約の先頭に添える補足 (出力遅延の補正値など)
  extra?: string;
}

export class GameLog {
  readonly events: LogEvent[] = [];

  push(e: LogEvent): void {
    this.events.push(e);
  }

  // FNV-1a 32bit。数値は 1e-4 に丸めて浮動小数の表記ゆれを消す
  hash(): string {
    const text = JSON.stringify(this.events, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  summary(meta: SummaryMeta): string {
    const attacks = this.events.filter((e) => e.kind === 'attack');
    const hits = this.events.filter((e) => e.kind === 'hit');
    const damages = this.events.filter((e) => e.kind === 'damage');
    const count = (cls: BeatClass) => attacks.filter((e) => e.cls === cls).length;
    const offsets = attacks.map((e) => e.offsetMs ?? 0);
    const mean = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : 0;
    const sd = offsets.length ? Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / offsets.length) : 0;
    const side = mean > 0 ? '遅い側' : mean < 0 ? '早い側' : 'ちょうど';
    const lines = [
      `振り付け ${meta.choreoId} / 曲 ${meta.song} / ${meta.date}${meta.extra ? ` / ${meta.extra}` : ''}`,
      `攻撃 ${attacks.length} 回 (表 ${count('on')}, 裏 ${count('off')}, 外 ${count('miss')}) 命中 ${hits.length}`,
      `拍とのズレ 平均 ${mean.toFixed(0)} ms (${side}) 標準偏差 ${sd.toFixed(0)} ms`,
      `被弾 ${damages.length} 回: ${damages.map((d) => `攻撃${d.attackIndex ?? '?'}(phrase ${d.phrase ?? '?'})`).join(', ') || 'なし'}`,
    ];
    return lines.join('\n');
  }
}
