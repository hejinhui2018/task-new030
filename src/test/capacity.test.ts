import { describe, expect, it } from 'vitest';
import { simulate } from '../engine/simulator';
import { st } from './helpers';

describe('容量与吸空限制', () => {
  it('单次加样超过 200 µL → INVALID_STEP', () => {
    const r = simulate([st.load('A1', 201, 100, 'S')]);
    expect(r.error?.code).toBe('INVALID_STEP');
  });

  it('累计加样超过 200 µL → OVERFLOW，停在该步', () => {
    const steps = [st.load('A1', 150, 100, 'S'), st.load('A1', 60, 0)];
    const r = simulate(steps);
    expect(r.error?.code).toBe('OVERFLOW');
    expect(r.error?.stepIndex).toBe(1);
    expect(r.error?.wells).toContain('A1');
    // 失败步不产生帧：停留在仅 150 µL 的状态
    expect(r.frames).toHaveLength(2);
    expect(r.frames[1].wells.A1.volume).toBe(150);
  });

  it('转移注入后目标孔超过 200 µL → OVERFLOW，源孔液体未被扣减', () => {
    const steps = [
      st.load('A1', 200, 100, 'S'),
      st.load('A2', 150, 0),
      st.mix('A1'),
      st.transfer('A1', 'A2', 100)
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('OVERFLOW');
    expect(r.error?.stepIndex).toBe(3);
    expect(r.error?.wells).toEqual(expect.arrayContaining(['A1', 'A2']));
    const last = r.frames[r.frames.length - 1];
    expect(last.wells.A1.volume).toBe(200);
    expect(last.wells.A2.volume).toBe(150);
  });

  it('转移体积大于源孔余量 → EMPTY_ASPIRATE', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('A2', 50, 0),
      st.mix('A1'),
      st.transfer('A1', 'A2', 120)
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('EMPTY_ASPIRATE');
    expect(r.error?.stepIndex).toBe(3);
    expect(r.error?.wells).toContain('A1');
  });

  it('弃去体积大于孔内余量 → EMPTY_ASPIRATE', () => {
    const steps = [st.load('A1', 50, 100, 'S'), st.mix('A1'), st.discard('A1', 80)];
    const r = simulate(steps);
    expect(r.error?.code).toBe('EMPTY_ASPIRATE');
    expect(r.error?.stepIndex).toBe(2);
  });

  it('恰好 200 µL 不溢出（边界值）', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('A2', 100, 0),
      st.mix('A1'),
      st.transfer('A1', 'A2', 100),
      st.mix('A2')
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    expect(r.frames[r.frames.length - 1].wells.A2.volume).toBe(200);
  });

  it('吸空恰好等于余量时允许（孔被取空）', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1'),
      st.transfer('A1', 'A2', 100),
      st.mix('A2')
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const last = r.frames[r.frames.length - 1];
    expect(last.wells.A1.volume).toBe(0);
    expect(last.wells.A2.volume).toBe(100);
  });

  it('对空孔混匀 → INVALID_STEP', () => {
    const r = simulate([st.mix('A1')]);
    expect(r.error?.code).toBe('INVALID_STEP');
  });
});
