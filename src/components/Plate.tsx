import type { ReactNode } from 'react';
import { PLATE_COLS, PLATE_ROWS, WELL_CAPACITY } from '../engine/plate';
import type { SimError, SimFrame, WellState } from '../engine/types';
import { concentrationColor, EMPTY_COLOR, inkFor } from '../lib/color';
import { fmtConcentration, fmtVolume } from '../lib/format';

interface PlateProps {
  frame: SimFrame;
  maxConcentration: number;
  error: SimError | null;
  selectedWell: string | null;
  onSelectWell: (id: string) => void;
}

export function Plate({
  frame,
  maxConcentration,
  error,
  selectedWell,
  onSelectWell
}: PlateProps) {
  const errorWells = new Set(error?.wells ?? []);

  return (
    <div className="plate-scroll">
      <div className="plate" role="grid" aria-label="96 孔板">
        <div className="corner" />
        {PLATE_COLS.map((c) => (
          <div className="col-head" key={c}>
            {c}
          </div>
        ))}

        {PLATE_ROWS.map((row) => (
          <RowFragment key={row}>
            <div className="row-head">{row}</div>
            {PLATE_COLS.map((col) => {
              const id = `${row}${col}`;
              const well: WellState = frame.wells[id] ?? {
                id,
                volume: 0,
                amounts: {},
                mixed: true
              };
              const volume = well.volume;
              const concentration =
                volume > 0
                  ? Object.values(well.amounts).reduce((s, a) => s + a, 0) /
                    volume
                  : 0;
              const hasLiquid = volume > 0;
              const liquidColor = hasLiquid
                ? concentrationColor(concentration, maxConcentration)
                : EMPTY_COLOR;
              const fillPct = Math.min(100, (volume / WELL_CAPACITY) * 100);
              const isError = errorWells.has(id);
              const isChanged = frame.changedWells.includes(id);
              const ink = hasLiquid ? inkFor(liquidColor) : 'var(--ink-2)';

              return (
                <button
                  type="button"
                  key={id}
                  role="gridcell"
                  className={[
                    'well',
                    selectedWell === id ? 'selected' : '',
                    isChanged ? 'changed' : '',
                    isError ? 'error-well' : '',
                    hasLiquid && !well.mixed ? 'unmixed' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`孔 ${id}，体积 ${fmtVolume(volume)} µL，浓度 ${fmtConcentration(concentration)}${well?.mixed === false ? '，未混匀' : ''}`}
                  title={`${id} · ${fmtVolume(volume)} µL · ${fmtConcentration(concentration)}${well?.mixed === false ? ' · 未混匀' : ''}`}
                  onClick={() => onSelectWell(id)}
                >
                  <span
                    className="liquid"
                    style={{
                      height: `${fillPct}%`,
                      background: hasLiquid ? liquidColor : EMPTY_COLOR
                    }}
                  />
                  {hasLiquid && !well.mixed && (
                    <span className="unmixed-stripes" aria-hidden />
                  )}
                  <span className="well-id">{id}</span>
                  <span className="well-val" style={{ color: ink }}>
                    {hasLiquid ? fmtVolume(volume) : ''}
                  </span>
                  <span className="well-conc" style={{ color: ink }}>
                    {hasLiquid ? fmtConcentration(concentration) : ''}
                  </span>
                </button>
              );
            })}
          </RowFragment>
        ))}
      </div>
    </div>
  );
}

function RowFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
