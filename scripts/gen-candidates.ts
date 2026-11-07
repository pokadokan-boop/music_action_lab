// 曲候補を決め打ちのパターンで生成して assets/midi/ に書く。1〜3 は 1 曲目の候補 (v0)、4〜6 は 2 曲目の候補 (v7)。
// 音楽参考.md の言葉 (かっこよくてゆっくり / 8 連打でなく 4 音 / 構成要素が少ない) は目安であり、機械判定はしない。
// 実行: npm run gen:candidates
// @tonejs/midi は CommonJS で、Node の ESM からは名前付き import が解決できないため default から取る
import midiPkg from '@tonejs/midi';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Midi } = midiPkg as typeof import('@tonejs/midi');
type Midi = InstanceType<typeof Midi>;

const SCENE_SECONDS = 20;
const KICK = 36;
const SNARE = 38;
const HAT = 42;

interface NoteSpec {
  beat: number; // 曲頭からの拍
  len: number; // 拍
  midi: number;
}

interface Candidate {
  id: string;
  bpm: number;
  intent: string;
  melody: (bar: number) => NoteSpec[]; // 小節内の相対拍で返す
  bass: (bar: number) => NoteSpec[];
  drums: (bar: number) => NoteSpec[];
  // v7 (2 曲目の候補): 小節数を決め打ちにする (20 秒で切らない)。lead は背景の高音の線 (トラック名 lead-high)
  bars?: number;
  lead?: (bar: number) => NoteSpec[];
}

function barsFor(bpm: number): number {
  const barSec = (4 * 60) / bpm;
  return Math.round(SCENE_SECONDS / barSec);
}

const n = (beat: number, len: number, midi: number): NoteSpec => ({ beat, len, midi });

// 1: ジャージークラブ風。キックが 3-3-2 で跳ね、後半は 8 分で走る。A マイナー・ペンタトニック
const jersey: Candidate = {
  id: 'candidate-1',
  bpm: 144,
  intent: 'ジャージークラブ風。キックが 3-3-2 で跳ねる。メロディは 1 小節に 2〜4 音で、2 小節ごとに息継ぎ',
  drums: () => [
    n(0, 0.25, KICK),
    n(0.75, 0.25, KICK),
    n(1.5, 0.25, KICK),
    n(2, 0.25, KICK),
    n(2.5, 0.25, KICK),
    n(3, 0.25, KICK),
    n(3.5, 0.25, KICK),
    n(1, 0.25, SNARE),
    n(3, 0.25, SNARE),
    ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b) => n(b, 0.1, HAT)),
  ],
  bass: (bar) => {
    const root = bar % 4 < 2 ? 45 : 41; // A1 / F1
    return [n(0, 0.5, root), n(0.75, 0.5, root), n(1.5, 0.5, root), n(2.5, 0.5, root), n(3.5, 0.5, root + 3)];
  },
  melody: (bar) => {
    const motifs: NoteSpec[][] = [
      [n(0, 0.75, 69), n(0.75, 0.75, 72), n(1.5, 1, 74), n(3, 0.5, 72)],
      [n(0, 1, 76), n(2, 0.5, 74), n(2.5, 0.75, 72)], // 3.25 で終わり、次の小節頭まで休符
      [n(0, 0.75, 67), n(0.75, 0.75, 69), n(1.5, 1, 72), n(3, 0.5, 69)],
      [n(0, 1.5, 64), n(2, 1, 67)], // 3 で終わり、1 拍休む
    ];
    return motifs[bar % 4];
  },
};

