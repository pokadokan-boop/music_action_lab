// assets/choreo/*.json が、その曲の拍グリッドで合否条件を満たすこと
import { Midi } from '@tonejs/midi';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import acceptance from '../../acceptance.json';
import { config } from '../config';
import { validateChoreo, type Choreo } from './choreo';
import { buildGrid } from './grid';

const root = resolve(__dirname, '..', '..');
const choreoDir = resolve(root, 'assets', 'choreo');
const files = existsSync(choreoDir) ? readdirSync(choreoDir).filter((f) => f.endsWith('.json')) : [];

describe('振り付けデータ', () => {
  it('v4 の 1 本だけ (A と A\' は 2026-10-27、v2 は 2026-10-29、v3 は 2026-10-30 に外した)', () => {
    expect(files.sort()).toEqual(['v4.json']);
  });

  it.each(files)('%s は合否条件を満たす', (file) => {
    const choreo = JSON.parse(readFileSync(resolve(choreoDir, file), 'utf8')) as Choreo;
    const midi = new Midi(readFileSync(resolve(root, 'assets', 'midi', `${choreo.song}.mid`)));
    const grid = buildGrid(midi);
    expect(validateChoreo(choreo, grid, acceptance, config)).toEqual([]);
    expect(choreo.attacks.length).toBeGreaterThan(0);
  });
});
