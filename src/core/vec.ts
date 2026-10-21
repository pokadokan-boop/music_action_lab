export interface Vec {
  x: number;
  y: number;
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// 予告・移動の補間。根本コンセプトアイデアの「イージングアウト系の補間」に合わせる
export function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}
