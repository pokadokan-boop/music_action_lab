// 振り付けの各攻撃について、曲の音のなり始め・音のアタックが立ち上がりきる時刻・動き出し・当たりの発生を
// ms で並べ、ずれを数で見る。耳で聴かずに「データ上の同期」を確かめるためのもの。
// 実行: npx tsx scripts/sync-report.ts assets/choreo/a2.json
import midiPkg from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config';
import { attackMotion, impactBeat, type Choreo } from '../src/core/choreo';
import { buildGrid } from '../src/core/grid';

const { Midi } = midiPkg as typeof import('@tonejs/midi');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// src/audio/engine.ts の tone() のアタック時間 (0 → 音量 の直線ランプ)。ここが変わったらこの値も変える
const ENGINE_ATTACK_SEC = 0.005;

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/sync-report.ts <choreo.json>');
  process.exit(2);
}
const choreo = JSON.parse(readFileSync(resolve(file), 'utf8')) as Choreo;
const midi = new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`)));
const grid = buildGrid(midi);
const ms = (beat: number) => beat * grid.beatSec * 1000;

console.log(`${choreo.id} / ${choreo.song} / ${grid.bpm.toFixed(1)} BPM / 1 拍 ${(grid.beatSec * 1000).toFixed(1)} ms / 速度 ${config.shotSpeed}`);
console.log('');
console.log('attack | type | motion | 音のアンカー (hitBeat) | 最寄りの音 | 動き出し (直前のキーフレーム) | 当たり発生 (impact) | アタック立ち上がり後');
console.log('       |      |        | ms                  | ms  (差)   | ms (音との差)                | ms (音との差)       | ms');
choreo.attacks.forEach((atk, i) => {
  const phrase = grid.phrases[atk.phrase];
  const anchor = ms(atk.hitBeat);
  const notes = phrase ? phrase.noteBeats.map(ms) : [];
  const nearest = notes.length ? notes.reduce((a, b) => (Math.abs(b - anchor) < Math.abs(a - anchor) ? b : a)) : NaN;
  const impact = ms(impactBeat(atk));
  // 動き出し: impact 以前で最後に位置が変わる区間の始点
  const pts = atk.path;
  let moveStart = NaN;
  for (let k = pts.length - 1; k > 0; k--) {
    if (pts[k].beat > impactBeat(atk) + 1e-9) continue;
    if (pts[k].x !== pts[k - 1].x || pts[k].y !== pts[k - 1].y) {
      moveStart = ms(pts[k - 1].beat);
      break;
    }
  }
  const afterAttack = impact - (nearest + ENGINE_ATTACK_SEC * 1000);
  const f = (v: number) => (Number.isNaN(v) ? '-' : v.toFixed(0).padStart(5));
  const d = (v: number) => (Number.isNaN(v) ? '' : ` (${v >= 0 ? '+' : ''}${v.toFixed(0)})`);
  console.log(
    `${String(i).padStart(6)} | ${atk.type.padEnd(5)} | ${attackMotion(choreo, atk).padEnd(7)} | ${f(anchor)}               | ${f(nearest)}${d(nearest - anchor)} | ${f(moveStart)}${d(moveStart - nearest).padEnd(8)} | ${f(impact)}${d(impact - nearest).padEnd(8)} | ${f(afterAttack)}`,
  );
});
console.log('');
console.log('読み方: 「動き出し (音との差)」が 0 なら音のなり始めと同時に動く。負なら音より前に動き出している。');
console.log('      「当たり発生 (音との差)」が正で小さければ、音の立ち上がりの少し後に当たる。');
console.log('      これはデータ上の値で、ブラウザの出力遅延 (結果画面の補正値) と知覚上のずれは含まない。');
