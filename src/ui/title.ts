// タイトル画面。曲名、振り付けの狙い、操作説明。音の有効化はユーザー操作 (クリックかキー) が要る。
// 振り付けは 1 版 = 1 本 (v2) なので選択は出さない。1 軸の比較で一時的に 2 本目を足したときだけ選択カードが出る (docs/plan/v2-phase1.md)
export interface TitleChoice {
  id: string;
  intent: string;
}

export interface TitleOptions {
  songName: string;
  choices: TitleChoice[];
  onStart: (index: number) => void;
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
  h1.textContent = 'music_action_lab v2';
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

  const start = document.createElement('button');
  start.textContent = 'はじめる';
  start.addEventListener('click', () => opts.onStart(selected));

  panel.append(h1, song, single ? intent : choice, controls, gamepad, hint, start);
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
