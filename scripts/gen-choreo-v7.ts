// v7 の振り付け (2 曲目 candidate-4。決闘者) を小節の型から生成して assets/choreo/v7.json に書く。
// 設計は docs/plan/v7-phase2-enemy.md「T4」と assets/choreo/README.md。65 攻撃を手で書くより、型と位置の設計を 1 箇所に置く。
// 実行: npm run gen:choreo-v7 → npx tsx scripts/validate-choreo.ts assets/choreo/v7.json
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Attack, Choreo, PathPoint } from '../src/core/choreo';
import type { Vec } from '../src/core/vec';

const BAR = 4; // 拍
const Y_MID = 0.28125;
// 自機狙いの target は実行時に置き換わるので、JSON には自機の開始位置を置く (v6 と同じ)
const TARGET: Vec = { x: 0.25, y: Y_MID };
const REST: Vec = { x: 0.75, y: Y_MID };

// 段ごとの構えの位置 G の x と、踏み込みの終点 L (G の 0.14 左)。段が進むほど少し前に出る
const GUARD_X = [0.6, 0.58, 0.56];
const LUNGE = 0.14;
// 小節ごとの y: 中央 / 上 / 下 を巡回させて単調にしない
const Y_CYCLE = [0, -0.09, 0.09];

// 攻撃の形 (docs/plan/v7-phase2-enemy.md「T4」の表)
const THRUST = { length: 0.32, r: 0.025, active: 0.25 };
const CHOP = { length: 0.45, r: 0.045, active: 0.25 };
const HEAVY_CHOP = { length: 0.6, r: 0.07, active: 0.5 };
const SWEEP = { length: 0.3, r: 0.03, active: 0.5 };
const SHOT_R = 0.02;
const DASH_R = 0.03;
const LEAD = 2; // 予告の先行 (acceptance.telegraphLeadBeatsMin)
const REAIM = 1; // 連撃の 2 発目以降の狙い直しは当たりの 1 拍前 (T3 の気づき: 0.5 拍前は隅で違反)
const REAIM_WIDE = 1.5; // 広い薙ぎ払い (150 度) の狙い直し
// 小節の行動が終わって次の小節の構えへ戻り着く拍 (小節頭の 0.5 拍前)。次の攻撃の踏み込みはここから始まる
const RETURN_AT = BAR - 0.5;
const EPS = 1e-9;

const pt = (beat: number, p: Vec): PathPoint => ({ beat, x: p.x, y: p.y });
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

function stageOf(bar: number): number {
  return Math.floor(bar / 8);
}
function guard(bar: number): Vec {
  return { x: GUARD_X[stageOf(Math.min(bar, 23))], y: Y_MID + Y_CYCLE[bar % 3] };
}
function lunge(bar: number): Vec {
  const g = guard(bar);
  return { x: g.x - LUNGE, y: g.y };
}

// 直前の攻撃の path の終点 (拍と位置)。次の攻撃の path をここから始めて、敵が飛ばないようにする
interface Prev {
  beat: number;
  pos: Vec;
}

// prev から beat の pos へ移る path の頭。prev がその拍より前ならそこから、同じ拍なら pos だけ (位置は同じ前提)
function from(prev: Prev, beat: number, pos: Vec): PathPoint[] {
  return prev.beat < beat - EPS ? [pt(prev.beat, prev.pos), pt(beat, pos)] : [pt(beat, pos)];
}

// 連撃の先頭の踏み込み: prev から構え G へ移り、hit の 0.5 拍前から L へ踏み込む
function lungePath(prev: Prev, hit: number, g: Vec, l: Vec): PathPoint[] {
  return [...from(prev, hit - 0.5, g), pt(hit, l)];
}

// 締めの path: at で当たりを出し、active の終わりまでとどまり、returnBeat に戻り先へ
function finishPath(at: Vec, hit: number, active: number, returnBeat: number, returnTo: Vec): PathPoint[] {
  return [pt(hit, at), pt(hit + active, at), pt(returnBeat, returnTo)];
}

// 突き: 短い laser。path は呼ぶ側が決める (単発は 1 点 + approach、連撃は先頭に固定の踏み込み)
function thrust(phrase: number, hit: number, path: PathPoint[], over: Partial<Attack> = {}): Attack {
  return {
    phrase,
    type: 'laser',
    aim: 'player',
    telegraphBeat: hit - LEAD,
    hitBeat: hit,
    activeBeats: THRUST.active,
    length: THRUST.length,
    move: 'thrust',
    path,
    hitbox: { shape: 'circle', r: THRUST.r },
    target: TARGET,
    ...over,
  };
}

