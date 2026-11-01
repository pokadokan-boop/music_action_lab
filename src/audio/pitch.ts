// プレイヤーの音の音高の規則 (v5 T4。docs/plan/v5-phase2-player.md「音」)。純粋関数。
// 3 案をタイトルで切り替えて聴き比べる。音楽として良いかは Claude が判定しない (本人が選ぶ)。
// 案 1 chord: F マイナーの主和音 (F / A♭ / C) だけ。どの拍で押しても曲と喧嘩しない
// 案 2 motif: その拍に最も近いメロディ音 m をなぞる
// 案 3 fixed: v3 の値 (表 880 / 裏 440 / 外 110 Hz)。比較の基準
import { phraseAt, type Grid } from '../core/grid';
import type { BeatClass } from '../core/log';

export type PitchRule = 'chord' | 'motif' | 'fixed';
export const PITCH_RULES: PitchRule[] = ['chord', 'motif', 'fixed'];
export const PITCH_RULE_LABEL: Record<PitchRule, string> = { chord: '案 1 コードの音', motif: '案 2 メロディをなぞる', fixed: '案 3 固定 (v3)' };
export const DEFAULT_PITCH_RULE: PitchRule = 'chord';

// 音を鳴らす行動。attack = 通常攻撃 (cls で表 / 裏 / 外)、step = ステップ (cls on / miss)、riposte = 返し、release = 放ち
export type SoundAction = 'attack' | 'step' | 'riposte' | 'release';

// MIDI 番号。F2 = 41、F3 = 53、F4 = 65、A♭4 = 68、C5 = 72、F5 = 77、A♭5 = 80、A2 = 45、A3 = 57、A4 = 69、A5 = 81、C6 = 84
const FALLBACK_MELODY_MIDI = 68;

// その拍のフレーズの音のうち、時刻が最も近いものの MIDI 番号。フレーズの外なら null。
// noteBeats は同時刻を 1 つにまとめてあるので、和音があると notePitches と添字がずれる。曲は単音なので許容 (v2 からの割り切り)
export function nearestMelodyMidi(grid: Grid, beat: number): number | null {
  const phrase = phraseAt(grid, beat);
  if (!phrase || phrase.noteBeats.length === 0) return null;
  let nearest = 0;
  phrase.noteBeats.forEach((nb, i) => {
    if (Math.abs(nb - beat) < Math.abs(phrase.noteBeats[nearest] - beat)) nearest = i;
  });
  const pitch = phrase.notePitches[Math.min(nearest, phrase.notePitches.length - 1)];
  return pitch ?? null;
}

// 相殺の音: 最も近いメロディ音の 1 オクターブ上 (v2 からの規則。案に関わらず同じ)。フレーズの外なら C5
export function cancelMidi(grid: Grid, beat: number): number {
  const m = nearestMelodyMidi(grid, beat);
  return m === null ? 72 : m + 12;
}

export function pitchFor(action: SoundAction, cls: BeatClass, beat: number, grid: Grid, rule: PitchRule): number {
  switch (rule) {
    case 'fixed':
      return fixedPitch(action, cls);
    case 'chord':
      return chordPitch(action, cls);
    case 'motif':
      return motifPitch(action, cls, nearestMelodyMidi(grid, beat) ?? FALLBACK_MELODY_MIDI);
  }
}

// 溜めの持続音の音高の範囲 (from → to。1 オクターブ上がる)
export function chargeRange(beat: number, grid: Grid, rule: PitchRule): { from: number; to: number } {
  switch (rule) {
    case 'fixed':
      return { from: 57, to: 69 };
    case 'chord':
      return { from: 53, to: 65 };
    case 'motif': {
      const m = nearestMelodyMidi(grid, beat) ?? FALLBACK_MELODY_MIDI;
      return { from: m - 12, to: m };
    }
  }
}

function fixedPitch(action: SoundAction, cls: BeatClass): number {
  switch (action) {
    case 'attack':
      return cls === 'on' ? 81 : cls === 'off' ? 69 : 45;
    case 'step':
      return cls === 'on' ? 69 : 57;
    case 'riposte':
      return 84;
    case 'release':
      return 57;
  }
}

function chordPitch(action: SoundAction, cls: BeatClass): number {
  switch (action) {
    case 'attack':
      return cls === 'on' ? 77 : cls === 'off' ? 72 : 41;
    case 'step':
      return cls === 'on' ? 72 : 68;
    case 'riposte':
      return 80;
    case 'release':
      return 53;
  }
}

function motifPitch(action: SoundAction, cls: BeatClass, m: number): number {
  switch (action) {
    case 'attack':
      return cls === 'on' ? m + 12 : cls === 'off' ? m : m - 24;
    case 'step':
      return cls === 'on' ? m : m - 12;
    case 'riposte':
      return m + 15;
    case 'release':
      return m - 12;
  }
}
