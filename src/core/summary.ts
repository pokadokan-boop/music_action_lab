// 結果画面の要約。記録 (GameLog) と振り付け・グリッドから、人間が不満を書くときに参照する文章を作る
import type { Choreo } from './choreo';
import type { Grid } from './grid';
import { CANCEL_MISS_LABEL, type GameLog, type SummaryMeta } from './log';

export function buildSummary(log: GameLog, choreo: Choreo, grid: Grid, meta: SummaryMeta): string {
  const head = log.summary(meta);
  const rows: string[] = ['', 'phrase | 攻撃 | 被弾 | 相殺 | 自分の攻撃回数'];
  for (const p of grid.phrases) {
    const atks = choreo.attacks.map((a, i) => ({ a, i })).filter(({ a }) => a.phrase === p.index);
    const types = atks.map(({ a }) => `${a.type}@${a.hitBeat}`).join(' ') || '-';
    const ofPhrase = (kind: string) => log.events.filter((e) => e.kind === kind && atks.some(({ i }) => i === e.attackIndex));
    const damaged = ofPhrase('damage').length > 0 ? '被弾' : '-';
    const myAttacks = log.events.filter((e) => e.kind === 'attack' && e.beat >= p.startBeat && e.beat < p.endBeat).length;
    rows.push(`${String(p.index).padStart(2)} | ${types} | ${damaged} | ${cancelColumn(ofPhrase('cancel').length, ofPhrase('cancel-miss'))} | ${myAttacks}`);
  }
  return `${head}\n${rows.join('\n')}`;
}

// 相殺列: 相殺できたら「相殺」、できなかった押下だけなら理由 (重複は 1 つに)、どちらも無ければ -
function cancelColumn(cancels: number, misses: { reason?: keyof typeof CANCEL_MISS_LABEL }[]): string {
  if (cancels > 0) return '相殺';
  if (misses.length === 0) return '-';
  const reasons = [...new Set(misses.map((e) => (e.reason ? CANCEL_MISS_LABEL[e.reason] : '?')))];
  return `失敗 (${reasons.join('/')})`;
}
