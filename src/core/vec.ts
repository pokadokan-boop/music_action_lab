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

// 単位ベクトル。長さ 0 なら零ベクトルのまま (向きが定まらないため)
export function normalize(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

// 向きを度にする。画面座標 (y が下向き) なので 0 = 右、90 = 下、時計回り。範囲は [0, 360)
export function angleDeg(v: Vec): number {
  const deg = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

// 2 つの向きの差の絶対値 (度、0〜180)。長さは見ない。どちらかが零ベクトルなら 0
export function angleBetweenDeg(a: Vec, b: Vec): number {
  const cross = a.x * b.y - a.y * b.x;
  const dot = a.x * b.x + a.y * b.y;
  return Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
}

// 点 p が、origin から aim 方向に開く扇 (半角 halfDeg、半径 range) に入るか。
// 攻撃の命中 (T3) と相殺の重なり (T5) で共用する。origin と p が同じ点なら入っているとみなす
export function inFan(origin: Vec, aim: Vec, halfDeg: number, range: number, p: Vec): boolean {
  const d = dist(origin, p);
  if (d > range) return false;
  if (d === 0) return true;
  return angleBetweenDeg(aim, { x: p.x - origin.x, y: p.y - origin.y }) <= halfDeg;
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
