import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { buildGrid, phraseAt } from './grid';

function makeMidi(bpm: number, melody: { beat: number; lengthBeats: number; pitch: number }[]): Midi {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = 'melody';
  const ppq = midi.header.ppq;
  for (const n of melody) {
    track.addNote({ midi: n.pitch, ticks: n.beat * ppq, durationTicks: n.lengthBeats * ppq });
  }
  return midi;
}

describe('buildGrid', () => {
  it('bpm と拍の長さ、小節で切り上げた総拍数を出す', () => {
    const midi = makeMidi(140, [
      { beat: 0, lengthBeats: 1, pitch: 60 },
      { beat: 5, lengthBeats: 1, pitch: 62 },
    ]);
    const grid = buildGrid(midi);
    expect(grid.bpm).toBe(140);
    expect(grid.beatSec).toBeCloseTo(60 / 140, 9);
    expect(grid.beatsPerBar).toBe(4);
    expect(grid.totalBeats).toBe(8);
    expect(grid.durationSec).toBeCloseTo(8 * (60 / 140), 9);
  });

  it('1 拍以上の休符でフレーズを切る', () => {
    const midi = makeMidi(120, [
      { beat: 0, lengthBeats: 1, pitch: 60 },
      { beat: 1, lengthBeats: 1, pitch: 62 },
      { beat: 2, lengthBeats: 0.5, pitch: 64 }, // 2.5 で終わる
      { beat: 4, lengthBeats: 1, pitch: 65 }, // 休符 1.5 拍 → 切れ目
      { beat: 5, lengthBeats: 1, pitch: 67 },
    ]);
    const grid = buildGrid(midi);
    expect(grid.phrases).toHaveLength(2);
    expect(grid.phrases[0]).toMatchObject({ index: 0, startBeat: 0, endBeat: 4, noteBeats: [0, 1, 2] });
    expect(grid.phrases[1]).toMatchObject({ index: 1, startBeat: 4, endBeat: 8, noteBeats: [4, 5] });
    expect(phraseAt(grid, 4.5)?.index).toBe(1);
  });

  it('休符が無ければ 2 小節ごとに切る', () => {
    const notes = [];
    for (let b = 0; b < 16; b++) notes.push({ beat: b, lengthBeats: 1, pitch: 60 + (b % 5) });
    const grid = buildGrid(makeMidi(120, notes));
    expect(grid.phrases.map((p) => p.startBeat)).toEqual([0, 8]);
    expect(grid.phrases[1].endBeat).toBe(16);
  });

  it('melody トラックが無ければノートのある最初のトラックを使う', () => {
    const midi = new Midi();
    midi.header.setTempo(100);
    const empty = midi.addTrack();
    empty.name = 'drums';
    const t = midi.addTrack();
    t.name = 'lead';
    t.addNote({ midi: 60, ticks: 0, durationTicks: midi.header.ppq });
    expect(buildGrid(midi).melodyOnsets).toEqual([0]);
  });
});
