// 2 曲目の候補 (v7) の形を確かめる: 段 (8 小節) ごとの melody の音数、フレーズの長さ、音の始まりが 8 分の格子に乗っているか、lead-high の最初の音。
// 実行: npx tsx scripts/print-stages.ts [assets/midi/candidate-4.mid ...] (省略時は 4〜6)
import midiPkg from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrid } from '../src/core/grid';

const { Midi } = midiPkg as typeof import('@tonejs/midi');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.length > 2 ? process.argv.slice(2) : [4, 5, 6].map((i) => `assets/midi/candidate-${i}.mid`);

for (const file of files) {
  const midi = new Midi(readFileSync(resolve(root, file)));
  const grid = buildGrid(midi);
  const stageBeats = 8 * grid.beatsPerBar;
  const counts = [0, 0, 0];
  for (const b of grid.melodyOnsets) counts[Math.min(2, Math.floor(b / stageBeats))]++;
  const offGrid = grid.melodyOnsets.filter((b) => Math.abs(b * 2 - Math.round(b * 2)) > 1e-6);
  const longest = Math.max(...grid.phrases.map((p) => (p.noteBeats.at(-1) ?? p.startBeat) - p.startBeat));
  const lead = midi.tracks.find((t) => t.name === 'lead-high');
  const leadFirst = lead ? Math.min(...lead.notes.map((n) => n.ticks / midi.header.ppq)) : null;
  console.log(`${file}: ${grid.bpm} BPM, ${grid.totalBeats / grid.beatsPerBar} bars, ${grid.durationSec.toFixed(2)} s`);
  console.log(`  melody の音数 段 1 / 2 / 3 = ${counts.join(' / ')} (計 ${grid.melodyOnsets.length})、フレーズ ${grid.phrases.length} 個、最長 ${longest.toFixed(2)} 拍 (始まりから最後の音まで)`);
  console.log(`  8 分の格子の外にある melody の音: ${offGrid.length === 0 ? '無し' : offGrid.join(', ')}`);
  console.log(`  lead-high: ${lead ? `${lead.notes.length} 音、最初の音は拍 ${leadFirst}` : '無し'}`);
  console.log(`  トラック: ${midi.tracks.map((t) => `${t.name} (${t.notes.length})`).join(', ')}`);
  console.log(`  フレーズ: ${grid.phrases.map((p) => `[${p.startBeat}〜${p.endBeat}: ${p.noteBeats.length} 音]`).join(' ')}`);
}
