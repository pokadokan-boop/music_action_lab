// キーボード入力。WASD と矢印で移動、Space と J で攻撃、Enter で決定、A / B で振り付け選択
export class KeyboardInput {
  private readonly down = new Set<string>();
  // 1 フレームより短い押下 (keydown と keyup が同じフレームに入る) を取りこぼさないため、
  // 押された事実を次の poll まで保持する
  private readonly pressedSincePoll = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      this.down.add(e.code);
      this.pressedSincePoll.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  // フレームごとに 1 回呼び、短い押下の保持を消す
  endFrame(): void {
    this.pressedSincePoll.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code) || this.pressedSincePoll.has(code);
  }

  move(): { x: number; y: number } {
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0) - (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0);
    return { x, y };
  }

  attack(): boolean {
    return this.isDown('Space') || this.isDown('KeyJ');
  }

  confirm(): boolean {
    return this.isDown('Enter');
  }

  selectLeft(): boolean {
    return this.isDown('ArrowLeft') || this.isDown('KeyA');
  }

  selectRight(): boolean {
    return this.isDown('ArrowRight') || this.isDown('KeyD');
  }
}
