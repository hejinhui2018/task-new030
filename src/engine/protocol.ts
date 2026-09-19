import type { Step } from './types';

let seq = 0;
/** 生成步骤 id（同一浏览器会话内唯一；从 localStorage 读入的旧 id 也不会冲突，因为带前缀） */
export function newStepId(): string {
  seq += 1;
  return `step-${Date.now().toString(36)}-${seq}`;
}

/**
 * 内置方案：A1→A8 二倍稀释（每步均使用新吸头）。
 * A1: 200 µL、100 µM 样本；A2..A8: 各 100 µL 稀释液；
 * 混匀后向下一孔转移 100 µL；最后从 A8 弃去 100 µL。
 */
export function createDefaultProtocol(): Step[] {
  const steps: Step[] = [
    {
      id: newStepId(),
      type: 'load',
      target: 'A1',
      volume: 200,
      concentration: 100,
      sample: '样本 S',
      tip: { kind: 'new' },
      note: 'A1 加入样本'
    }
  ];

  for (let col = 2; col <= 8; col += 1) {
    steps.push({
      id: newStepId(),
      type: 'load',
      target: `A${col}`,
      volume: 100,
      concentration: 0,
      sample: '稀释液',
      tip: { kind: 'new' },
      note: `A${col} 加入稀释液`
    });
  }

  for (let col = 1; col <= 7; col += 1) {
    steps.push({
      id: newStepId(),
      type: 'mix',
      target: `A${col}`,
      tip: { kind: 'new' },
      note: `混匀 A${col}`
    });
    steps.push({
      id: newStepId(),
      type: 'transfer',
      source: `A${col}`,
      target: `A${col + 1}`,
      volume: 100,
      tip: { kind: 'new' },
      note: `A${col} → A${col + 1} 转移 100 µL`
    });
  }

  steps.push({
    id: newStepId(),
    type: 'mix',
    target: 'A8',
    tip: { kind: 'new' },
    note: '混匀 A8'
  });
  steps.push({
    id: newStepId(),
    type: 'discard',
    source: 'A8',
    volume: 100,
    tip: { kind: 'new' },
    note: 'A8 弃去 100 µL'
  });

  return steps;
}
