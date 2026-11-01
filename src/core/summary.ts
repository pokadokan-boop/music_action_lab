// 結果画面の要約。記録 (GameLog) と振り付け・グリッドから、人間が不満を書くときに参照する文章を作る
import type { Choreo } from './choreo';
import type { Grid } from './grid';
import { CANCEL_MISS_LABEL, OUTCOME_LABEL, type GameLog, type SummaryMeta } from './log';

export function buildSummary(log: GameLog, choreo: Choreo, grid: Grid, meta: SummaryMeta): string {
  const head = log.summary(meta);
  const rows: string[] = ['', ...buildScore(log, grid), '', 'phrase | 攻撃 | 被弾 | 結果 | 相殺 | 自分の攻撃回数'];
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

// プレイヤーの譜 (v5 T5): 1 行 1 小節、16 分の格子 (0.25 拍) 16 マス、1 拍ごとに空白で区切る。
// 記号: ・ 無し / ス ステップ / 攻 通常 / 返 返し / 放 放ち / 溜 溜め中 / 相 相殺した押下 / 強 強い相殺。
// 同じマスに複数あれば 強 > 相 > 放 > 返 > 攻 > ス > 溜 の順に 1 つ。押下は最寄りの 16 分に丸める
export const SCORE_LEGEND = '譜 (16 分 1 マス): ・無し ス=ステップ 攻=通常 返=返し 放=放ち 溜=溜め中 相=相殺 強=強い相殺';
const SCORE_RANK: Record<string, number> = { '・': 0, 溜: 1, ス: 2, 攻: 3, 返: 4, 放: 5, 相: 6, 強: 7 };
const CELLS_PER_BEAT = 4;

export function buildScore(log: GameLog, grid: Grid): string[] {
  const perBar = grid.beatsPerBar * CELLS_PER_BEAT;
  const bars = Math.max(1, Math.ceil(grid.totalBeats / grid.beatsPerBar));
  const cells: string[] = new Array(bars * perBar).fill('・');
  const put = (cell: number, sym: string) => {
    if (cell < 0 || cell >= cells.length) return;
    if (SCORE_RANK[sym] > SCORE_RANK[cells[cell]]) cells[cell] = sym;
  };
  const cellOf = (beat: number) => Math.round(beat * CELLS_PER_BEAT);
  const events = log.events;
  // 溜め中: charge から、その後最初の 放ち (attack release) か charge-break まで
  for (const [i, e] of events.entries()) {
    if (e.kind !== 'charge') continue;
    const end = events.slice(i + 1).find((x) => x.kind === 'charge-break' || (x.kind === 'attack' && x.action === 'release'));
    const endCell = end ? cellOf(end.beat) : cells.length;
    for (let c = cellOf(e.beat); c < endCell; c++) put(c, '溜');
  }
  for (const e of events) {
    if (e.kind === 'step') put(cellOf(e.beat), 'ス');
    if (e.kind === 'attack') put(cellOf(e.beat), e.action === 'release' ? '放' : e.action === 'riposte' ? '返' : '攻');
    if (e.kind === 'cancel') put(cellOf(e.beat), e.strong ? '強' : '相');
  }
  const lines = [SCORE_LEGEND];
  for (let b = 0; b < bars; b++) {
    const beats: string[] = [];
    for (let k = 0; k < grid.beatsPerBar; k++) {
      const start = b * perBar + k * CELLS_PER_BEAT;
      beats.push(cells.slice(start, start + CELLS_PER_BEAT).join(''));
    }
    lines.push(`小節 ${String(b + 1).padStart(2)} | ${beats.join(' ')} |`);
  }
  return lines;
}

// 相殺列: 相殺できたら「相殺」、できなかった押下だけなら理由 (重複は 1 つに)、どちらも無ければ -
function cancelColumn(cancels: number, misses: { reason?: keyof typeof CANCEL_MISS_LABEL }[]): string {
  if (cancels > 0) return '相殺';
  if (misses.length === 0) return '-';
  const reasons = [...new Set(misses.map((e) => (e.reason ? CANCEL_MISS_LABEL[e.reason] : '?')))];
  return `失敗 (${reasons.join('/')})`;
}
