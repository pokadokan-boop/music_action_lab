// 結果画面の要約。記録 (GameLog) と振り付け・グリッドから、人間が不満を書くときに参照する文章を作る
import type { Choreo } from './choreo';
import type { Grid } from './grid';
import { CANCEL_MISS_LABEL, HAND_LABEL, OUTCOME_LABEL, type GameLog, type Hand, type LogEvent, type SummaryMeta } from './log';

export function buildSummary(log: GameLog, choreo: Choreo, grid: Grid, meta: SummaryMeta): string {
  const head = log.summary(meta);
  const rows: string[] = ['', ...buildScore(log, grid), '', 'phrase | 攻撃 | 被弾 | 結果 | 相殺 | 自分の攻撃回数'];
  for (const p of grid.phrases) {
    const atks = choreo.attacks
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.phrase === p.index)
      .sort((x, y) => x.a.hitBeat - y.a.hitBeat);
    const types = atks.map(({ a }) => `${a.type}@${a.hitBeat}`).join(' ') || '-';
    // 攻撃ごとの列 (v5: 1 フレーズに 2 攻撃)。攻撃が 2 つ以上なら「/」で並べる
    const perAttack = (f: (idx: number) => string) => (atks.length === 0 ? '-' : atks.map(({ i }) => f(i)).join('/'));
    const ofAttack = (kind: string, idx: number) => log.events.filter((e) => e.kind === kind && e.attackIndex === idx);
    // 被弾列: 被弾して取り消されていなければ「被弾」、遅い側の相殺で取り消されたら「取り消し」
    const damaged = perAttack((i) => (ofAttack('damage', i).length === 0 ? '-' : ofAttack('damage-undone', i).length > 0 ? '取り消し' : '被弾'));
    const myAttacks = log.events.filter((e) => e.kind === 'attack' && e.beat >= p.startBeat && e.beat < p.endBeat).length;
    // 結果列 (v4): 確定した結果 (捌けた / 被弾)。分岐が選ばれていれば「捌けた (止まる)」のように添える
    const result = perAttack((i) => {
      const oc = ofAttack('outcome', i)[0];
      return !oc || !oc.outcome ? '-' : `${OUTCOME_LABEL[oc.outcome]}${oc.branch && oc.branch !== 'normal' ? ` (${BRANCH_LABEL[oc.branch]})` : ''}`;
    });
    const cancels = perAttack((i) => cancelColumn(ofAttack('cancel', i).length, ofAttack('cancel-miss', i)));
    rows.push(`${String(p.index).padStart(2)} | ${types} | ${damaged} | ${result} | ${cancels} | ${myAttacks}`);
  }
  return `${head}\n${rows.join('\n')}`;
}

const BRANCH_LABEL = { normal: '通常', stop: '止まる', approach: '寄る', retreat: '離れる' } as const;

// プレイヤーの譜 (v5 T5、v6 T3 で 3 行に): 1 小節 3 行 (右 = 右手、左 = 左手、足 = ステップ)、16 分の格子 (0.25 拍) 16 マス、1 拍ごとに空白で区切る。
// 記号: ・ 無し / ス ステップ / 攻 通常 / 返 返し / 放 放ち / 溜 溜め中 / 相 相殺した押下 / 強 強い相殺。
// 同じマスに複数あれば 強 > 相 > 放 > 返 > 攻 > ス > 溜 の順に 1 つ。押下は最寄りの 16 分に丸める。hand の無い記録 (v5 以前) は右手
export const SCORE_LEGEND = '譜 (16 分 1 マス。1 小節 3 行: 右=右手 左=左手 足=ステップ): ・無し ス=ステップ 攻=通常 返=返し 放=放ち 溜=溜め中 相=相殺 強=強い相殺';
const SCORE_RANK: Record<string, number> = { '・': 0, 溜: 1, ス: 2, 攻: 3, 返: 4, 放: 5, 相: 6, 強: 7 };
const CELLS_PER_BEAT = 4;
const SCORE_ROWS: readonly { label: string; hand: Hand | null }[] = [
  { label: HAND_LABEL.right, hand: 'right' },
  { label: HAND_LABEL.left, hand: 'left' },
  { label: '足', hand: null },
];

export function buildScore(log: GameLog, grid: Grid): string[] {
  const perBar = grid.beatsPerBar * CELLS_PER_BEAT;
  const bars = Math.max(1, Math.ceil(grid.totalBeats / grid.beatsPerBar));
  const rows = SCORE_ROWS.map(({ hand }) => scoreCells(log.events, hand, bars * perBar));
  const lines = [SCORE_LEGEND];
  for (let b = 0; b < bars; b++) {
    SCORE_ROWS.forEach(({ label }, r) => {
      const beats: string[] = [];
      for (let k = 0; k < grid.beatsPerBar; k++) {
        const start = b * perBar + k * CELLS_PER_BEAT;
        beats.push(rows[r].slice(start, start + CELLS_PER_BEAT).join(''));
      }
      const head = r === 0 ? `小節 ${String(b + 1).padStart(2)}` : '      ';
      lines.push(`${head} ${label} | ${beats.join(' ')} |`);
    });
  }
  return lines;
}

// 1 行ぶんのマス。hand が null なら足 (ステップ) の行、そうでなければその手の 攻 返 放 溜 相 強
function scoreCells(events: readonly LogEvent[], hand: Hand | null, length: number): string[] {
  const cells: string[] = new Array(length).fill('・');
  const put = (cell: number, sym: string) => {
    if (cell < 0 || cell >= cells.length) return;
    if (SCORE_RANK[sym] > SCORE_RANK[cells[cell]]) cells[cell] = sym;
  };
  const cellOf = (beat: number) => Math.round(beat * CELLS_PER_BEAT);
  if (hand === null) {
    for (const e of events) if (e.kind === 'step') put(cellOf(e.beat), 'ス');
    return cells;
  }
  const ofHand = (e: LogEvent) => (e.hand ?? 'right') === hand;
  // 溜め中: その手の charge から、その手の最初の 放ち (attack release) か charge-break まで
  for (const [i, e] of events.entries()) {
    if (e.kind !== 'charge' || !ofHand(e)) continue;
    const end = events.slice(i + 1).find((x) => ofHand(x) && (x.kind === 'charge-break' || (x.kind === 'attack' && x.action === 'release')));
    const endCell = end ? cellOf(end.beat) : cells.length;
    for (let c = cellOf(e.beat); c < endCell; c++) put(c, '溜');
  }
  for (const e of events) {
    if (!ofHand(e)) continue;
    if (e.kind === 'attack') put(cellOf(e.beat), e.action === 'release' ? '放' : e.action === 'riposte' ? '返' : '攻');
    if (e.kind === 'cancel') put(cellOf(e.beat), e.strong ? '強' : '相');
  }
  return cells;
}

// 相殺列: 相殺できたら「相殺」、できなかった押下だけなら理由 (重複は 1 つに)、どちらも無ければ -
function cancelColumn(cancels: number, misses: { reason?: keyof typeof CANCEL_MISS_LABEL }[]): string {
  if (cancels > 0) return '相殺';
  if (misses.length === 0) return '-';
  const reasons = [...new Set(misses.map((e) => (e.reason ? CANCEL_MISS_LABEL[e.reason] : '?')))];
  return `失敗 (${reasons.join('/')})`;
}
