// 曲候補 3 つを決め打ちのパターンで生成して assets/midi/ に書く。
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

function build(c: Candidate): Midi {
  const midi = new Midi();
  midi.header.setTempo(c.bpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const ppq = midi.header.ppq;
  const bars = barsFor(c.bpm);
  const tracks: [string, (bar: number) => NoteSpec[], number][] = [
    ['melody', c.melody, 0],
    ['bass', c.bass, 1],
    ['drums', c.drums, 9],
  ];
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
for (const c of [jersey, trap, minimal]) {
  const midi = build(c);
  const file = resolve(outDir, `${c.id}.mid`);
  writeFileSync(file, Buffer.from(midi.toArray()));
  const bars = barsFor(c.bpm);
  console.log(`${c.id}: ${c.bpm} BPM, ${bars} bars, ${((bars * 4 * 60) / c.bpm).toFixed(2)} s, ${midi.tracks.reduce((a, t) => a + t.notes.length, 0)} notes`);
}
