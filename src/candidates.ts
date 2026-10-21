// 曲候補を聴くページ。人間が 1 つ選び、番号と理由を一言返す (docs/plan/v0-phase2-core.md T1)
import { Midi } from '@tonejs/midi';
import { AudioEngine, type Song } from './audio/engine';
import candidate1 from '../assets/midi/candidate-1.mid?url';
import candidate2 from '../assets/midi/candidate-2.mid?url';
import candidate3 from '../assets/midi/candidate-3.mid?url';

interface CandidateInfo {
  id: string;
  url: string;
  intent: string;
}

const candidates: CandidateInfo[] = [
  { id: 'candidate-1', url: candidate1, intent: 'ジャージークラブ風 (144 BPM)。キックが 3-3-2 で跳ねる。メロディは 1 小節に 2〜4 音で、2 小節ごとに息継ぎ' },
  { id: 'candidate-2', url: candidate2, intent: 'トラップ風ハーフタイム (140 BPM)。スネアは 3 拍目だけ、808 風のベースが長く鳴る。メロディは少なく間が多い' },
  { id: 'candidate-3', url: candidate3, intent: 'ミニマルテクノ風 (132 BPM)。4 つ打ちと裏打ちハット、ベースは同じ 2 音の反復。メロディは 2 小節で 1 回だけ動く' },
];

let engine: AudioEngine | null = null;
let playing: string | null = null;
let stopTimer: number | null = null;
const songCache = new Map<string, Song>();

async function loadSong(c: CandidateInfo): Promise<Song> {
  const cached = songCache.get(c.id);
  if (cached) return cached;
  const buf = await (await fetch(c.url)).arrayBuffer();
  const midi = new Midi(buf);
  const song: Song = {
    duration: midi.duration,
    tracks: midi.tracks.map((t) => ({ name: t.name, notes: t.notes.map((n) => ({ time: n.time, duration: n.duration, midi: n.midi })) })),
  };
  songCache.set(c.id, song);
  return song;
}

function render(app: HTMLElement): void {
  app.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = '曲候補';
  title.style.fontSize = '20px';
  app.appendChild(title);
  const note = document.createElement('p');
  note.textContent = '音は素のオシレータです。配置とリズムだけ聴いてください。1 つ選んで、番号と理由を一言 Claude に伝えてください。';
  note.style.opacity = '0.8';
  app.appendChild(note);

  for (const c of candidates) {
    const card = document.createElement('section');
    card.style.cssText = 'border:1px solid #444;border-radius:8px;padding:12px;margin:12px 0;';
    const h = document.createElement('h2');
    h.textContent = c.id;
    h.style.cssText = 'font-size:16px;margin:0 0 6px;';
    const p = document.createElement('p');
    p.textContent = c.intent;
    p.style.cssText = 'margin:0 0 10px;font-size:14px;';
    const btn = document.createElement('button');
    btn.textContent = playing === c.id ? '停止' : '再生';
    btn.style.cssText = 'font-size:18px;padding:12px 24px;border-radius:8px;border:none;background:#3a7;color:#fff;';
    btn.addEventListener('click', () => void toggle(c, app));
    card.append(h, p, btn);
    app.appendChild(card);
  }
}

async function toggle(c: CandidateInfo, app: HTMLElement): Promise<void> {
  engine ??= new AudioEngine();
  await engine.resume();
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (playing === c.id) {
    engine.stop();
    playing = null;
    render(app);
    return;
  }
  const song = await loadSong(c);
  engine.start(song);
  playing = c.id;
  render(app);
  stopTimer = window.setTimeout(() => {
    playing = null;
    render(app);
  }, (song.duration + 0.5) * 1000);
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) render(app);

export {};
