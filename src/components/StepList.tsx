import { useState } from 'react';
import type { Step } from '../engine/types';
import { describeStep } from '../lib/steps';

interface StepListProps {
  steps: Step[];
  /** 已成功执行的步数（0..steps.length） */
  applied: number;
  failedIndex: number | null;
  selectedId: string | null;
  editingId: string | null;
  onReorder: (from: number, to: number) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function StepList({
  steps,
  applied,
  failedIndex,
  selectedId,
  editingId,
  onReorder,
  onSelect,
  onEdit,
  onDelete
}: StepListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <ol className="step-list" aria-label="移液步骤列表">
      {steps.map((step, i) => {
        const state =
          failedIndex === i
            ? 'failed'
            : i < applied
              ? 'done'
              : i === applied
                ? 'current'
                : '';
        return (
          <li
            key={step.id}
            className={[
              'step-row',
              state,
              dragIndex === i ? 'dragging' : '',
              overIndex === i && dragIndex !== i ? 'drag-over' : '',
              selectedId === step.id ? 'selected' : '',
              editingId === step.id ? 'editing' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setOverIndex(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragIndex !== null && dragIndex !== i) setOverIndex(i);
            }}
            onDragLeave={() => {
              if (overIndex === i) setOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData('text/plain'));
              if (Number.isFinite(from) && from !== i) onReorder(from, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
            onClick={() => onSelect(step.id)}
          >
            <span className="handle" aria-hidden>
              ⠿
            </span>
            <span className="step-idx">{i + 1}</span>
            <span className="step-body">
              <div className="step-desc">{describeStep(step)}</div>
              <div className="step-meta">
                <span
                  className={`tip-badge ${step.tip.kind === 'reuse' ? 'reuse' : ''}`}
                >
                  {step.tip.kind === 'new'
                    ? '新吸头'
                    : `复用吸头：${step.tip.group}`}
                </span>
                {step.note ? <span>{step.note}</span> : null}
              </div>
            </span>
            <span className="step-actions">
              <button
                type="button"
                className="icon-btn"
                title="编辑此步骤"
                aria-label={`编辑第 ${i + 1} 步`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(step.id);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                className="icon-btn"
                title="删除此步骤"
                aria-label={`删除第 ${i + 1} 步`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(step.id);
                }}
              >
                ✕
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
