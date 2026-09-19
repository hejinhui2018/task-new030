import type { WellState } from '../engine/types';

/** 体积显示：整数去小数点，最多保留 1 位 */
export function fmtVolume(v: number): string {
  return `${Math.round(v * 10) / 10}`;
}

/** 浓度显示：自动选择 µM/nM/pM 量级（返回值带单位） */
export function fmtConcentration(c: number): string {
  if (c === 0) return '0 µM';
  if (c >= 1) return `${Math.round(c * 100) / 100} µM`;
  if (c >= 0.001) return `${Math.round(c * 1000 * 100) / 100} nM`;
  return `${Math.round(c * 1e6 * 100) / 100} pM`;
}

/** 孔内样本组成（用于提示框） */
export function wellSamples(well: WellState): { sample: string; amount: number }[] {
  return Object.entries(well.amounts)
    .filter(([, a]) => a > 1e-7)
    .map(([sample, amount]) => ({ sample, amount }));
}
