// MIDI ファイルの読み込みと、再生用 Song・拍グリッドへの変換 (ブラウザ側)
import { Midi } from '@tonejs/midi';
import type { Song } from './audio/engine';
import { buildGrid, type Grid } from './core/grid';

export interface LoadedSong {
  midi: Midi;
  song: Song;
  grid: Grid;
}

export async function loadSong(url: string): Promise<LoadedSong> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MIDI を取得できない: ${url} (${res.status})`);
  const midi = new Midi(await res.arrayBuffer());
  return { midi, song: toSong(midi), grid: buildGrid(midi) };
}

export function toSong(midi: Midi): Song {
  return {
    duration: midi.duration,
    tracks: midi.tracks.map((t) => ({
      name: t.name,
      notes: t.notes.map((n) => ({ time: n.time, duration: n.duration, midi: n.midi })),
    })),
  };
}
