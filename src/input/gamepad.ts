// Gamepad API。DualSense は標準マッピングで読める: axes[0], axes[1] が左スティック、
// buttons[0] が ×、buttons[9] が OPTIONS、buttons[14] / [15] が十字キー左右。
const DEADZONE = 0.2;

export class GamepadInput {
  private index: number | null = null;

  constructor(target: Window = window) {
    target.addEventListener('gamepadconnected', (e) => {
      this.index = e.gamepad.index;
    });
    target.addEventListener('gamepaddisconnected', (e) => {
      if (this.index === e.gamepad.index) this.index = null;
    });
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.index !== null && pads[this.index]) return pads[this.index];
    const first = pads.find((p) => p !== null) ?? null;
    if (first) this.index = first.index;
    return first;
  }

  connectedName(): string | null {
    return this.pad()?.id ?? null;
  }

  move(): { x: number; y: number } {
    const p = this.pad();
    if (!p) return { x: 0, y: 0 };
    const x = applyDeadzone(p.axes[0] ?? 0) + (p.buttons[15]?.pressed ? 1 : 0) - (p.buttons[14]?.pressed ? 1 : 0);
    const y = applyDeadzone(p.axes[1] ?? 0) + (p.buttons[13]?.pressed ? 1 : 0) - (p.buttons[12]?.pressed ? 1 : 0);
    return { x: clamp1(x), y: clamp1(y) };
  }

  attack(): boolean {
    return this.pad()?.buttons[0]?.pressed ?? false;
  }

  confirm(): boolean {
    const p = this.pad();
    return (p?.buttons[0]?.pressed || p?.buttons[9]?.pressed) ?? false;
  }

  selectLeft(): boolean {
    const p = this.pad();
    return (p?.buttons[14]?.pressed || (p?.axes[0] ?? 0) < -0.5) ?? false;
  }

  selectRight(): boolean {
    const p = this.pad();
    return (p?.buttons[15]?.pressed || (p?.axes[0] ?? 0) > 0.5) ?? false;
  }
}

function applyDeadzone(v: number): number {
  if (Math.abs(v) < DEADZONE) return 0;
  const sign = v < 0 ? -1 : 1;
  return sign * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE));
}

function clamp1(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
