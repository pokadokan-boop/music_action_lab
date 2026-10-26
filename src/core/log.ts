// 遊びの記録。入力と拍のズレ、命中、被弾を時刻つきで溜め、要約と決定性の検査用ハッシュを出す。

export type EventKind = 'attack' | 'hit' | 'damage' | 'cancel' | 'cancel-miss';
export type BeatClass = 'on' | 'off' | 'miss';
// 相殺が不成立だった理由。timing = 当たりの窓の外、reach = 扇と当たりが重ならない、angle = 来る方向の逆を向いていない
export type CancelMissReason = 'timing' | 'reach' | 'angle';

export interface LogEvent {
  t: number;
  beat: number;
  kind: EventKind;
  offsetMs?: number;
  cls?: BeatClass;
  attackIndex?: number;
  phrase?: number;
  // attack のみ: 攻撃の向き (度。0 = 右、90 = 下、時計回り) と、その向きの扇の角度内に敵がいたか
  aimDeg?: number;
  enemyInFan?: boolean;
  // cancel-miss のみ
  reason?: CancelMissReason;
}

export const CANCEL_MISS_LABEL: Record<CancelMissReason, string> = { timing: 'タイミング', reach: '届かず', angle: '向き' };

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
    const inFan = attacks.filter((e) => e.enemyInFan === true).length;
    const outFan = attacks.filter((e) => e.enemyInFan === false).length;
    const cancels = this.events.filter((e) => e.kind === 'cancel').length;
    const misses = this.events.filter((e) => e.kind === 'cancel-miss');
    const missBy = (r: CancelMissReason) => misses.filter((e) => e.reason === r).length;
    const lines = [
      `振り付け ${meta.choreoId} / 曲 ${meta.song} / ${meta.date}${meta.extra ? ` / ${meta.extra}` : ''}`,
      `攻撃 ${attacks.length} 回 (表 ${count('on')}, 裏 ${count('off')}, 外 ${count('miss')}) 命中 ${hits.length}`,
      `向き 扇内 ${inFan} / 扇外 ${outFan}`,
      `相殺 ${cancels} 回、失敗 ${misses.length} 回 (${CANCEL_MISS_LABEL.timing} ${missBy('timing')} / ${CANCEL_MISS_LABEL.reach} ${missBy('reach')} / ${CANCEL_MISS_LABEL.angle} ${missBy('angle')})`,
      `拍とのズレ 平均 ${mean.toFixed(0)} ms (${side}) 標準偏差 ${sd.toFixed(0)} ms`,
      `被弾 ${damages.length} 回: ${damages.map((d) => `攻撃${d.attackIndex ?? '?'}(phrase ${d.phrase ?? '?'})`).join(', ') || 'なし'}`,
    ];
    return lines.join('\n');
  }
}
