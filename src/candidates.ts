// 曲候補を聴くページ。人間が 1 つ選び、番号と理由を一言返す (docs/plan/v0-phase2-core.md T1)。
// v7: 2 曲目の候補 (4〜6) を上に、1 曲目の候補 (1〜3) を下に残す。4〜6 は像・大技・起伏の形とセット (docs/plan/v7-phase2-song.md T1)
import { AudioEngine, type Song } from './audio/engine';
import { loadSong as loadMidiSong } from './song';
import candidate1 from '../assets/midi/candidate-1.mid?url';
import candidate2 from '../assets/midi/candidate-2.mid?url';
import candidate3 from '../assets/midi/candidate-3.mid?url';
import candidate4 from '../assets/midi/candidate-4.mid?url';
import candidate5 from '../assets/midi/candidate-5.mid?url';
import candidate6 from '../assets/midi/candidate-6.mid?url';

interface CandidateInfo {
  id: string;
  url: string;
  intent: string;
  // v7 の候補だけ: 像・大技・派生する通常攻撃・起伏の形 (選ぶと全部一緒に決まる)
  detail?: { bpm: number; seconds: number; shape: string; figure: string; special: string; normals: string };
}

const V7_SECTION = {
  title: '2 曲目の候補 (v7)',
  note: 'どれも 24 小節 = 3 段 × 8 小節 (段の切り替わりは小節 9 と 17 の頭)。melody (矩形波) が敵の攻撃の元、lead-high (高い正弦波) は最初から鳴る背景の線で攻撃には結びつけない。像・大技・起伏の形は曲とセットで、1 つ選ぶと全部決まる。',
  candidates: [
    {
      id: 'candidate-4',
      url: candidate4,
      intent: 'ドラムンベース風。段 1 はハーフタイム、段 2 でブレイクビーツ、段 3 で 16 分のハットと走るベース',
      detail: {
        bpm: 160,
        seconds: 36,
        shape: '右肩上がり (段 1 < 段 2 < 段 3)',
        figure: '剣を持つ人型の決闘者。段が進むと鎧の板が増え、剣が長く光る (あとで他のボスの部品を継ぎ足せる骨組み)',
        special: '三連突きからの大上段。短い音 2〜4 つで突き (連撃。音ごとに自機を狙い直す) → 長い音で振り下ろし。各段の最後の小節にあり、段が進むほど突きが増える',
        normals: '単発の突き (踏み込みあり)、横薙ぎ、踏み込んで斜めに斬る突進',
      },
    },
    {
      id: 'candidate-5',
      url: candidate5,
      intent: 'インダストリアル寄りのテクノ。4 つ打ちが段 2 で最も重く、段 3 は静',
      detail: {
        bpm: 150,
        seconds: 38,
        shape: '山型 (段 2 が最も激しく、段 3 は 6 小節の静のあと最後の 2 小節で全部)',
        figure: '浮かぶ多面体の結晶。段 2 で分裂して衛星 4 つを従え、段 3 で衛星を収めて静まり、最後に全部を一度に放つ',
        special: '衛星の収束格子。短い音で衛星が 1 つずつ点灯 (予告。2〜4 つ) → 長い音で格子のレーザーと中心の破裂',
        normals: '衛星 1 つからの弾、回転する衛星の薙ぎ、本体の圧し (小さな叩きつけ)',
      },
    },
    {
      id: 'candidate-6',
      url: candidate6,
      intent: '跳ねるビート (ハットとベースに 3 連のスウィング)。段 3 が最高出力',
      detail: {
        bpm: 156,
        seconds: 37,
        shape: '自壊 (段 3 が最高出力。相殺し続けると敵の姿が崩れていく。曲は最後の 2 小節で薄くなる)',
        figure: '炎をまとう鳥。段ごとに炎が大きく翼が広がる。段 3 で相殺されるたびに炎が消え、羽が落ちる',
        special: '急降下と火の輪。上がる 3 音 (舞い上がり = 予告) → 長い音で急降下 (追尾する突進) と着地点の火の輪',
        normals: '羽根の弾 (3 連。音ごとに狙い直す)、翼の薙ぎ、低空の突進',
      },
    },
  ] as CandidateInfo[],
};

