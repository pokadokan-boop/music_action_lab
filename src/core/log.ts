// 遊びの記録。入力と拍のズレ、命中、被弾を時刻つきで溜め、要約と決定性の検査用ハッシュを出す。

import type { BranchMove, Outcome } from './choreo';

// damage-undone = 遅い側の相殺で被弾を取り消した (v3 T3)。damage の記録は残り、HP だけ戻る。
// outcome = 攻撃の結果の確定 (v4 T1。捌けた / 被弾 と、選ばれた分岐)
// step = ステップ (v5 T1)、charge = 溜めが閾値を超えた、charge-break = 被弾で溜めが解除された (v5 T2)
// mitigate = 大技 (slam) を片手の放ちで軽減した (v6 T5。相殺ではない。以後その攻撃の被ダメと吹っ飛びが ×0.8)
export type EventKind = 'attack' | 'hit' | 'damage' | 'cancel' | 'cancel-miss' | 'damage-undone' | 'outcome' | 'step' | 'charge' | 'charge-break' | 'mitigate';
export type BeatClass = 'on' | 'off' | 'miss';
// 攻撃の押下の種類 (v5)。normal = 通常、riposte = 相殺後の返し、release = 溜めの放ち
export type AttackAction = 'normal' | 'riposte' | 'release';
// 相殺が不成立だった理由。timing = 当たりの窓の外、reach = 扇と当たりが重ならない、angle = 来る方向の逆を向いていない
export type CancelMissReason = 'timing' | 'reach' | 'angle';
// 手 (v6 T1)。右 = R1 / J / Space、左 = L1 / F。音は手で区別しない
export type Hand = 'right' | 'left';

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
  // outcome のみ
  outcome?: Outcome;
  branch?: BranchMove;
  // attack (v5): 押下の種類 (省略は normal)、返しで踏み込んだか。hit: 与えたダメージ (省略は 1)。cancel: 放ちによる強い相殺か
  action?: AttackAction;
  lunge?: boolean;
  damage?: number;
  strong?: boolean;
  // v6: attack / hit / cancel / charge / charge-break の手 (省略は右)。attack と hit (放ち) の double = 両手放ち (他方の手の放ちから doubleWindowBeats 以内)、
  // pairMs = 2 つの放ちの差 (ms)
  hand?: Hand;
  double?: boolean;
  pairMs?: number;
  // v6 T5 (大技): cancel (double) のジャスト率 0〜1 と反動の配分 (距離)。damage: 大技の被ダメ (省略は 1) と片手軽減が効いたか
  just?: number;
  recoil?: { enemy: number; player: number };
  mitigated?: boolean;
}

export const OUTCOME_LABEL: Record<Outcome, string> = { handled: '捌けた', hit: '被弾' };

