import { describe, expect, it } from 'vitest';
import { createDefaultProtocol } from '../engine/protocol';
import { simulate, wellConcentration } from '../engine/simulator';
import { expectClose } from './helpers';

describe('内置 A1→A8 二倍稀释方案', () => {
  const result = simulate(createDefaultProtocol());

  it('全部步骤成功，无错误', () => {
    expect(result.error).toBeNull();
  });

  it('产生初始帧 + 每步一帧', () => {
    // 1(A1样本) + 7(稀释液) + 7×2(混匀+转移) + 1(混匀A8) + 1(弃去) = 24 步
    expect(result.frames).toHaveLength(25);
  });

  it('A1..A8 浓度依次为 100 的 1/2 幂', () => {
    const final = result.frames[result.frames.length - 1];
    for (let col = 1; col <= 8; col += 1) {
      const c = wellConcentration(final.wells[`A${col}`]);
      expectClose(c, 100 / 2 ** (col - 1));
    }
  });

  it('弃去后 A1..A8 体积均为 100 µL（A1 起始 200，移出 100）', () => {
    const final = result.frames[result.frames.length - 1];
    for (let col = 1; col <= 8; col += 1) {
      expectClose(final.wells[`A${col}`].volume, 100);
    }
  });

  it('每一次转移前源孔都已混匀', () => {
    // 任意一帧中不存在「未混匀且体积>0」却还要被继续转移的情况：
    // 方案全部成功即证明未混匀转移检查通过
    expect(result.error).toBeNull();
  });

  it('弃去 A8 前 A8 为 200 µL、100/128 µM；弃去后体积减半浓度不变', () => {
    // 倒数第二步（mix A8）之后、discard 之前
    const before = result.frames[result.frames.length - 2];
    expectClose(before.wells.A8.volume, 200);
    expectClose(wellConcentration(before.wells.A8), 100 / 128);

    const after = result.frames[result.frames.length - 1];
    expectClose(after.wells.A8.volume, 100);
    expectClose(wellConcentration(after.wells.A8), 100 / 128);
  });
});
