// 結果画面の要約。記録 (GameLog) と振り付け・グリッドから、人間が不満を書くときに参照する文章を作る
import type { Choreo } from './choreo';
import type { Grid } from './grid';
import type { GameLog, SummaryMeta } from './log';

export function buildSummary(log: GameLog, choreo: Choreo, grid: Grid, meta: SummaryMeta): string {
  const head = log.summary(meta);
  const rows: string[] = ['', 'phrase | 攻撃 | 被弾 | 自分の攻撃回数'];
  for (const p of grid.phrases) {
    const atks = choreo.attacks.map((a, i) => ({ a, i })).filter(({ a }) => a.phrase === p.index);
    const types = atks.map(({ a }) => `${a.type}@${a.hitBeat}`).join(' ') || '-';
    const damaged = log.events.some((e) => e.kind === 'damage' && atks.some(({ i }) => i === e.attackIndex)) ? '被弾' : '-';
    const myAttacks = log.events.filter((e) => e.kind === 'attack' && e.beat >= p.startBeat && e.beat < p.endBeat).length;
    rows.push(`${String(p.index).padStart(2)} | ${types} | ${damaged} | ${myAttacks}`);
  }
  return `${head}\n${rows.join('\n')}`;
}
