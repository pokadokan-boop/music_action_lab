// キーボードとゲームパッドを合成して 1 つの入力にする
import type { InputState } from '../core/sim';
import { GamepadInput } from './gamepad';
import { KeyboardInput } from './keyboard';

export interface InputSnapshot extends InputState {
  confirm: boolean;
  selectLeft: boolean;
  selectRight: boolean;
  gamepadName: string | null;
}

export class InputManager {
  private readonly keyboard = new KeyboardInput();
  private readonly gamepad = new GamepadInput();

  poll(): InputSnapshot {
    const k = this.keyboard.move();
    const g = this.gamepad.move();
    const move = { x: clamp1(k.x + g.x), y: clamp1(k.y + g.y) };
    const snapshot: InputSnapshot = {
      move,
      attackPressed: this.keyboard.attack() || this.gamepad.attack(),
      confirm: this.keyboard.confirm() || this.gamepad.confirm(),
      selectLeft: this.keyboard.selectLeft() || this.gamepad.selectLeft(),
      selectRight: this.keyboard.selectRight() || this.gamepad.selectRight(),
      gamepadName: this.gamepad.connectedName(),
    };
    this.keyboard.endFrame();
    return snapshot;
  }
}

function clamp1(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