// 2: トラップ風ハーフタイム。スネアは 3 拍目だけ、ベースは長く鳴る。F マイナー
const trap: Candidate = {
  id: 'candidate-2',
  bpm: 140,
  intent: 'トラップ風のハーフタイム。スネアは 3 拍目だけ、808 風のベースが長く鳴る。メロディは少なく間が多い',
  drums: (bar) => {
    const base = [
      n(0, 0.25, KICK),
      n(1.75, 0.25, KICK),
      n(2.5, 0.25, KICK),
      n(2, 0.25, SNARE),
      ...[0, 0.5, 1, 1.5, 2, 2.5, 3].map((b) => n(b, 0.1, HAT)),
    ];
    // 2 小節に 1 回、4 拍目に 16 分のハットを入れる
    const roll = bar % 2 === 1 ? [3, 3.25, 3.5, 3.75].map((b) => n(b, 0.08, HAT)) : [n(3.5, 0.1, HAT)];
    return [...base, ...roll];
  },
  bass: (bar) => {
    const root = bar % 4 < 2 ? 41 : 44; // F1 / Ab1
    return [n(0, 1.75, root), n(1.75, 2.25, bar % 4 === 3 ? root + 2 : root)];
  },
  melody: (bar) => {
    const motifs: NoteSpec[][] = [
      [n(0, 2, 68), n(2, 1.5, 65)], // 3.5 で終わる
      [n(0.5, 1, 63), n(2, 1, 65)], // 3 で終わる
      [n(0, 2, 72), n(2.5, 1, 68)],
      [], // 1 小節まるごと休む
    ];
    return motifs[bar % 4];
  },
};

// 3: ミニマルテクノ風。4 つ打ちと裏打ちハット、同じ 2 音の反復。C マイナー
const minimal: Candidate = {
  id: 'candidate-3',
  bpm: 132,
  intent: 'ミニマルテクノ風。4 つ打ちと裏打ちのハット、ベースは同じ 2 音の反復。メロディは 2 小節で 1 回だけ動く',
  drums: () => [
    ...[0, 1, 2, 3].map((b) => n(b, 0.25, KICK)),
    ...[0.5, 1.5, 2.5, 3.5].map((b) => n(b, 0.1, HAT)),
    n(1, 0.25, SNARE),
    n(3, 0.25, SNARE),
  ],
  bass: () => [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i) => n(b, 0.4, i % 2 === 0 ? 36 : 39)), // C2 / Eb2
  melody: (bar) => {
    const pair = Math.floor(bar / 2) % 3;
    const notes = [
      [67, 70], // G4 Bb4
      [65, 68], // F4 Ab4
      [63, 67], // Eb4 G4
    ][pair];
    return bar % 2 === 0 ? [n(0, 1, notes[0]), n(1.5, 1.5, notes[1])] : [n(0, 1, notes[1])]; // 奇数小節は 1 音で、1 拍後に休む
  },
};

// ---- v7: 2 曲目の候補 (docs/plan/v7-phase2-song.md T1) ----
// 共通の形: 4/4、24 小節 = 3 段 × 8 小節。melody の音の始まりは全部 8 分の格子 (0.5 拍の倍数) に置く (当たりは 8 分の格子に乗る決まり。
// 3 連や付点の跳ねは drums と bass にだけ)。melody は 1〜2 小節ごとに 1 拍以上の休符 (grid.ts は休符 1 拍でフレーズを切る)。
// 各段の最後の小節 (8、16、24) にその敵の大技の音型 (短い音 = 予告、長い音 = 当たり)。lead-high は最初から鳴り、段が変わっても音型を変えない。
const V7_BARS = 24;
const stageOf = (bar: number) => Math.floor(bar / 8); // 0, 1, 2
const lastOfStage = (bar: number) => bar % 8 === 7;
const eighths = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const sixteenths = eighths.flatMap((b) => [b, b + 0.25]);
// 3 連のスウィング (candidate-6 の drums と bass): 裏を 2/3 に置く
const swing = [0, 2 / 3, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3];