const V0_SECTION = {
  title: '1 曲目の候補 (v0。2 は選ばれて 1 曲目になった)',
  note: '聴き比べ用に残している。2 曲目の選択肢ではない。',
  candidates: [
    { id: 'candidate-1', url: candidate1, intent: 'ジャージークラブ風 (144 BPM)。キックが 3-3-2 で跳ねる。メロディは 1 小節に 2〜4 音で、2 小節ごとに息継ぎ' },
    { id: 'candidate-2', url: candidate2, intent: 'トラップ風ハーフタイム (140 BPM)。スネアは 3 拍目だけ、808 風のベースが長く鳴る。メロディは少なく間が多い' },
    { id: 'candidate-3', url: candidate3, intent: 'ミニマルテクノ風 (132 BPM)。4 つ打ちと裏打ちハット、ベースは同じ 2 音の反復。メロディは 2 小節で 1 回だけ動く' },
  ] as CandidateInfo[],
};

let engine: AudioEngine | null = null;
let playing: string | null = null;
let stopTimer: number | null = null;
const songCache = new Map<string, Song>();

async function loadSong(c: CandidateInfo): Promise<Song> {
  const cached = songCache.get(c.id);
  if (cached) return cached;
  const { song } = await loadMidiSong(c.url);
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
  note.textContent = '音は素のオシレータです。配置とリズムだけ聴いてください。1 つ選んで、番号と理由を一言 Claude に伝えてください (像や大技が気に入らなければそれも)。';
  note.style.opacity = '0.8';
  app.appendChild(note);

  for (const section of [V7_SECTION, V0_SECTION]) {
    const h = document.createElement('h2');
    h.textContent = section.title;
    h.style.cssText = 'font-size:17px;margin:24px 0 4px;';
    const p = document.createElement('p');
    p.textContent = section.note;
    p.style.cssText = 'margin:0 0 8px;font-size:13px;opacity:0.75;';
    app.append(h, p);
    for (const c of section.candidates) app.appendChild(card(c, app));
  }
}

function card(c: CandidateInfo, app: HTMLElement): HTMLElement {
  const el = document.createElement('section');
  el.style.cssText = 'border:1px solid #444;border-radius:8px;padding:12px;margin:12px 0;';
  const h = document.createElement('h3');
  h.textContent = c.detail ? `${c.id} (${c.detail.bpm} BPM、約 ${c.detail.seconds} 秒)` : c.id;
  h.style.cssText = 'font-size:16px;margin:0 0 6px;';
  const p = document.createElement('p');
  p.textContent = c.intent;
  p.style.cssText = 'margin:0 0 10px;font-size:14px;';
  el.append(h, p);
  if (c.detail) {
    const dl = document.createElement('dl');
    dl.style.cssText = 'margin:0 0 10px;font-size:13px;display:grid;grid-template-columns:max-content 1fr;gap:4px 10px;';
    for (const [k, v] of [
      ['起伏の形', c.detail.shape],
      ['像', c.detail.figure],
      ['大技', c.detail.special],
      ['通常攻撃 (大技から派生)', c.detail.normals],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      dt.style.cssText = 'opacity:0.7;';
      const dd = document.createElement('dd');
      dd.textContent = v;
      dd.style.margin = '0';
      dl.append(dt, dd);
    }
    el.appendChild(dl);
  }
  const btn = document.createElement('button');
  btn.textContent = playing === c.id ? '停止' : '再生';
  btn.style.cssText = 'font-size:18px;padding:12px 24px;border-radius:8px;border:none;background:#3a7;color:#fff;';
  btn.addEventListener('click', () => void toggle(c, app));
  el.appendChild(btn);
  return el;
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
