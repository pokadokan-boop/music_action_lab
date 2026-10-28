// 世界座標 (v3 T1)。単位は「画面の幅」で、x と y は同じ長さの単位 (等方)。画面は 16:9 なので高さは 9/16。
// 判定 (距離・角度・速度) と描画はこの座標で行い、描画は x も y も画面の幅を掛けて写す。
// 振り付け JSON と config の位置もこの座標で書く (docs/choreo-format.md「位置と座標」)。
import type { Vec } from './vec';

export const WORLD = { w: 1, h: 9 / 16 } as const;

export function inWorld(p: Vec): boolean {
  return p.x >= 0 && p.x <= WORLD.w && p.y >= 0 && p.y <= WORLD.h;
}
