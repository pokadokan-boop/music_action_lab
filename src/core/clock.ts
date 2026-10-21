// 固定ステップのゲーム時計。ブラウザでは音の時計 (AudioContext.currentTime) から経過 ms を渡し、
// テストでは直接 advanceTime を呼ぶ。now はステップ数から計算し、浮動小数の累積誤差を持たない。
export class GameClock {
  private stepIndex = 0;
  private carrySec = 0;

  constructor(readonly dt: number = 1 / 120) {}

  get now(): number {
    return this.stepIndex * this.dt;
  }

  // 進んだ分の各ステップ時刻を返す。端数は次回に持ち越す
  advanceTime(ms: number): number[] {
    this.carrySec += ms / 1000;
    const steps: number[] = [];
    while (this.carrySec >= this.dt - 1e-9) {
      this.carrySec -= this.dt;
      this.stepIndex += 1;
      steps.push(this.now);
    }
    return steps;
  }
}
