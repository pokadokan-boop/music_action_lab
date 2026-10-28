// 調整パネルの値 (Tuning) の範囲・保存・要約。DOM には触らない (パネルの組み立ては title.ts)。
// 本人が選んだ値は結果の要約の先頭行に出て、不満ノートに貼ると次の版の既定値に反映される (docs/plan/v3-phase2.md「既定値の決め」)
import { defaultTuning, type Tuning } from '../config';

export const TUNING_KEY = 'mal.tuning';

export interface TuningRange {
  min: number;
  max: number;
  step: number;
  label: string;
}

// パネルに並ぶ順。range の min / max / step はこの表から取る
export const TUNING_RANGES: Record<keyof Tuning, TuningRange> = {
  cancelEarlyMs: { min: 0, max: 200, step: 10, label: '相殺の窓 早い側 (ms)' },
  cancelLateMs: { min: 0, max: 200, step: 10, label: '相殺の窓 遅い側 (ms)' },
  sizeScale: { min: 0.4, max: 1.0, step: 0.05, label: '自機と敵の大きさ (倍)' },
  fanRatio: { min: 0.8, max: 2.0, step: 0.1, label: '扇の半径 (自機の直径の倍)' },
  cancelFacingDeg: { min: 30, max: 120, step: 5, label: '向きの許容角 (度)' },
};

export const TUNING_KEYS = Object.keys(TUNING_RANGES) as (keyof Tuning)[];

// 数値でない・範囲外・欠けている項目を既定値か端の値で埋める
export function clampTuning(t: Partial<Tuning>): Tuning {
  const out = { ...defaultTuning };
  for (const key of TUNING_KEYS) {
    const v = t[key];
    const r = TUNING_RANGES[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[key] = Math.min(r.max, Math.max(r.min, v));
  }
  return out;
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// storage が無い・読めない・JSON が壊れているときは既定値。項目ごとの穴は clampTuning が埋める
export function loadTuning(storage: Storage | null = defaultStorage()): Tuning {
  if (!storage) return { ...defaultTuning };
  try {
    const raw = storage.getItem(TUNING_KEY);
    if (!raw) return { ...defaultTuning };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...defaultTuning };
    return clampTuning(parsed as Partial<Tuning>);
  } catch {
    return { ...defaultTuning };
  }
}

// 保存できなくても (容量超過・プライベートモード) ゲームは続ける
export function saveTuning(t: Tuning, storage: Storage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(TUNING_KEY, JSON.stringify(t));
  } catch {
    // 握りつぶす
  }
}

// 浮動小数の端数 (0.6000000000000001 など) を落として表示する
export function formatTuningValue(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

// 結果の要約の 1 行目に付ける。既定値なら「調整 窓 前100/後50 ms 大きさ 0.6 扇 1.2 許容 60°」
export function describeTuning(t: Tuning): string {
  const f = formatTuningValue;
  return `調整 窓 前${f(t.cancelEarlyMs)}/後${f(t.cancelLateMs)} ms 大きさ ${f(t.sizeScale)} 扇 ${f(t.fanRatio)} 許容 ${f(t.cancelFacingDeg)}°`;
}