// 4: 決闘者。ドラムンベース風、右肩上がり。A マイナー (A4 69 / C5 72 / D5 74 / E5 76 / G5 79 / A5 81 / C6 84)。
// 大技「三連突きからの大上段」: 短い音 2〜4 つ (突き。段が進むほど多く速く) → 長い音 (振り下ろし)
const duelist: Candidate = {
  id: 'candidate-4',
  bpm: 160,
  bars: V7_BARS,
  intent: 'ドラムンベース風、右肩上がり (段 1 ハーフタイム → 段 2 ブレイクビーツ → 段 3 16 分のハットと走るベース)。像: 剣を持つ人型の決闘者。大技: 三連突きからの大上段',
  drums: (bar) => {
    const s = stageOf(bar);
    if (s === 0) return [n(0, 0.25, KICK), n(2, 0.25, SNARE), ...[0, 1, 2, 3].map((b) => n(b, 0.1, HAT))];
    if (s === 1) return [n(0, 0.25, KICK), n(2.5, 0.25, KICK), n(1, 0.25, SNARE), n(3, 0.25, SNARE), ...eighths.map((b) => n(b, 0.1, HAT))];
    return [
      n(0, 0.25, KICK),
      n(1.75, 0.25, KICK),
      n(2.5, 0.25, KICK),
      n(1, 0.25, SNARE),
      n(3, 0.25, SNARE),
      ...(bar % 2 === 1 ? [n(3.5, 0.2, SNARE)] : []),
      ...sixteenths.map((b) => n(b, 0.08, HAT)),
    ];
  },
  bass: (bar) => {
    const root = [45, 45, 41, 43][bar % 4]; // A2 A2 F2 G2
    const s = stageOf(bar);
    if (s === 0) return [n(0, 1.5, root), n(2, 1.5, root)];
    if (s === 1) return [0, 0.75, 1.5, 2.5, 3.5].map((b) => n(b, 0.4, root));
    return eighths.map((b, i) => n(b, 0.4, i % 2 === 0 ? root : root + 12));
  },
  melody: (bar) => {
    const s = stageOf(bar);
    // 大技の長い音は拍 3 で切り、次の小節との間に 1 拍の休符を残す (フレーズが次の小節と繋がらないように)
    if (lastOfStage(bar)) {
      if (s === 0) return [n(0, 0.5, 74), n(1, 0.5, 76), n(2, 1, 81)];
      if (s === 1) return [n(0, 0.5, 74), n(0.5, 0.5, 76), n(1, 0.5, 79), n(2, 1, 81)];
      return [n(0, 0.5, 74), n(0.5, 0.5, 76), n(1, 0.5, 79), n(1.5, 0.5, 81), n(2, 1, 84)];
    }
    const even = bar % 2 === 0;
    if (s === 0) return even ? [n(0, 1.5, 69), n(2, 1, 72)] : [n(0, 1.5, 74)];
    if (s === 1) return even ? [n(0, 0.5, 69), n(1, 0.5, 72), n(2, 1, 76)] : [n(0, 1.5, 79), n(2, 1, 74)];
    return even ? [n(0, 0.5, 81), n(0.5, 0.5, 79), n(1.5, 0.5, 76), n(2, 1, 74)] : [n(0, 0.5, 81), n(1, 0.5, 79), n(2, 1, 76)];
  },
  lead: (bar) => (bar % 2 === 0 ? [n(0, 3, 88)] : [n(0, 2, 86), n(2, 2, 84)]), // E6 / D6 C6
};

