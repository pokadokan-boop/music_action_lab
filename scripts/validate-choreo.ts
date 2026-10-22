// 振り付け JSON を合否条件に照らして検査する。曲は choreo.song から assets/midi/<song>.mid を読む。
// 実行: npx tsx scripts/validate-choreo.ts assets/choreo/a.json
// 終了コード: 違反なし 0 / 違反あり 1 / 読み込み失敗 2
import midiPkg from '@tonejs/midi';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config';
import { validateChoreo, type Acceptance, type Choreo } from '../src/core/choreo';
import { buildGrid } from '../src/core/grid';

const { Midi } = midiPkg as typeof import('@tonejs/midi');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx scripts/validate-choreo.ts <choreo.json>');
  process.exit(2);
}

let choreo: Choreo;
try {
  choreo = JSON.parse(readFileSync(resolve(file), 'utf8')) as Choreo;
} catch (e) {
  console.error(`読めない: ${file}: ${(e as Error).message}`);
  process.exit(2);
}
const acceptance = JSON.parse(readFileSync(resolve(root, 'acceptance.json'), 'utf8')) as Acceptance;
const midiPath = resolve(root, 'assets', 'midi', `${choreo.song}.mid`);
const grid = buildGrid(new Midi(readFileSync(midiPath)));

const violations = validateChoreo(choreo, grid, acceptance, config);
console.log(`${choreo.id}: song=${choreo.song} attacks=${choreo.attacks.length} phrases=${grid.phrases.length}`);
if (violations.length === 0) {
  console.log('OK: 違反なし');
  process.exit(0);
}
for (const v of violations) {
  const atk = choreo.attacks[v.attackIndex];
  console.log(`NG attack[${v.attackIndex}] (phrase ${atk?.phrase}, ${atk?.type}, hitBeat ${atk?.hitBeat}) ${v.rule}: ${v.message}`);
}
process.exit(1);
