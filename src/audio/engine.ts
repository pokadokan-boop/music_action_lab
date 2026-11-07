// Web Audio を直接使う再生エンジン。AudioContext.currentTime をゲーム全体の時計の正にする。
// 曲は start() で全ノートを絶対時刻に予約する (20 秒・数百音なので lookahead 分割は要らない)。
// 音色は拍とタイミングが分かる最低限。melody = 矩形波、bass = 三角波、drums = ノイズと短いサイン。
// プレイヤーの音は音の仕様 (assets/sound/v6.json、src/audio/soundspec.ts) を synth.ts で鳴らす (v6 T7)。
// v5 までの撥弦 (pluck.ts) は仕様の 1 層 (type pluck) として残る。曲の 3 声と別の系統 (docs/concept.md「曲と音の役割」)

import defaultBankJson from '../../assets/sound/v6.json';
import { midiToHz, type PluckKind, type PluckSpec } from './pluck';
import { normalizeBank, type SoundBank, type SoundName } from './soundspec';
import { playSound, startSustained, type Sustained } from './synth';

export { midiToHz };

// 既定の音 (Claude の初期値。本人の言葉から。docs/plan/v6-phase2-sound.md)
export const DEFAULT_SOUND_BANK: SoundBank = normalizeBank(defaultBankJson);

// lead (v7): 背景の高音の線 (トラック名 lead-high)。正弦波に軽いビブラート、小さめの音量。主旋律より上で薄く鳴る
export type VoiceName = 'melody' | 'bass' | 'drums' | 'lead';
// cancel は相殺 (v2 T5)。音高は呼ぶ側がフレーズの音から決めて midi で渡す。step / riposte / release は v5、double (両手放ち) は v6
export type SfxKind = PluckKind | 'double';
const CANCEL_DEFAULT_MIDI = 72;

// 効果音の種類 → 音の名前 (v6)。表 / 裏 / 外は通常攻撃の 3 つ
const SFX_SOUND: Record<SfxKind, SoundName> = {
  on: 'normalOn',
  off: 'normalOff',
  miss: 'normalMiss',
  cancel: 'cancel',
  step: 'step',
  riposte: 'riposte',
  release: 'release',
  double: 'double',
};

export interface SongNote {
  time: number;
  duration: number;
  midi: number;
}

export interface SongTrack {
  name: string;
  notes: SongNote[];
}

export interface Song {
  tracks: SongTrack[];
  duration: number;
}

const MASTER_GAIN = 0.5;
const DRUM_KICK = 36;
const DRUM_SNARE = 38;
const DRUM_HAT = 42;

export class AudioEngine {
  // BaseAudioContext にしてあるのは、測定 (src/measure.ts) が OfflineAudioContext で同じ合成器を動かすため
  readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private active: AudioScheduledSourceNode[] = [];
  // 鳴っている溜めの持続音 (1 つだけ。手で区別しない)
  private charge: Sustained | null = null;
  // プレイヤーの音の仕様。既定は assets/sound/v6.json、本人が音作りのページで作ったものに差し替えられる (setBank)
  private bank: SoundBank;

