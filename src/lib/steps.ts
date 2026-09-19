import type { Step } from '../engine/types';

/** 步骤的人类可读描述 */
export function describeStep(step: Step): string {
  switch (step.type) {
    case 'load':
      return step.concentration > 0
        ? `加样 → ${step.target}：${step.volume} µL，${step.concentration} µM ${step.sample}`
        : `加稀释液 → ${step.target}：${step.volume} µL`;
    case 'mix':
      return `混匀 ${step.target}`;
    case 'transfer':
      return `转移 ${step.source} → ${step.target}：${step.volume} µL`;
    case 'discard':
      return `弃去 ${step.source}：${step.volume} µL`;
  }
}

export const STEP_TYPE_LABEL: Record<Step['type'], string> = {
  load: '加样/稀释液',
  mix: '混匀',
  transfer: '转移',
  discard: '弃去'
};

/** 构造某类型的空白步骤 */
export function blankStep(type: Step['type'], id: string): Step {
  const base = { id, tip: { kind: 'new' as const } };
  switch (type) {
    case 'load':
      return { ...base, type, target: 'A1', volume: 100, concentration: 0, sample: '' };
    case 'mix':
      return { ...base, type, target: 'A1' };
    case 'transfer':
      return { ...base, type, source: 'A1', target: 'A2', volume: 100 };
    case 'discard':
      return { ...base, type, source: 'A1', volume: 100 };
  }
}
