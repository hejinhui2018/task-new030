/**
 * 浓度 → 颜色：蓝色顺序色阶（单一色相，浅→深），按相对最大浓度的 log 映射。
 * 色阶取自数据可视化参考调色板 blue 100→700。
 * 体积不参与颜色（由孔内液位高度编码），避免双重编码冲突。
 */

// t=0 → t=1
const STOPS: { t: number; hex: string }[] = [
  { t: 0.0, hex: '#dceafb' }, // blue 100 附近
  { t: 0.16, hex: '#b7d3f6' },
  { t: 0.33, hex: '#86b6ef' },
  { t: 0.5, hex: '#3987e5' }, // blue 400
  { t: 0.67, hex: '#2a78d6' }, // blue 450
  { t: 0.83, hex: '#1c5cab' }, // blue 550
  { t: 1.0, hex: '#0d366b' } // blue 700
];

/** 稀释液（体积 > 0、浓度为 0） */
export const DILUENT_COLOR = '#e7eaee';
/** 空孔内部 */
export const EMPTY_COLOR = '#f4f4f2';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 浓度映射到 0..1：相对板上最高浓度取 log，二倍稀释每级视觉等距 */
export function concentrationT(concentration: number, maxConcentration: number): number {
  if (concentration <= 0 || maxConcentration <= 0) return 0;
  const ratio = concentration / maxConcentration;
  if (ratio >= 1) return 1;
  // 128 倍跨度（A1→A8）映射到 0..1
  return Math.max(0, 1 + Math.log10(ratio) / Math.log10(128));
}

export function concentrationColor(
  concentration: number,
  maxConcentration: number
): string {
  if (concentration <= 0) return DILUENT_COLOR;
  const t = concentrationT(concentration, maxConcentration);
  const span = STOPS.length - 1;
  const pos = Math.min(t, 1) * span;
  const i = Math.min(Math.floor(pos), span - 1);
  const lo = STOPS[i]!;
  const hi = STOPS[i + 1]!;
  const local = pos - i;
  const [r1, g1, b1] = hexToRgb(lo.hex);
  const [r2, g2, b2] = hexToRgb(hi.hex);
  return rgbToHex(lerp(r1, r2, local), lerp(g1, g2, local), lerp(b1, b2, local));
}

/** 依据背景亮度选择墨色（液体色较深时用白字） */
export function inkFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55 ? '#ffffff' : '#0b0b0b';
}

/** 图例用分级色标 */
export const LEGEND_STOPS = STOPS.map((s) => s.hex);
