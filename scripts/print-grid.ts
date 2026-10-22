// 曲の拍グリッドとフレーズ一覧を表示する。振り付けを書くときの資料。
// 実行: npx tsx scripts/print-grid.ts assets/midi/candidate-2.mid
import midiPkg from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { buildGrid } from '../src/core/grid';

const { Midi } = midiPkg as typeof import('@tonejs/midi');

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/print-grid.ts <file.mid>');
  process.exit(1);
}
const midi = new Midi(readFileSync(file));
const grid = buildGrid(midi);

console.log(`bpm=${grid.bpm} beatSec=${grid.beatSec.toFixed(4)} beatsPerBar=${grid.beatsPerBar} totalBeats=${grid.totalBeats} durationSec=${grid.durationSec.toFixed(2)}`);
console.log('tracks:', midi.tracks.map((t) => `${t.name}(${t.notes.length})`).join(', '));
console.log('');
console.log('phrase | startBeat-endBeat (bar) | noteBeats (pitch)');
for (const p of grid.phrases) {
  const bar = Math.floor(p.startBeat / grid.beatsPerBar) + 1;
  const notes = p.noteBeats.map((b, i) => `${b}(${p.notePitches[i]})`).join(' ');
  console.log(`${String(p.index).padStart(2)} | ${p.startBeat}-${p.endBeat} (bar ${bar}) | ${notes}`);
}

const bass = midi.tracks.find((t) => t.name === 'bass');
if (bass) {
  const ppq = midi.header.ppq;
  console.log('');
  console.log('bass onsets (beat:pitch):', bass.notes.map((n) => `${n.ticks / ppq}:${n.midi}`).join(' '));
}