// 振り下ろし: 長めの laser。heavy なら大技の大上段 (両手放ちだけで相殺)
function chop(phrase: number, hit: number, path: PathPoint[], heavy: boolean, over: Partial<Attack> = {}): Attack {
  const f = heavy ? HEAVY_CHOP : CHOP;
  return {
    phrase,
    type: 'laser',
    aim: 'player',
    telegraphBeat: hit - LEAD,
    hitBeat: hit,
    activeBeats: f.active,
    length: f.length,
    ...(heavy ? { heavy: true } : {}),
    move: heavy ? 'heavyChop' : 'chop',
    path,
    hitbox: { shape: 'circle', r: f.r },
    target: TARGET,
    ...over,
  };
}

// 薙ぎ払い: 発生点から長さ 0.3 の線が deg 度を 0.5 拍で回る
function sweep(phrase: number, hit: number, path: PathPoint[], deg: number, over: Partial<Attack> = {}): Attack {
  return {
    phrase,
    type: 'sweep',
    aim: 'player',
    telegraphBeat: hit - LEAD,
    hitBeat: hit,
    activeBeats: SWEEP.active,
    length: SWEEP.length,
    sweepDeg: deg,
    move: 'sweep',
    path,
    hitbox: { shape: 'circle', r: SWEEP.r },
    target: TARGET,
    ...over,
  };
}

// 飛ぶ剣: shot (段 3)
function shot(phrase: number, hit: number, path: PathPoint[], over: Partial<Attack> = {}): Attack {
  return {
    phrase,
    type: 'shot',
    aim: 'player',
    telegraphBeat: hit - LEAD,
    hitBeat: hit,
    activeBeats: 0,
    move: 'shot',
    path,
    hitbox: { shape: 'circle', r: SHOT_R },
    target: TARGET,
    ...over,
  };
}

// 踏み込み突き: dash。prev から構え g に移り、hit の 0.5 拍前から少し引き、hit で出発、hit + 0.5 で自機 (狙いの基準)、hit + 1 で行き過ぎる。
// windupFixed: 出発までの点は自機狙いで動かさない (v7.1。予告の瞬間に敵が跳んでいた)
function dash(phrase: number, hit: number, prev: Prev, g: Vec, over: Partial<Attack> = {}): { attack: Attack; over: Vec } {
  const back = { x: g.x + 0.04, y: g.y };
  const anchor = { x: 0.3, y: g.y };
  const overshoot = { x: 0.24, y: g.y };
  const attack: Attack = {
    phrase,
    type: 'dash',
    aim: 'player',
    telegraphBeat: hit - LEAD,
    hitBeat: hit,
    activeBeats: 0.5,
    move: 'dash',
    windupFixed: true,
    path: [...from(prev, hit - 0.5, g), pt(hit, back), pt(hit + 0.5, anchor), pt(hit + 1, overshoot)],
    hitbox: { shape: 'circle', r: DASH_R },
    ...over,
  };
  return { attack, over: overshoot };
}

const attacks: Attack[] = [];
let prev: Prev = { beat: 0, pos: REST };

