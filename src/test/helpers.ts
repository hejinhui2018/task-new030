import type { Step } from '../engine/types';

let n = 0;
const id = () => `t${++n}`;

/** 测试用步骤构造器，省略样板字段 */
export const st = {
  load(
    target: string,
    volume: number,
    concentration = 0,
    sample = '',
    tip: Step['tip'] = { kind: 'new' }
  ): Step {
    return { id: id(), type: 'load', target, volume, concentration, sample, tip };
  },
  mix(target: string, tip: Step['tip'] = { kind: 'new' }): Step {
    return { id: id(), type: 'mix', target, tip };
  },
  transfer(
    source: string,
    target: string,
    volume: number,
    tip: Step['tip'] = { kind: 'new' }
  ): Step {
    return { id: id(), type: 'transfer', source, target, volume, tip };
  },
  discard(
    source: string,
    volume: number,
    tip: Step['tip'] = { kind: 'new' }
  ): Step {
    return { id: id(), type: 'discard', source, volume, tip };
  },
  reuse(group: string): Step['tip'] {
    return { kind: 'reuse', group };
  }
};

/** 浮点近似断言 */
export function expectClose(actual: number, expected: number, eps = 1e-6) {
  expect(actual, `expected ${actual} ≈ ${expected}`).toBeGreaterThan(expected - eps);
  expect(actual, `expected ${actual} ≈ ${expected}`).toBeLessThan(expected + eps);
}
