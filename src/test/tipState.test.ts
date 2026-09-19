import { describe, expect, it } from 'vitest';
import { simulate, wellConcentration } from '../engine/simulator';
import { expectClose, st } from './helpers';

describe('吸头状态与跨样本带入', () => {
  it('每步新吸头：互不污染，方案正常完成', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('B1', 100, 100, 'T'),
      st.mix('A1'),
      st.transfer('A1', 'A2', 50),
      st.mix('B1'),
      st.transfer('B1', 'B2', 50)
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const final = r.frames[r.frames.length - 1];
    expectClose(wellConcentration(final.wells.A2), 100);
    expectClose(wellConcentration(final.wells.B2), 100);
    expect(final.wells.A2.amounts['T'] ?? 0).toBe(0);
    expect(final.wells.B2.amounts['S'] ?? 0).toBe(0);
  });

  it('同组吸头只接触同一个样本（含其稀释链）时安全', () => {
    // 用同一支吸头依次混匀 S 的稀释孔：每个孔里都只有 S，不算带入
    const steps = [
      st.load('A1', 200, 100, 'S'),
      st.load('A2', 100, 0),
      st.mix('A1', st.reuse('g1')),
      st.transfer('A1', 'A2', 100, st.reuse('g1')),
      st.mix('A2', st.reuse('g1'))
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
  });

  it('复用吸头先接触 S 再接触 T 的孔 → CARRYOVER，停在首次接触', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1', st.reuse('g1')), // 吸头沾上 S
      st.load('B1', 100, 100, 'T', st.reuse('g1')) // 脏吸头进入 T 孔
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('CARRYOVER');
    expect(r.error?.stepIndex).toBe(2);
    expect(r.error?.wells).toEqual(['B1']);
    expect(r.error?.residueSamples).toContain('S');
    // B1 的加样未发生：体积仍为 0
    expect(r.frames[r.frames.length - 1].wells.B1.volume).toBe(0);
  });

  it('转移时脏吸头先污染源孔：在吸液阶段即停止', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1', st.reuse('g1')), // 沾上 S
      st.load('B1', 100, 100, 'T'),
      st.mix('B1', { kind: 'new' }),
      st.transfer('B1', 'B2', 50, st.reuse('g1')) // 用脏吸头去吸 T
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('CARRYOVER');
    expect(r.error?.stepIndex).toBe(4);
    expect(r.error?.wells).toEqual(['B1']);
  });

  it('不同复用组互不影响：g1 沾 S、g2 沾 T，各自继续接触本样本不报错', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('B1', 100, 100, 'T'),
      st.mix('A1', st.reuse('g1')),
      st.mix('B1', st.reuse('g2')),
      st.mix('A1', st.reuse('g1')),
      st.mix('B1', st.reuse('g2'))
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
  });

  it('残留样本的吸头进入纯稀释液孔同样被拦截（稀释孔也受保护）', () => {
    // 吸头沾 S 后接触尚未加 S 的纯稀释液孔：会被拦住（把稀释孔也保护起来）
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1', st.reuse('g1')),
      st.load('A2', 100, 0, { kind: 'new' }),
      st.mix('A2', st.reuse('g1'))
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('CARRYOVER');
    expect(r.error?.residueSamples).toContain('S');
  });

  it('复用组名为空 → INVALID_STEP', () => {
    const r = simulate([st.mix('A1', { kind: 'reuse', group: '   ' })]);
    expect(r.error?.code).toBe('INVALID_STEP');
  });

  it('吸头残留 S 后，用它向空孔加样 S 本身：不算带入', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1', st.reuse('g1')), // 沾上 S
      st.load('A2', 100, 100, 'S', st.reuse('g1')) // 同一吸头加同一样本
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const final = r.frames[r.frames.length - 1];
    expectClose(final.wells.A2.volume, 100);
    expectClose(wellConcentration(final.wells.A2), 100);
  });

  it('吸头残留 S 后，用它向孔中加注 T：仍然拦截（T 是被污染对象）', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1', st.reuse('g1')), // 沾上 S
      st.load('B1', 100, 100, 'T', st.reuse('g1'))
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('CARRYOVER');
    expect(r.error?.residueSamples).toContain('S');
  });
});
