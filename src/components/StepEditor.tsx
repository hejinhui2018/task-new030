import { useMemo, useState } from 'react';
import type { Step, TipMode } from '../engine/types';
import { validateStepShape } from '../engine/simulator';
import { STEP_TYPE_LABEL } from '../lib/steps';

interface StepEditorProps {
  step: Step;
  /** 已知的复用组名（用于输入提示） */
  knownGroups: string[];
  onChange: (next: Step) => void;
  onClose: () => void;
  onDelete: () => void;
}

const WELL_OPTIONS = [
  ...'ABCDEFGH'.split('').flatMap((r) =>
    Array.from({ length: 12 }, (_, c) => `${r}${c + 1}`)
  )
];

function WellSelect(props: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={props.ariaLabel}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {WELL_OPTIONS.map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
    </select>
  );
}

export function StepEditor({
  step,
  knownGroups,
  onChange,
  onClose,
  onDelete
}: StepEditorProps) {
  const [draft, setDraft] = useState<Step>(step);
  const errors = useMemo(() => validateStepShape(draft), [draft]);

  const patch = (p: Partial<Step>) => setDraft((d) => ({ ...d, ...p }) as Step);
  const setTip = (tip: TipMode) => setDraft((d) => ({ ...d, tip }));

  return (
    <div className="step-editor" data-testid="step-editor">
      <h3>
        编辑第 {STEP_TYPE_LABEL[draft.type]} 步骤
        {errors.length > 0 && (
          <span className="tag warn" style={{ marginLeft: 8 }}>
            {errors.length} 项待修正
          </span>
        )}
      </h3>

      <div className="form-grid">
        {(draft.type === 'load' || draft.type === 'mix') && (
          <label>
            目标孔
            <WellSelect
              ariaLabel="目标孔"
              value={draft.target}
              onChange={(v) => patch({ target: v } as Partial<Step>)}
            />
          </label>
        )}

        {draft.type === 'load' && (
          <>
            <label>
              体积 (µL)
              <input
                type="number"
                min={1}
                max={200}
                value={draft.volume}
                onChange={(e) =>
                  patch({ volume: Number(e.target.value) } as Partial<Step>)
                }
              />
            </label>
            <label>
              浓度 (µM)，0 = 稀释液
              <input
                type="number"
                min={0}
                value={draft.concentration}
                onChange={(e) =>
                  patch({
                    concentration: Number(e.target.value)
                  } as Partial<Step>)
                }
              />
            </label>
            <label className="wide">
              样本名称
              <input
                type="text"
                value={draft.sample}
                placeholder={draft.concentration > 0 ? '例如：样本 S' : '稀释液可留空'}
                onChange={(e) =>
                  patch({ sample: e.target.value } as Partial<Step>)
                }
              />
            </label>
          </>
        )}

        {draft.type === 'transfer' && (
          <>
            <label>
              源孔
              <WellSelect
                ariaLabel="源孔"
                value={draft.source}
                onChange={(v) => patch({ source: v } as Partial<Step>)}
              />
            </label>
            <label>
              目标孔
              <WellSelect
                ariaLabel="目标孔"
                value={draft.target}
                onChange={(v) => patch({ target: v } as Partial<Step>)}
              />
            </label>
            <label>
              转移体积 (µL)
              <input
                type="number"
                min={1}
                value={draft.volume}
                onChange={(e) =>
                  patch({ volume: Number(e.target.value) } as Partial<Step>)
                }
              />
            </label>
          </>
        )}

        {draft.type === 'discard' && (
          <>
            <label>
              源孔
              <WellSelect
                ariaLabel="源孔"
                value={draft.source}
                onChange={(v) => patch({ source: v } as Partial<Step>)}
              />
            </label>
            <label>
              弃去体积 (µL)
              <input
                type="number"
                min={1}
                value={draft.volume}
                onChange={(e) =>
                  patch({ volume: Number(e.target.value) } as Partial<Step>)
                }
              />
            </label>
          </>
        )}

        <label className="wide">
          备注（可选）
          <input
            type="text"
            value={draft.note ?? ''}
            onChange={(e) => patch({ note: e.target.value } as Partial<Step>)}
          />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="tip-picker" role="radiogroup" aria-label="吸头策略">
          <label>
            <input
              type="radio"
              name="tipmode"
              checked={draft.tip.kind === 'new'}
              onChange={() => setTip({ kind: 'new' })}
            />
            每步新吸头
          </label>
          <label>
            <input
              type="radio"
              name="tipmode"
              checked={draft.tip.kind === 'reuse'}
              onChange={() =>
                setTip({ kind: 'reuse', group: knownGroups[0] ?? 'G1' })
              }
            />
            复用吸头组
          </label>
          {draft.tip.kind === 'reuse' && (
            <input
              type="text"
              aria-label="复用吸头组名"
              list="known-tip-groups"
              value={draft.tip.group}
              onChange={(e) => setTip({ kind: 'reuse', group: e.target.value })}
            />
          )}
          <datalist id="known-tip-groups">
            {knownGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
      </div>

      {errors.length > 0 && (
        <ul style={{ color: 'var(--critical)', fontSize: 12, margin: '8px 0 0', paddingLeft: 18 }}>
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary tiny"
          disabled={errors.length > 0}
          onClick={() => {
            onChange(draft);
            onClose();
          }}
        >
          保存
        </button>
        <button type="button" className="btn tiny" onClick={onClose}>
          取消
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn tiny danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          删除此步骤
        </button>
      </div>
    </div>
  );
}
