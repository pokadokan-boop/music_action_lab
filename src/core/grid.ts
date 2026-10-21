// MIDI → 拍グリッド。@tonejs/midi の Midi オブジェクトか toJSON() の形を受ける。
// 拍の位置は ticks / ppq で出す (テンポに依存しない)。テンポは最初の 1 つを使う。

export interface MidiNoteLike {
  ticks: number;
  durationTicks: number;
  midi: number;
}

export interface MidiTrackLike {
  name: string;
  notes: MidiNoteLike[];
}

export interface MidiLike {
  header: {
    ppq: number;
    tempos: { bpm: number }[];
    timeSignatures?: { timeSignature: number[] }[];
  };
  tracks: MidiTrackLike[];
}

export interface Phrase {
  index: number;
  startBeat: number;
  endBeat: number;
  noteBeats: number[];
  notePitches: number[];
}

export interface Grid {
  bpm: number;
  beatSec: number;
  beatsPerBar: number;
  totalBeats: number;
  durationSec: number;
  melodyOnsets: number[];
  phrases: Phrase[];
}

interface NoteBeat {
  start: number;
  end: number;
  pitch: number;
}

const REST_SPLIT_BEATS = 1;
const FALLBACK_PHRASE_BARS = 2;

export function buildGrid(midi: MidiLike): Grid {
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beatsPerBar = midi.header.timeSignatures?.[0]?.timeSignature?.[0] ?? 4;
  const ppq = midi.header.ppq;
  const beatSec = 60 / bpm;

  const melody =
    midi.tracks.find((t) => t.name === 'melody' && t.notes.length > 0) ??
    midi.tracks.find((t) => t.notes.length > 0);
  if (!melody) throw new Error('buildGrid: ノートを持つトラックが無い');

  let maxEnd = 0;
  for (const track of midi.tracks) {
    for (const n of track.notes) maxEnd = Math.max(maxEnd, (n.ticks + n.durationTicks) / ppq);
  }
  const totalBeats = Math.max(beatsPerBar, Math.ceil(maxEnd / beatsPerBar) * beatsPerBar);

  const notes: NoteBeat[] = [...melody.notes]
    .sort((a, b) => a.ticks - b.ticks)
    .map((n) => ({ start: n.ticks / ppq, end: (n.ticks + n.durationTicks) / ppq, pitch: n.midi }));

  let groups = splitByRests(notes);
  if (groups.length === 1) groups = splitByBars(notes, FALLBACK_PHRASE_BARS * beatsPerBar);

  const phrases: Phrase[] = groups.map((g, i) => ({
    index: i,
    startBeat: g[0].start,
    endBeat: i + 1 < groups.length ? groups[i + 1][0].start : totalBeats,
    noteBeats: unique(g.map((n) => n.start)),
    notePitches: g.map((n) => n.pitch),
  }));

  return {
    bpm,
    beatSec,
    beatsPerBar,
    totalBeats,
    durationSec: totalBeats * beatSec,
    melodyOnsets: unique(notes.map((n) => n.start)),
    phrases,
  };
}

function splitByRests(notes: NoteBeat[]): NoteBeat[][] {
  const groups: NoteBeat[][] = [];
  let current: NoteBeat[] = [];
  let currentEnd = -Infinity;
  for (const n of notes) {
    if (current.length > 0 && n.start - currentEnd >= REST_SPLIT_BEATS) {
      groups.push(current);
      current = [];
      currentEnd = -Infinity;
    }
    current.push(n);
    currentEnd = Math.max(currentEnd, n.end);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function splitByBars(notes: NoteBeat[], spanBeats: number): NoteBeat[][] {
  const map = new Map<number, NoteBeat[]>();
  for (const n of notes) {
    const key = Math.floor(n.start / spanBeats);
    const g = map.get(key);
    if (g) g.push(n);
    else map.set(key, [n]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
}

function unique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function phraseAt(grid: Grid, beat: number): Phrase | undefined {
  return grid.phrases.find((p) => beat >= p.startBeat && beat < p.endBeat);
}
