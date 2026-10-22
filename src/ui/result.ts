// 結果画面。記録の要約をテキストで出し、コピーできるようにする
export interface ResultOptions {
  text: string;
  onRetry: () => void;
}

export interface ResultView {
  destroy(): void;
}

export function showResult(overlay: HTMLElement, opts: ResultOptions): ResultView {
  overlay.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'panel';

  const h1 = document.createElement('h1');
  h1.textContent = '結果';
  const pre = document.createElement('pre');
  pre.textContent = opts.text;

  const copy = document.createElement('button');
  copy.textContent = 'コピー';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(opts.text);
      copy.textContent = 'コピーしました';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      copy.textContent = '選択しました (Ctrl+C)';
    }
  });

  const retry = document.createElement('button');
  retry.textContent = 'もう一度 (タイトルへ)';
  retry.addEventListener('click', () => opts.onRetry());

  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'この要約を vault の不満ノートに貼り、不満を 4 行以内で書いてください。';

  panel.append(h1, pre, copy, retry, note);
  overlay.appendChild(panel);
  return {
    destroy() {
      overlay.innerHTML = '';
    },
  };
}