for (let bar = 0; bar < 24; bar++) {
  const t = bar * BAR;
  const s = stageOf(bar);
  const g = guard(bar);
  const l = lunge(bar);
  const gNext = guard(bar + 1);
  const returnBeat = t + RETURN_AT;
  const last = bar % 8 === 7;
  const even = bar % 2 === 0;

  if (last) {
    // 大技: 短い音の数だけ突き (段 1: 2、段 2: 3、段 3: 4) → 長い音で大上段 (heavy)
    const hits = s === 0 ? [t, t + 1] : s === 1 ? [t, t + 0.5, t + 1] : [t, t + 0.5, t + 1, t + 1.5];
    const group = `finisher-${s + 1}`;
    hits.forEach((h, i) => {
      if (i === 0) attacks.push(thrust(bar, h, lungePath(prev, h, g, l), { group }));
      else attacks.push(thrust(bar, h, [pt(h, l)], { group, aimBeat: h - REAIM }));
    });
    const chopBeat = t + 2;
    // 最後の小節は曲の終わりまでに休憩位置へ戻る
    const returnTo = bar === 23 ? REST : gNext;
    attacks.push(chop(bar, chopBeat, finishPath(l, chopBeat, HEAVY_CHOP.active, returnBeat, returnTo), true, { group, aimBeat: chopBeat - REAIM }));
    prev = { beat: returnBeat, pos: returnTo };
    continue;
  }

  if (s === 0) {
    if (bar === 0) {
      // 小節 0: 拍 0 の音には予告 (2 拍) が間に合わないので、拍 0 で構え (休憩位置から G へ)、拍 2 の音に突き (自機へ踏み込む)
      attacks.push(thrust(bar, 2, [pt(0, REST), pt(1, g), pt(2, g)], { approach: { beats: 1, distance: 0.12 } }));
      // 拍 2 の音は 1 つだけなので振り下ろしは無い。踏み込んだ先から 1 拍かけて構えに戻り (拍 3)、次の小節の dash はそこから
      prev = { beat: 3, pos: g };
    } else if (even) {
      // 突き (自機へ踏み込む approach。踏み込みの後は次の攻撃の最初の点へ滑る) → 振り下ろし (通常) → 次の構えへ
      attacks.push(thrust(bar, t, [pt(t, g)], { approach: { beats: 1, distance: 0.12 } }));
      attacks.push(chop(bar, t + 2, finishPath(g, t + 2, CHOP.active, returnBeat, gNext), false));
      prev = { beat: returnBeat, pos: gNext };
    } else {
      // 踏み込み突き (dash)。行き過ぎた先から次の小節の突きの位置へは滑る (dash は自機の位置で path が動く)
      const d = dash(bar, t, prev, g);
      attacks.push(d.attack);
      prev = { beat: t + 1, pos: d.over };
    }
    continue;
  }

  if (s === 1) {
    if (even) {
      // 突き (固定の踏み込み) → 突き (狙い直し) → 振り下ろし (通常。狙い直し) の連撃
      const group = `combo-${bar}`;
      attacks.push(thrust(bar, t, lungePath(prev, t, g, l), { group }));
      attacks.push(thrust(bar, t + 1, [pt(t + 1, l)], { group, aimBeat: t + 1 - REAIM }));
      attacks.push(chop(bar, t + 2, finishPath(l, t + 2, CHOP.active, returnBeat, gNext), false, { group, aimBeat: t + 2 - REAIM }));
      prev = { beat: returnBeat, pos: gNext };
    } else {
      // 踏み込み突き (dash) → 薙ぎ払い 120 度 (着地した場所から。followPrev で dash の実際の終点に続く) → 次の構えへ
      const group = `lunge-${bar}`;
      const d = dash(bar, t, prev, g, { group });
      attacks.push(d.attack);
      attacks.push(sweep(bar, t + 2, finishPath(d.over, t + 2, SWEEP.active, returnBeat, gNext), 120, { chained: true, group, followPrev: true }));
      prev = { beat: returnBeat, pos: gNext };
    }
    continue;
  }

  // 段 3
  if (even) {
    // 飛ぶ剣 ×2 (2 発目は狙い直し) → 突き (固定の踏み込み) → 振り下ろし (通常)
    const group = `rain-${bar}`;
    attacks.push(shot(bar, t, from(prev, t, g), { group }));
    attacks.push(shot(bar, t + 0.5, [pt(t + 0.5, g)], { group, aimBeat: t + 0.5 - REAIM }));
    attacks.push(thrust(bar, t + 1.5, lungePath({ beat: t + 0.5, pos: g }, t + 1.5, g, l), { group, aimBeat: t + 1.5 - REAIM }));
    attacks.push(chop(bar, t + 2, finishPath(l, t + 2, CHOP.active, returnBeat, gNext), false, { group, aimBeat: t + 2 - REAIM }));
    prev = { beat: returnBeat, pos: gNext };
  } else {
    // 突き (固定の踏み込み) → 突き (狙い直し) → 薙ぎ払い 150 度 (狙い直し)
    const group = `rush-${bar}`;
    attacks.push(thrust(bar, t, lungePath(prev, t, g, l), { group }));
    attacks.push(thrust(bar, t + 1, [pt(t + 1, l)], { group, aimBeat: t + 1 - REAIM }));
    // 150 度の薙ぎ払いは 1 拍前の狙い直しだと近くにいる自機が横へ逃げ切れない (検査 dodgeable) ので 1.5 拍前
    attacks.push(sweep(bar, t + 2, finishPath(l, t + 2, SWEEP.active, returnBeat, gNext), 150, { group, aimBeat: t + 2 - REAIM_WIDE }));
    prev = { beat: returnBeat, pos: gNext };
  }
}

// 位置を丸める (JSON を読みやすく)
for (const a of attacks) {
  a.path = a.path.map((p) => ({ beat: r5(p.beat), x: r5(p.x), y: r5(p.y) }));
}

const choreo: Choreo = {
  id: 'v7',
  song: 'candidate-4',
  intent:
    '2 曲目 (決闘者)。大技「三連突きからの大上段」を軸に、突き (短い laser。連撃は 2 発目以降を 1 拍前に狙い直す) / 振り下ろし / 踏み込み突き (dash) / 薙ぎ払い (sweep) / 飛ぶ剣 (shot。段 3) を派生。各段の最後の小節が大技で、締めの大上段 (heavy) は両手放ちだけで相殺、片手は軽減。右肩上がり: 段 1 単発 → 段 2 連撃 3 → 段 3 連撃 4',
  idle: { amplitude: 0.02 },
  motion: 'snap',
  knockbackResist: 0.6,
  sceneSeconds: 36,
  enemyHp: 40,
  figure: 'duelist',
  attacks,
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'choreo', 'v7.json');
writeFileSync(out, `${JSON.stringify(choreo, null, 2)}\n`);
const heavyCount = attacks.filter((a) => a.heavy).length;
const groups = new Set(attacks.map((a) => a.group).filter(Boolean)).size;
console.log(`${out}: ${attacks.length} 攻撃 (heavy ${heavyCount}、連撃の束 ${groups})`);
