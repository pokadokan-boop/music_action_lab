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

// 予告・移動の補間。根本コンセプトアイデアの「イージングアウト系の補間」に合わせる (v0 の既定)
export function easeOut(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - (1 - c) ** 3;
}

// 拍の頭に向けて加速する補間 (v1 の snap)。3 拍の移動なら最後の 1 拍で 1 - (2/3)^3 = 70% 動く
export function easeIn(t: number): number {
  const c = clamp(t, 0, 1);
  return c ** 3;
}

// 点 p から線分 ab までの距離
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1);
  return dist(p, { x: a.x + abx * t, y: a.y + aby * t });
}
