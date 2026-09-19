/** 96 孔板常量 */
export const PLATE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const PLATE_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/** 每孔最大容量 µL */
export const WELL_CAPACITY = 200;

export const ALL_WELL_IDS: readonly string[] = PLATE_ROWS.flatMap((r) =>
  PLATE_COLS.map((c) => `${r}${c}`)
);

export function isWellId(value: string): boolean {
  return (ALL_WELL_IDS as readonly string[]).includes(value);
}