// 5: 結晶。インダストリアル寄りのテクノ、山型 (段 2 が最も重く、段 3 は 6 小節の静のあと最後の 2 小節で全部)。D マイナー (D5 74 / F5 77 / G5 79 / A5 81 / C6 84 / D6 86)。
// 大技「衛星の収束格子」: 短い音で衛星が点灯 (2〜4 つ) → 長い音で格子と破裂
const crystal: Candidate = {
  id: 'candidate-5',
  bpm: 150,
  bars: V7_BARS,
  intent: 'インダストリアル寄りのテクノ、山型 (段 2 が最も重く、段 3 は静のあと最後に全部)。像: 浮かぶ多面体の結晶が分裂して衛星を従える。大技: 衛星の収束格子',
  drums: (bar) => {
    const s = stageOf(bar);
    const four = [0, 1, 2, 3].map((b) => n(b, 0.25, KICK));
    if (s === 0) return [...four, ...[0.5, 1.5, 2.5, 3.5].map((b) => n(b, 0.1, HAT))];
    if (s === 1 || bar >= 22) return [...four, n(2.5, 0.25, KICK), n(1, 0.25, SNARE), n(3, 0.25, SNARE), ...sixteenths.map((b) => n(b, 0.08, HAT))];
    return [n(0, 0.25, KICK), n(2, 0.1, HAT)];
  },
  bass: (bar) => {
    const root = [38, 38, 41, 36][bar % 4]; // D2 D2 F2 C2
    const s = stageOf(bar);
    if (s === 1 || bar >= 22) return eighths.map((b, i) => n(b, 0.4, i % 2 === 0 ? root : root + 3));
    return [n(0, 3.5, root)];
  },
  melody: (bar) => {
    const s = stageOf(bar);
    if (lastOfStage(bar)) {
      if (s === 0) return [n(0, 0.5, 74), n(1, 0.5, 77), n(2, 1, 86)];
      if (s === 1) return [n(0, 0.5, 74), n(0.5, 0.5, 77), n(1, 0.5, 81), n(1.5, 0.5, 84), n(2, 1, 86)];
      return [n(0, 1, 86), n(1, 1, 84), n(2, 2, 81)]; // 最後の小節: 放ったあとの締め
    }
    const even = bar % 2 === 0;
    if (s === 0) return even ? [n(0, 2, 74), n(2.5, 0.5, 77)] : [n(0, 2, 81)];
    if (s === 1) return even ? [n(0, 0.5, 74), n(1, 0.5, 77), n(2, 1, 81)] : [n(0, 0.5, 81), n(1, 0.5, 84), n(2, 1, 79)];
    // 段 3: 小節 17〜22 は静 (長い音が 1 つおき)、小節 23 で大技 (衛星 4 つ → 格子)
    if (bar === 22) return [n(0, 0.5, 74), n(0.5, 0.5, 77), n(1, 0.5, 81), n(1.5, 0.5, 84), n(2, 1, 86)];
    if (bar === 16) return [n(0, 1.5, 74)];
    if (bar === 18) return [n(0, 1.5, 77)];
    if (bar === 20) return [n(0, 2, 81)];
    return [];
  },
  lead: (bar) => (bar % 2 === 0 ? [n(0, 2, 86), n(2, 2, 89)] : [n(0, 4, 84)]), // D6 F6 / C6
};