  constructor(ctx?: BaseAudioContext, bank: SoundBank = DEFAULT_SOUND_BANK) {
    this.ctx = ctx ?? new AudioContext();
    this.bank = bank;
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);
  }

  setBank(bank: SoundBank): void {
    this.bank = bank;
  }

  getBank(): SoundBank {
    return this.bank;
  }

  now(): number {
    return this.ctx.currentTime;
  }

  // 予約した時刻から実際に音が出るまでの遅れ (秒)。絵をこの分だけ遅らせると、聞こえる音に合う。
  // outputLatency は Chrome 等が持つ。無ければ baseLatency、それも無ければ 0。
  // OfflineAudioContext はスピーカーに出さないので 0
  outputLatency(): number {
    if (!this.isRealtime()) return 0;
    const ctx = this.ctx as AudioContext & { outputLatency?: number };
    const v = ctx.outputLatency ?? ctx.baseLatency ?? 0;
    return Number.isFinite(v) && v >= 0 && v < 1 ? v : 0;
  }

  // OfflineAudioContext では何もしない (描画は startRendering() で進む)
  async resume(): Promise<void> {
    if (this.isRealtime() && this.ctx.state !== 'running') await this.ctx.resume();
  }

  private isRealtime(): this is { ctx: AudioContext } {
    return typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext;
  }

  // 曲を atSec (絶対時刻) から再生する。戻り値は開始時刻
  start(song: Song, atSec: number = this.ctx.currentTime + 0.1): number {
    this.stop();
    for (const track of song.tracks) {
      const voice = voiceOf(track.name);
      for (const n of track.notes) this.scheduleNote(voice, n, atSec + n.time);
    }
    return atSec;
  }

  stop(): void {
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        // 既に止まっている
      }
    }
    this.active = [];
    this.stopCharge(this.ctx.currentTime);
  }

  // 溜めの持続音を atSec から鳴らす。音高は fromMidi から toMidi へ riseSec かけて上がり、以後保つ。鳴っていれば置き換える。
  // 音色は bank.charge (層の音量は gainAtStart → gain へ同じ時間で。v6 T7)
  // progress (0〜1) はその分だけ進んだ状態から始める (音作りのページで途中の音を聴くため。ゲームでは 0)
  startCharge(atSec: number, fromMidi: number, toMidi: number, riseSec: number, progress = 0): void {
    this.stopCharge(atSec);
    this.charge = startSustained(this.ctx, this.master, this.bank.sounds.charge, midiToHz(fromMidi), midiToHz(toMidi), riseSec, atSec, progress);
    for (const s of this.charge.sources) this.track(s);
  }

  // 溜めの持続音を atSec で止める (放ちか解除)。鳴っていなければ何もしない
  stopCharge(atSec: number): void {
    if (!this.charge) return;
    const c = this.charge;
    this.charge = null;
    c.stop(atSec);
  }

  charging(): boolean {
    return this.charge !== null;
  }

  // midi は cancel のときだけ使う (相殺した拍に最も近いメロディ音の 1 オクターブ上。docs/plan/v2-phase2.md「既定値の決め」)。
  // 他は呼ぶ側が音の口 (override.hz) で基音を渡す (v4 T6、v5 T4)。音色は bank の仕様 (v6 T7)。曲の 3 声の合成器 (tone / drum / noise) は使わない
  scheduleSfx(kind: SfxKind, atSec: number, midi: number = CANCEL_DEFAULT_MIDI, override: Partial<PluckSpec> = {}): void {
    const hz = override.hz ?? midiToHz(midi);
    const { sources } = playSound(this.ctx, this.master, this.bank.sounds[SFX_SOUND[kind]], hz, atSec);
    for (const s of sources) this.track(s);
  }

  private scheduleNote(voice: VoiceName, n: SongNote, at: number): void {
    switch (voice) {
      case 'melody':
        this.tone('square', midiToHz(n.midi), at, Math.max(0.05, n.duration), 0.12);
        break;
      case 'bass':
        this.tone('triangle', midiToHz(n.midi), at, Math.max(0.05, n.duration), 0.25);
        break;
      case 'drums':
        this.drum(n.midi, at);
        break;
      case 'lead':
        this.lead(midiToHz(n.midi), at, Math.max(0.1, n.duration));
        break;
    }
  }

  // 背景の高音の線 (v7): 正弦波、立ち上がり 30 ms、5.5 Hz のビブラート (±6 セント)、余韻 80 ms
  private lead(hz: number, at: number, dur: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    depth.gain.value = hz * 0.0035;
    lfo.connect(depth).connect(osc.frequency);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.09, at + 0.03);
    g.gain.setValueAtTime(0.09, at + Math.max(0.03, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + dur + 0.01);
    lfo.stop(at + dur + 0.01);
    this.track(osc);
    this.track(lfo);
  }

  private tone(type: OscillatorType, hz: number, at: number, dur: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.005);
    g.gain.setValueAtTime(gain, at + Math.max(0.005, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.01);
    this.track(osc);
  }

  private drum(midi: number, at: number): void {
    if (midi === DRUM_KICK) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(40, at + 0.15);
      g.gain.setValueAtTime(0.6, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(g).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.25);
      this.track(osc);
      return;
    }
    if (midi === DRUM_SNARE) {
      this.noise(at, 0.15, 'bandpass', 1800, 0.35);
      this.tone('sine', 180, at, 0.08, 0.3);
      return;
    }
    // ハット (42) とその他の打音
    this.noise(at, midi === DRUM_HAT ? 0.05 : 0.1, 'highpass', 6000, 0.12);
  }

  private noise(at: number, dur: number, filterType: BiquadFilterType, hz: number, gain: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.getNoise();
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.01);
    this.track(src);
  }

  private getNoise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(this.ctx.sampleRate * 0.3);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // 決め打ちの線形合同法。Math.random を避けて毎回同じノイズにする
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private track(node: AudioScheduledSourceNode): void {
    this.active.push(node);
    node.onended = () => {
      const i = this.active.indexOf(node);
      if (i >= 0) this.active.splice(i, 1);
    };
  }
}

function voiceOf(trackName: string): VoiceName {
  if (trackName === 'bass') return 'bass';
  if (trackName === 'drums') return 'drums';
  if (trackName.startsWith('lead')) return 'lead';
  return 'melody';
}