export const ACTION_LABEL: Record<AttackAction, string> = { normal: '通常', riposte: '返し', release: '放ち' };
export const DOUBLE_LABEL = '両手放ち';
export const HAND_LABEL: Record<Hand, string> = { right: '右', left: '左' };

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
    const undone = new Set(this.events.filter((e) => e.kind === 'damage-undone').map((e) => e.attackIndex));
    const damageLabel = (d: LogEvent) => `攻撃${d.attackIndex ?? '?'}(phrase ${d.phrase ?? '?'}${undone.has(d.attackIndex) ? ', 取り消し' : ''})`;
    const undoneNote = undone.size > 0 ? ` (取り消し ${undone.size} 回)` : '';
    const outcomes = this.events.filter((e) => e.kind === 'outcome');
    const handled = outcomes.filter((e) => e.outcome === 'handled').length;
    const branched = outcomes.filter((e) => e.branch && e.branch !== 'normal').length;
    // 命中の内訳 (v6 T3): 通常 / 返し / 放ち (両手放ちでない) / 両手放ち。本人の「放ちの直当てにダメージが無い」を照合するため
    const hitsBy = (action: AttackAction, double: boolean) => hits.filter((e) => (e.action ?? 'normal') === action && !!e.double === double).length;
    const hitDetail = `${ACTION_LABEL.normal} ${hitsBy('normal', false)} / ${ACTION_LABEL.riposte} ${hitsBy('riposte', false)} / ${ACTION_LABEL.release} ${hitsBy('release', false)} / ${DOUBLE_LABEL} ${hitsBy('release', true)}`;
    const lines = [
      `振り付け ${meta.choreoId} / 曲 ${meta.song} / ${meta.date}${meta.extra ? ` / ${meta.extra}` : ''}`,
      `攻撃 ${attacks.length} 回 (表 ${count('on')}, 裏 ${count('off')}, 外 ${count('miss')}) 命中 ${hits.length} (${hitDetail})`,
      `向き 扇内 ${inFan} / 扇外 ${outFan}`,
      `相殺 ${cancels} 回、失敗 ${misses.length} 回 (${CANCEL_MISS_LABEL.timing} ${missBy('timing')} / ${CANCEL_MISS_LABEL.reach} ${missBy('reach')} / ${CANCEL_MISS_LABEL.angle} ${missBy('angle')})`,
      `捌けた ${handled} / 被弾 ${outcomes.length - handled} (結果の出た攻撃 ${outcomes.length}、分岐した ${branched})`,
      `拍とのズレ 平均 ${mean.toFixed(0)} ms (${side}) 標準偏差 ${sd.toFixed(0)} ms`,
      `被弾 ${damages.length} 回${undoneNote}: ${damages.map(damageLabel).join(', ') || 'なし'}`,
      this.actionLine(),
      this.chargeLine(),
    ];
    return lines.join('\n');
  }

  // v5: 行動ごとの回数と拍の乗り。「攻撃 n 回」の行は通常・返し・放ちの総数 (押下の総数として今までと比べる)。
  // v6: 手の内訳 (右 / 左。hand 省略は右) を各行動に添える
  private actionLine(): string {
    const steps = this.events.filter((e) => e.kind === 'step');
    const stepOn = steps.filter((e) => e.cls === 'on').length;
    const attacks = this.events.filter((e) => e.kind === 'attack');
    const byAction = (action: AttackAction) => attacks.filter((e) => (e.action ?? 'normal') === action);
    const split = (list: LogEvent[]) =>
      `表 ${list.filter((e) => e.cls === 'on').length} 裏 ${list.filter((e) => e.cls === 'off').length} 外 ${list.filter((e) => e.cls === 'miss').length}` +
      `、${HAND_LABEL.right} ${list.filter((e) => (e.hand ?? 'right') === 'right').length} ${HAND_LABEL.left} ${list.filter((e) => e.hand === 'left').length}`;
    const riposte = byAction('riposte');
    const lunges = riposte.filter((e) => e.lunge).length;
    const releases = byAction('release');
    const doubles = releases.filter((e) => e.double).length;
    return [
      `行動: ステップ ${steps.length} 回 (乗った ${stepOn})`,
      `${ACTION_LABEL.normal} ${byAction('normal').length} (${split(byAction('normal'))})`,
      `${ACTION_LABEL.riposte} ${riposte.length} (${split(riposte)}、踏み込み ${lunges})`,
      `${ACTION_LABEL.release} ${releases.length} (${split(releases)}、${DOUBLE_LABEL} ${doubles})`,
    ].join(' / ');
  }

  private chargeLine(): string {
    const charges = this.events.filter((e) => e.kind === 'charge').length;
    const releases = this.events.filter((e) => e.kind === 'attack' && e.action === 'release').length;
    const breaks = this.events.filter((e) => e.kind === 'charge-break').length;
    const strong = this.events.filter((e) => e.kind === 'cancel' && e.strong).length;
    return `溜め ${charges} 回 (放ち ${releases} / 被弾で解除 ${breaks}) 強い相殺 ${strong} 回`;
  }
}
