// タイトル画面。曲名、振り付けの狙い、操作説明、調整パネル (v3)。音の有効化はユーザー操作 (クリックかキー) が要る。
// 振り付けは 1 版 = 1 本 (v3) なので選択は出さない。1 軸の比較で一時的に 2 本目を足したときだけ選択カードが出る (docs/plan/v2-phase1.md)
import { defaultTuning, type Tuning } from '../config';
import { TUNING_KEYS, TUNING_RANGES, clampTuning, formatTuningValue } from './tuning';

export interface TitleChoice {
  id: string;
  intent: string;
}

export interface TitleOptions {
  songName: string;
  choices: TitleChoice[];
  onStart: (index: number) => void;
  // 調整パネルの初期値と、変更のたびに呼ぶ通知 (呼び出し側が保存する)
  tuning: Tuning;
  onTuningChange: (t: Tuning) => void;
}

export interface TitleView {
  setSelection(index: number): void;
  setGamepad(name: string | null): void;
  setHint(text: string): void;
  destroy(): void;
}

export function showTitle(overlay: HTMLElement, opts: TitleOptions): TitleView {
  overlay.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'panel';

  const h1 = document.createElement('h1');
  h1.textContent = 'music_action_lab v3';
  const song = document.createElement('p');
  song.textContent = `曲: ${opts.songName}。20 秒、敵 1 体。`;

  // 1 本だけなら選択カードは出さず、狙い (intent) を文として出す。2 本以上のときだけ比較用の選択カード
  const choice = document.createElement('div');
  choice.className = 'choice';
  const single = opts.choices.length === 1;
  const cards = single
    ? []
    : opts.choices.map((c, i) => {
        const d = document.createElement('div');
        d.innerHTML = `<strong>振り付け ${c.id.toUpperCase()}</strong><br>${escapeHtml(c.intent)}`;
        d.addEventListener('click', () => {
          selected = i;
          view.setSelection(i);
        });
        choice.appendChild(d);
        return d;
      });
  const intent = document.createElement('p');
  if (single) intent.textContent = opts.choices[0].intent;
  if (opts.choices.length === 0) {
    const none = document.createElement('p');
    none.className = 'hint';
    none.textContent = '振り付けデータがありません (assets/choreo/*.json)';
    choice.appendChild(none);
  }

  const controls = document.createElement('p');
  controls.className = 'muted';
  controls.innerHTML =
    'DualSense: 左スティックで移動、× で攻撃<br>キーボード: WASD / 矢印で移動、Space か J で攻撃、Enter で開始';

  const gamepad = document.createElement('p');
  gamepad.className = 'muted';
  gamepad.textContent = 'コントローラー: 未接続 (ボタンを押すと認識されます)';

  const hint = document.createElement('p');
  hint.className = 'hint';

  const tuning = buildTuningPanel(opts.tuning, opts.onTuningChange);

  const start = document.createElement('button');
  start.textContent = 'はじめる';
  start.addEventListener('click', () => opts.onStart(selected));

  panel.append(h1, song, single ? intent : choice, controls, gamepad, hint, tuning, start);
  overlay.appendChild(panel);

  let selected = 0;
  const view: TitleView = {
    setSelection(index) {
      selected = index;
      cards.forEach((c, i) => c.classList.toggle('selected', i === index));
    },
    setGamepad(name) {
      gamepad.textContent = name ? `コントローラー: ${name}` : 'コントローラー: 未接続 (ボタンを押すと認識されます)';
    },
    setHint(text) {
      hint.textContent = text;
    },
    destroy() {
      overlay.innerHTML = '';
    },
  };
  view.setSelection(0);
  return view;
}

// 調整パネル。5 本の range と現在値、「既定値に戻す」。変更は即 onChange に渡す (範囲は clampTuning で収める)
function buildTuningPanel(initial: Tuning, onChange: (t: Tuning) => void): HTMLDetailsElement {
  let current = clampTuning(initial);
  const details = document.createElement('details');
  details.className = 'tuning';
  const summary = document.createElement('summary');
  summary.textContent = '調整 (相殺の窓・大きさ・扇・向きの許容角)';
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = '選んだ値は結果の要約の先頭に出ます。不満ノートに貼ると次の版の既定値に反映されます';
  details.append(summary, note);

  const inputs = new Map<keyof Tuning, HTMLInputElement>();
  const values = new Map<keyof Tuning, HTMLSpanElement>();
  const refresh = (): void => {
    for (const key of TUNING_KEYS) {
      inputs.get(key)!.value = String(current[key]);
      values.get(key)!.textContent = formatTuningValue(current[key]);
    }
  };
  for (const key of TUNING_KEYS) {
    const r = TUNING_RANGES[key];
    const row = document.createElement('label');
    row.className = 'tuning-row';
    const name = document.createElement('span');
    name.className = 'tuning-label';
    name.textContent = r.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    input.addEventListener('input', () => {
      current = clampTuning({ ...current, [key]: Number(input.value) });
      refresh();
      onChange(current);
    });
    const value = document.createElement('span');
    value.className = 'tuning-value';
    row.append(name, input, value);
    details.appendChild(row);
    inputs.set(key, input);
    values.set(key, value);
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'tuning-reset';
  reset.textContent = '既定値に戻す';
  reset.addEventListener('click', () => {
    current = { ...defaultTuning };
    refresh();
    onChange(current);
  });
  details.appendChild(reset);
  refresh();
  return details;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
