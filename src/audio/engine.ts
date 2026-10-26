// Web Audio を直接使う再生エンジン。AudioContext.currentTime をゲーム全体の時計の正にする。
// 曲は start() で全ノートを絶対時刻に予約する (20 秒・数百音なので lookahead 分割は要らない)。
// 音色は拍とタイミングが分かる最低限。melody = 矩形波、bass = 三角波、drums = ノイズと短いサイン。

export type VoiceName = 'melody' | 'bass' | 'drums';
export type SfxKind = 'on' | 'off' | 'miss';

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

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);
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
  }

  scheduleSfx(kind: SfxKind, atSec: number): void {
    switch (kind) {
      case 'on':
        this.tone('square', 880, atSec, 0.06, 0.25);
        break;
      case 'off':
        this.tone('triangle', 440, atSec, 0.08, 0.25);
        break;
      case 'miss':
        this.tone('sine', 110, atSec, 0.12, 0.3);
        break;
    }
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
    }
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
  return 'melody';
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
