import { describe, expect, it } from 'vitest';
import { createDefaultProtocol } from '../engine/protocol';
import {
  plateTotalAmount,
  plateTotalVolume,
  simulate,
  wellConcentration
} from '../engine/simulator';
import { expectClose, st } from './helpers';

describe('质量守恒', () => {
  it('加样阶段：板上物质量随每次加样精确增加', () => {
    const steps = [
      st.load('A1', 200, 100, 'S'),
      st.load('A2', 100, 50, 'S'),
      st.load('B1', 75, 0)
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const final = r.frames[r.frames.length - 1];
    expectClose(plateTotalAmount(final.wells), 200 * 100 + 100 * 50);
    expectClose(plateTotalVolume(final.wells), 375);
  });

  it('转移与混匀只在孔间重新分配，板上总物质量不变', () => {
    const steps = [
      st.load('A1', 200, 100, 'S'),
      st.load('A2', 100, 0),
      st.mix('A1'),
      st.transfer('A1', 'A2', 100),
      st.mix('A2'),
      st.transfer('A2', 'A3', 40),
      st.mix('A3')
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();

    const initial = r.frames[2]; // A1 样本 + A2 稀释液加样后
    const final = r.frames[r.frames.length - 1];
    expectClose(plateTotalAmount(final.wells), plateTotalAmount(initial.wells));
    expectClose(plateTotalVolume(final.wells), plateTotalVolume(initial.wells));
  });

  it('弃去会按比例带走物质量，剩余浓度不变', () => {
    const steps = [
      st.load('A1', 200, 100, 'S'),
      st.mix('A1'),
      st.discard('A1', 60)
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const before = r.frames[2];
    const after = r.frames[3];
    expectClose(plateTotalAmount(after.wells), 200 * 100 * (140 / 200));
    expectClose(wellConcentration(after.wells.A1), wellConcentration(before.wells.A1));
  });

  it('内置二倍稀释方案全程板上总物质量守恒（弃去前）', () => {
    const r = simulate(createDefaultProtocol());
    expect(r.error).toBeNull();
    const loaded = r.frames[8]; // 8 次加样完成
    const beforeDiscard = r.frames[r.frames.length - 2]; // 弃去前
    expectClose(
      plateTotalAmount(beforeDiscard.wells),
      plateTotalAmount(loaded.wells)
    );
    expectClose(
      plateTotalVolume(beforeDiscard.wells),
      plateTotalVolume(loaded.wells)
    );
  });
});
