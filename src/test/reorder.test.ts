import { describe, expect, it } from 'vitest';
import { createDefaultProtocol } from '../engine/protocol';
import { simulate, wellConcentration } from '../engine/simulator';
import { expectClose, st } from './helpers';

/** 交换数组两项（模拟拖动重排） */
function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

describe('未混匀转移', () => {
  it('加样后未混匀直接转移 → UNMIXED_SOURCE，停在该步', () => {
    // A1 已有 100 µL 样本，再追加 100 µL 稀释液（不混匀），立刻转移
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('A1', 100, 0),
      st.transfer('A1', 'A2', 50)
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('UNMIXED_SOURCE');
    expect(r.error?.stepIndex).toBe(2);
    expect(r.error?.wells).toEqual(expect.arrayContaining(['A1', 'A2']));
    // 转移未发生
    expect(r.frames).toHaveLength(3);
    expect(r.frames[2].wells.A1.volume).toBe(200);
    expect(r.frames[2].wells.A2.volume).toBe(0);
  });

  it('混匀后再转移即成功，且按整体浓度等比例带走物质量', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.load('A1', 100, 0),
      st.mix('A1'),
      st.transfer('A1', 'A2', 50),
      st.mix('A2')
    ];
    const r = simulate(steps);
    expect(r.error).toBeNull();
    const final = r.frames[r.frames.length - 1];
    expectClose(wellConcentration(final.wells.A1), 50);
    expectClose(wellConcentration(final.wells.A2), 50);
  });

  it('转移到达目标孔后目标孔标记为未混匀', () => {
    const steps = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1'),
      st.transfer('A1', 'A2', 50),
      st.transfer('A2', 'A3', 25) // A2 没混匀
    ];
    const r = simulate(steps);
    expect(r.error?.code).toBe('UNMIXED_SOURCE');
    expect(r.error?.stepIndex).toBe(3);
  });
});

describe('步骤重排：系统按当前顺序从头重算，不保留旧结果', () => {
  it('把「混匀 A2」拖到「A2→A3 转移」之后 → 从未混匀的 A2 转移，被拦截', () => {
    const protocol = createDefaultProtocol();
    // index 10 是 mix A2，index 11 是 transfer A2->A3；
    // A2 在 index 9 接收了 A1 来液（mixed=false），交换后转移先执行
    const reordered = swap(protocol, 10, 11);
    const r = simulate(reordered);
    expect(r.error?.code).toBe('UNMIXED_SOURCE');
    expect(r.error?.stepIndex).toBe(10);
  });

  it('重排导致浓度链断裂：A1→A2 转移被拖到 A2→A3 转移之后', () => {
    const protocol = createDefaultProtocol();
    // index 9 是 transfer A1->A2，index 11 是 transfer A2->A3；
    // 抽出 9 后 A2->A3 位于 index 10，再把 A1->A2 插到它后面（index 11）
    const moved = [...protocol];
    const [t12] = moved.splice(9, 1);
    moved.splice(11, 0, t12);
    const r = simulate(moved);
    // A2 已混匀（mix A2 在前），先转移给 A3 的是 100 µL 纯稀释液；
    // 之后样本 S 才到达 A2 —— 样本永远过不了 A3，浓度链断裂，全程无报错
    expect(r.error).toBeNull();
    const last = r.frames[r.frames.length - 1];
    expectClose(wellConcentration(last.wells.A1), 100);
    expectClose(wellConcentration(last.wells.A2), 100);
    expectClose(wellConcentration(last.wells.A3), 0);
    expectClose(wellConcentration(last.wells.A4), 0);
  });

  it('删除混匀步骤后，紧随的转移必被 UNMIXED 拦截', () => {
    const protocol = createDefaultProtocol();
    // 删除原 index 10 的 mix A2：过滤后 transfer A1→A2 在新 index 9，
    // 紧接着 transfer A2→A3 在新 index 10，此时 A2 未混匀
    const withoutMixA2 = protocol.filter((_, i) => i !== 10);
    const r = simulate(withoutMixA2);
    expect(r.error?.code).toBe('UNMIXED_SOURCE');
    expect(r.error?.stepIndex).toBe(10);
  });

  it('同一步骤数组两次推演结果完全一致（无状态残留）', () => {
    const protocol = createDefaultProtocol();
    const r1 = simulate(protocol);
    const r2 = simulate(protocol);
    expect(r2.error).toBeNull();
    expect(r2.frames).toHaveLength(r1.frames.length);
    const f1 = r1.frames[r1.frames.length - 1];
    const f2 = r2.frames[r2.frames.length - 1];
    for (const id of Object.keys(f1.wells)) {
      expectClose(f2.wells[id].volume, f1.wells[id].volume);
      expectClose(wellConcentration(f2.wells[id]), wellConcentration(f1.wells[id]));
    }
  });

  it('失败后修正步骤再推演：新结果不包含旧失败（按当前顺序重算）', () => {
    const bad = [
      st.load('A1', 100, 100, 'S'),
      st.transfer('A1', 'A2', 150) // 空孔首装天然均匀；体积超余量 → EMPTY_ASPIRATE
    ];
    expect(simulate(bad).error?.code).toBe('EMPTY_ASPIRATE');

    const fixed = [
      st.load('A1', 100, 100, 'S'),
      st.mix('A1'),
      st.transfer('A1', 'A2', 50),
      st.mix('A2')
    ];
    const r = simulate(fixed);
    expect(r.error).toBeNull();
    expectClose(wellConcentration(r.frames[r.frames.length - 1].wells.A2), 100);
  });
});
