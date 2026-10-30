// 結果画面の要約。記録 (GameLog) と振り付け・グリッドから、人間が不満を書くときに参照する文章を作る
import type { Choreo } from './choreo';
import type { Grid } from './grid';
import { CANCEL_MISS_LABEL, OUTCOME_LABEL, type GameLog, type SummaryMeta } from './log';

export function buildSummary(log: GameLog, choreo: Choreo, grid: Grid, meta: SummaryMeta): string {
  const head = log.summary(meta);
  const rows: string[] = ['', 'phrase | 攻撃 | 被弾 | 結果 | 相殺 | 自分の攻撃回数'];
  for (const p of grid.phrases) {
    const atks = choreo.attacks.map((a, i) => ({ a, i })).filter(({ a }) => a.phrase === p.index);
    const types = atks.map(({ a }) => `${a.type}@${a.hitBeat}`).join(' ') || '-';
    const ofPhrase = (kind: string) => log.events.filter((e) => e.kind === kind && atks.some(({ i }) => i === e.attackIndex));
    // 被弾列: 被弾して取り消されていなければ「被弾」、遅い側の相殺で取り消されたら「取り消し」
    const damaged = ofPhrase('damage').length === 0 ? '-' : ofPhrase('damage-undone').length > 0 ? '取り消し' : '被弾';
    const myAttacks = log.events.filter((e) => e.kind === 'attack' && e.beat >= p.startBeat && e.beat < p.endBeat).length;
    // 結果列 (v4): 確定した結果 (捌けた / 被弾)。分岐が選ばれていれば「捌けた (止まる)」のように添える
    const oc = ofPhrase('outcome')[0];
    const result = !oc || !oc.outcome ? '-' : `${OUTCOME_LABEL[oc.outcome]}${oc.branch && oc.branch !== 'normal' ? ` (${BRANCH_LABEL[oc.branch]})` : ''}`;
    rows.push(`${String(p.index).padStart(2)} | ${types} | ${damaged} | ${result} | ${cancelColumn(ofPhrase('cancel').length, ofPhrase('cancel-miss'))} | ${myAttacks}`);
  }
  return `${head}\n${rows.join('\n')}`;
}

const BRANCH_LABEL = { normal: '通常', stop: '止まる', approach: '寄る', retreat: '離れる' } as const;

// 相殺列: 相殺できたら「相殺」、できなかった押下だけなら理由 (重複は 1 つに)、どちらも無ければ -
function cancelColumn(cancels: number, misses: { reason?: keyof typeof CANCEL_MISS_LABEL }[]): string {
  if (cancels > 0) return '相殺';
  if (misses.length === 0) return '-';
  const reasons = [...new Set(misses.map((e) => (e.reason ? CANCEL_MISS_LABEL[e.reason] : '?')))];
  return `失敗 (${reasons.join('/')})`;
}
