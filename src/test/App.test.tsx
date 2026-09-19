import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { STORAGE_KEY } from '../engine/storage';

function well(id: string) {
  return screen.getByRole('gridcell', { name: new RegExp(`^孔 ${id}，`) });
}

function mount(props: { playIntervalMs?: number } = {}) {
  return render(<App playIntervalMs={props.playIntervalMs} />);
}

describe('移液方案预演工具（组件集成）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始渲染：96 孔板空板 + 24 步默认方案，从 0 步开始', () => {
    mount();
    expect(screen.getAllByRole('gridcell')).toHaveLength(96);
    expect(screen.getAllByRole('listitem')).toHaveLength(24);
    expect(screen.getByText('0 / 24 步')).toBeInTheDocument();
    expect(well('A1')).toHaveAttribute('aria-label', expect.stringContaining('体积 0 µL'));
  });

  it('单步执行：第一步后 A1 为 200 µL、100 µM，其余孔为空', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /单步执行/ }));
    expect(well('A1')).toHaveAttribute('aria-label', expect.stringContaining('体积 200 µL'));
    expect(well('A1')).toHaveAttribute('aria-label', expect.stringContaining('100 µM'));
    expect(well('A2')).toHaveAttribute('aria-label', expect.stringContaining('体积 0 µL'));
    expect(screen.getByText('1 / 24 步')).toBeInTheDocument();
  });

  it('连续播放内置方案：全部成功，A8 最终为 100 µL、781.25 nM', () => {
    mount();
    const next = screen.getByRole('button', { name: /单步执行/ });
    for (let i = 0; i < 24; i += 1) fireEvent.click(next);

    expect(screen.getByRole('status')).toHaveTextContent(
      '全部 24 步执行成功'
    );
    expect(well('A1')).toHaveAttribute('aria-label', expect.stringContaining('体积 100 µL'));
    expect(well('A8')).toHaveAttribute('aria-label', expect.stringContaining('体积 100 µL'));
    expect(well('A8')).toHaveAttribute('aria-label', expect.stringContaining('781.25 nM'));
    // 空孔仍为空
    expect(well('H12')).toHaveAttribute('aria-label', expect.stringContaining('体积 0 µL'));
  });

  it('删除「混匀 A2」后执行：停在第 11 步（未混匀转移），指出 A2/A3，历史状态可回看', () => {
    mount();

    // 删除第 11 步 = 混匀 A2（9:mix A1, 10:transfer A1→A2, 11:mix A2）
    fireEvent.click(screen.getByRole('button', { name: '删除第 11 步' }));
    expect(screen.getByText('0 / 23 步')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: /单步执行/ });
    for (let i = 0; i < 23; i += 1) fireEvent.click(next);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('第 11 步失败');
    expect(banner).toHaveTextContent('未混匀转移');
    expect(banner).toHaveTextContent('A2');
    expect(banner).toHaveTextContent('A3');
    // 停在失败步之前：前 10 步成功，A2 已收到 A1 的 100 µL（共 200），
    // A3 仍是此前加入的 100 µL 纯稀释液
    expect(screen.getByText('10 / 23 步')).toBeInTheDocument();
    expect(well('A2')).toHaveAttribute('aria-label', expect.stringContaining('体积 200 µL'));
    expect(well('A3')).toHaveAttribute('aria-label', expect.stringContaining('体积 100 µL'));
    expect(well('A3')).toHaveAttribute('aria-label', expect.stringContaining('0 µM'));

    // 单步按钮已禁用，不能越过失败步
    expect(screen.getByRole('button', { name: /单步执行/ })).toBeDisabled();

    // 回看历史：拖回第 8 步（8 次加样完成，A1=200、A2 只有稀释液 100）
    const slider = screen.getByRole('slider', { name: '查看历史帧' });
    fireEvent.change(slider, { target: { value: '8' } });
    expect(screen.getByText('8 / 23 步')).toBeInTheDocument();
    expect(well('A2')).toHaveAttribute('aria-label', expect.stringContaining('体积 100 µL'));
  });

  it('编辑后按当前顺序重算、不保留旧结果：播放位置归零', () => {
    mount();
    // 先走三步
    fireEvent.click(screen.getByRole('button', { name: /单步执行/ }));
    fireEvent.click(screen.getByRole('button', { name: /单步执行/ }));
    fireEvent.click(screen.getByRole('button', { name: /单步执行/ }));
    expect(screen.getByText('3 / 24 步')).toBeInTheDocument();

    // 删除任一步骤 → 立即回到 0
    fireEvent.click(screen.getByRole('button', { name: '删除第 24 步' }));
    expect(screen.getByText('0 / 23 步')).toBeInTheDocument();
  });

  it('连续播放：自动逐帧推进到末尾并停止，无需逐次点击', async () => {
    mount({ playIntervalMs: 1 });
    fireEvent.click(screen.getByRole('button', { name: /连续播放/ }));
    await waitFor(
      () => expect(screen.getByText('24 / 24 步')).toBeInTheDocument(),
      { timeout: 2000 }
    );
    expect(screen.getByRole('status')).toHaveTextContent('全部 24 步执行成功');
    // 播放结束后单步按钮禁用，无法越过末帧
    expect(screen.getByRole('button', { name: /单步执行/ })).toBeDisabled();
  });

  it('步骤变更写入 localStorage，重新挂载后仍是编辑后的方案', () => {
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('button', { name: '删除第 24 步' }));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(saved).toHaveLength(23);

    unmount();
    mount();
    expect(screen.getAllByRole('listitem')).toHaveLength(23);
    expect(screen.getByText('0 / 23 步')).toBeInTheDocument();
  });

  it('溢出场景：追加向 A1 再加 200 µL 的步骤，执行停在 OVERFLOW', () => {
    mount();

    // 添加「加样/稀释液」步骤（默认目标 A1、体积 100）
    fireEvent.click(screen.getByRole('button', { name: /加样\/稀释液/ }));
    const editor = screen.getByTestId('step-editor');
    const volumeInput = within(editor).getByLabelText('体积 (µL)') as HTMLInputElement;
    fireEvent.change(volumeInput, { target: { value: '200' } });
    fireEvent.click(within(editor).getByRole('button', { name: '保存' }));
    expect(screen.getByText('0 / 25 步')).toBeInTheDocument();

    const next = screen.getByRole('button', { name: /单步执行/ });
    for (let i = 0; i < 25; i += 1) fireEvent.click(next);

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('溢出');
    expect(banner).toHaveTextContent('A1');
    // A1 在默认方案结束时为 100 µL（未溢出的有效状态保留）
    expect(well('A1')).toHaveAttribute('aria-label', expect.stringContaining('体积 100 µL'));
  });
});