// 6: 火の鳥。跳ねるビート (ハットとベースに 3 連のスウィング)、自壊 (段 3 が最高出力。崩れは振り付けと姿で作る。曲は最後の 2 小節で薄くなる)。
// E マイナー (E5 76 / G5 79 / A5 81 / B5 83 / D6 86 / E6 88)。大技「急降下と火の輪」: 上がる 3 音 (舞い上がり) → 長い音 (急降下と火の輪)
const firebird: Candidate = {
  id: 'candidate-6',
  bpm: 156,
  bars: V7_BARS,
  intent: '跳ねるビート (3 連のスウィング)、自壊 (段 3 が最高出力。相殺し続けると崩れていく)。像: 炎をまとう鳥。大技: 急降下と火の輪',
  drums: (bar) => {
    const s = stageOf(bar);
    const base = [n(0, 0.25, KICK), n(2, 0.25, KICK), n(1, 0.25, SNARE), n(3, 0.25, SNARE)];
    if (bar === 22) return [n(0, 0.25, KICK), ...swing.map((b) => n(b, 0.1, HAT))];
    if (s === 0) return [...base, ...swing.map((b) => n(b, 0.1, HAT))];
    if (s === 1) return [...base, n(1 + 2 / 3, 0.2, KICK), n(3 + 2 / 3, 0.2, KICK), ...swing.map((b) => n(b, 0.1, HAT))];
    return [
      ...base,
      n(1 + 2 / 3, 0.2, KICK),
      n(3 + 2 / 3, 0.2, KICK),
      n(2 + 2 / 3, 0.12, SNARE),
      // 3 連の 8 分を全部ハットで (小節をはみ出す 4.0 は次の小節の頭なので入れない)
      ...swing.flatMap((b) => [n(b, 0.08, HAT), ...(b + 1 / 3 < 3.99 ? [n(b + 1 / 3, 0.06, HAT)] : [])]),
    ];
  },
  bass: (bar) => {
    const root = [40, 40, 43, 45][bar % 4]; // E2 E2 G2 A2
    const s = stageOf(bar);
    if (s === 0) return [n(0, 1, root), n(1 + 2 / 3, 0.3, root), n(2, 1, root)];
    if (s === 1) return [n(0, 1, root), n(1 + 2 / 3, 0.3, root), n(2, 1, root), n(3 + 2 / 3, 0.3, root + 7)];
    return swing.map((b, i) => n(b, 0.3, i % 2 === 0 ? root : root + 12));
  },
  melody: (bar) => {
    const s = stageOf(bar);
    if (lastOfStage(bar)) {
      if (s === 0) return [n(0, 0.5, 76), n(1, 0.5, 79), n(2, 1, 88)];
      if (s === 1) return [n(0, 0.5, 76), n(0.5, 0.5, 79), n(1, 0.5, 83), n(2, 1, 88)];
      return [n(0, 0.5, 76), n(0.5, 0.5, 79), n(1, 0.5, 83), n(1.5, 0.5, 86), n(2, 1, 88)];
    }
    const even = bar % 2 === 0;
    if (s === 0) return even ? [n(0, 1.5, 76), n(2, 1, 81)] : [n(0, 1.5, 83)];
    if (s === 1) return even ? [n(0, 0.5, 76), n(1, 0.5, 79), n(2, 1, 83)] : [n(0, 1.5, 86), n(2, 1, 83)];
    if (bar === 22) return [n(0, 2, 81)]; // 最後の前: 薄く
    return even ? [n(0, 0.5, 88), n(0.5, 0.5, 86), n(1, 0.5, 83), n(2, 0.5, 81), n(2.5, 0.5, 83)] : [n(0, 0.5, 88), n(1, 0.5, 86), n(2, 1, 83)];
  },
  lead: (bar) => (bar % 2 === 0 ? [n(0, 2, 91), n(2, 2, 88)] : [n(0, 4, 86)]), // G6 E6 / D6
};

function build(c: Candidate): Midi {
  const midi = new Midi();
  midi.header.setTempo(c.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const ppq = midi.header.ppq;
  const bars = c.bars ?? barsFor(c.bpm);
  const tracks: [string, (bar: number) => NoteSpec[], number][] = [
    ['melody', c.melody, 0],
    ['bass', c.bass, 1],
    ['drums', c.drums, 9],
  ];
  if (c.lead) tracks.push(['lead-high', c.lead, 2]);
  for (const [name, gen, channel] of tracks) {
    const track = midi.addTrack();
    track.name = name;
    track.channel = channel;
    for (let bar = 0; bar < bars; bar++) {
      for (const s of gen(bar)) {
        track.addNote({ midi: s.midi, ticks: Math.round((bar * 4 + s.beat) * ppq), durationTicks: Math.round(s.len * ppq) });
      }
    }
  }
  return midi;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'midi');
mkdirSync(outDir, { recursive: true });
for (const c of [jersey, trap, minimal, duelist, crystal, firebird]) {
  const midi = build(c);
  const file = resolve(outDir, `${c.id}.mid`);
  writeFileSync(file, Buffer.from(midi.toArray()));
  const bars = c.bars ?? barsFor(c.bpm);
  console.log(`${c.id}: ${c.bpm} BPM, ${bars} bars, ${((bars * 4 * 60) / c.bpm).toFixed(2)} s, ${midi.tracks.reduce((a, t) => a + t.notes.length, 0)} notes`);
}
