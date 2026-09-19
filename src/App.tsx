import { useEffect, useMemo, useRef, useState } from 'react';
import { Plate } from './components/Plate';
import { StepEditor } from './components/StepEditor';
import { StepList } from './components/StepList';
import { createDefaultProtocol } from './engine/protocol';
import { clearProtocol, loadProtocol, saveProtocol } from './engine/storage';
import { simulate, wellConcentration } from './engine/simulator';
import type { ErrorCode, SimError, Step } from './engine/types';
import { LEGEND_STOPS } from './lib/color';
import { fmtConcentration, fmtVolume, wellSamples } from './lib/format';
import { blankStep, STEP_TYPE_LABEL } from './lib/steps';

const PLAY_INTERVAL_MS = 900;

const ERROR_LABEL: Record<ErrorCode, string> = {
  INVALID_STEP: '步骤数据无效',
  UNMIXED_SOURCE: '未混匀转移',
  EMPTY_ASPIRATE: '吸空',
  OVERFLOW: '溢出',
  CARRYOVER: '吸头跨样本带入'
};

interface AppProps {
  /** 连续播放每步间隔（ms），默认 900；测试可调小 */
  playIntervalMs?: number;
}

export default function App({ playIntervalMs = PLAY_INTERVAL_MS }: AppProps = {}) {
  const [steps, setSteps] = useState<Step[]>(() => loadProtocol());
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedWell, setSelectedWell] = useState<string | null>('A1');
  const [editingId, setEditingId] = useState<string | null>(null);
  const playTimer = useRef<number | null>(null);

  // 任何步骤变化都按当前顺序从空板重新推演（useMemo 丢弃旧帧）
  const result = useMemo(() => simulate(steps), [steps]);
  const { frames, error } = result;

  // 步骤变化 → 本地保存，并回到初始帧（不保留旧结果、旧播放位置）
  const firstRun = useRef(true);
  useEffect(() => {
    saveProtocol(steps);
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setPlaying(false);
    setFrameIndex(0);
  }, [steps]);

  const safeIndex = Math.min(frameIndex, frames.length - 1);
  const frame = frames[safeIndex] ?? frames[0]!;
  const applied = frame.applied;

  // 连续播放：推进到最后一个有效帧即停（失败时该帧正是错误步的前一状态）
  useEffect(() => {
    if (!playing) return undefined;
    if (safeIndex >= frames.length - 1) {
      setPlaying(false);
      return undefined;
    }
    playTimer.current = window.setTimeout(() => {
      setFrameIndex((i) => Math.min(i + 1, frames.length - 1));
    }, playIntervalMs);
    return () => {
      if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    };
  }, [playing, safeIndex, frames.length, playIntervalMs]);

  const maxConcentration = useMemo(() => {
    let m = 0;
    for (const f of frames) {
      for (const w of Object.values(f.wells)) {
        const c = wellConcentration(w);
        if (c > m) m = c;
      }
    }
    return m;
  }, [frames]);

  const knownGroups = useMemo(() => {
    const set = new Set<string>();
    for (const s of steps) {
      if (s.tip.kind === 'reuse' && s.tip.group.trim()) set.add(s.tip.group);
    }
    return [...set];
  }, [steps]);

  const reset = () => {
    setPlaying(false);
    setFrameIndex(0);
  };

  const stepOnce = () => {
    setPlaying(false);
    setFrameIndex((i) => Math.min(i + 1, frames.length - 1));
  };

  const updateStep = (next: Step) => {
    setSteps((ss) => ss.map((s) => (s.id === next.id ? next : s)));
  };

  const deleteStep = (id: string) => {
    setSteps((ss) => ss.filter((s) => s.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
  };

  const reorder = (from: number, to: number) => {
    setSteps((ss) => {
      const next = [...ss];
      const moved = next.splice(from, 1)[0];
      if (!moved) return ss;
      next.splice(to, 0, moved);
      return next;
    });
  };

  const addStep = (type: Step['type']) => {
    const created = blankStep(type, `step-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`);
    setSteps((ss) => [...ss, created]);
    setEditingId(created.id);
  };

  const restoreDefault = () => {
    if (!window.confirm('恢复为内置 A1→A8 二倍稀释方案？当前编辑将被覆盖。')) return;
    clearProtocol();
    setSteps(createDefaultProtocol());
    reset();
  };

  const selected = selectedWell ? frame.wells[selectedWell] : null;
  const failedIndex: number | null = error?.stepIndex ?? null;
  const stoppedAtFailure = error !== null && safeIndex === frames.length - 1;

  return (
    <div className="app">
      <header className="app-header">
        <h1>移液方案预演工具</h1>
        <span className="sub">96 孔板 · 单孔 200 µL · 上机前核对体积、浓度与吸头污染</span>
        <span className="spacer" />
        <button type="button" className="btn tiny" onClick={restoreDefault}>
          恢复内置方案
        </button>
      </header>

      <div className="layout">
        {/* 左：孔板 */}
        <section className="card" aria-label="孔板状态">
          <h2>
            孔板状态{error ? ' · 已停止' : applied === steps.length ? ' · 方案完成' : ''}
          </h2>

          {error && stoppedAtFailure && <ErrorBanner error={error} />}
          {!error && applied === steps.length && steps.length > 0 && (
            <div className="note-ok" role="status">
              ✓ 全部 {steps.length} 步执行成功，未发现吸空、溢出、未混匀转移或吸头带入。
            </div>
          )}

          <Plate
            frame={frame}
            maxConcentration={maxConcentration}
            error={stoppedAtFailure ? error : null}
            selectedWell={selectedWell}
            onSelectWell={setSelectedWell}
          />

          <div className="legend" aria-hidden>
            <span>浓度 低</span>
            <span className="ramp">
              {LEGEND_STOPS.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span>高（{fmtConcentration(maxConcentration)}）</span>
            <span>
              <span className="swatch" style={{ background: '#e7eaee' }} />
              纯稀释液
            </span>
            <span>孔内液位高度 = 体积（满刻度 200 µL）</span>
          </div>

          {selected && (
            <dl className="well-detail">
              <div>
                <dt>孔位</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>体积</dt>
                <dd>{fmtVolume(selected.volume)} µL</dd>
              </div>
              <div>
                <dt>浓度</dt>
                <dd>
                  {fmtConcentration(wellConcentration(selected))}
                  {selected.volume > 0 && !selected.mixed && (
                    <span className="tag warn" style={{ marginLeft: 6 }}>
                      未混匀
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>样本组成</dt>
                <dd>
                  {wellSamples(selected).length === 0
                    ? '—'
                    : wellSamples(selected)
                        .map((x) => x.sample)
                        .join('、')}
                </dd>
              </div>
            </dl>
          )}
        </section>

        {/* 右：播放与步骤 */}
        <section className="card" aria-label="播放与步骤编排">
          <h2>播放控制</h2>
          <div className="controls">
            <button
              type="button"
              className="btn"
              onClick={reset}
              disabled={safeIndex === 0}
            >
              ⏮ 重置
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setFrameIndex((i) => Math.max(i - 1, 0))}
              disabled={safeIndex === 0}
            >
              ◂ 上一步
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={stepOnce}
              disabled={safeIndex >= frames.length - 1}
            >
              单步执行 ▸
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setPlaying(true)}
              disabled={playing || safeIndex >= frames.length - 1}
            >
              {playing ? '播放中…' : '连续播放 ⏵'}
            </button>
            {playing && (
              <button type="button" className="btn" onClick={() => setPlaying(false)}>
                暂停
              </button>
            )}
          </div>

          <div className="controls">
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={safeIndex}
              aria-label="查看历史帧"
              onChange={(e) => {
                setPlaying(false);
                setFrameIndex(Number(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span className="progress">
              {applied} / {steps.length} 步
            </span>
          </div>

          {error && !stoppedAtFailure && (
            <div className="error-banner" data-testid="error-historical">
              注意：方案在第 {error.stepIndex + 1} 步「{ERROR_LABEL[error.code]}
              」失败；当前查看的是第 {applied} 步后的历史状态。
              <button
                type="button"
                className="btn tiny"
                style={{ marginLeft: 8 }}
                onClick={() => setFrameIndex(frames.length - 1)}
              >
                跳到失败处
              </button>
            </div>
          )}

          <h2 style={{ marginTop: 16 }}>步骤编排（可拖动排序）</h2>
          <div className="add-type-row">
            {(Object.keys(STEP_TYPE_LABEL) as Step['type'][]).map((t) => (
              <button key={t} type="button" className="btn" onClick={() => addStep(t)}>
                + {STEP_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {steps.length === 0 ? (
            <p className="sub" style={{ color: 'var(--muted)' }}>
              暂无步骤，请从上方添加。
            </p>
          ) : (
            <StepList
              steps={steps}
              applied={applied}
              failedIndex={stoppedAtFailure ? failedIndex : null}
              selectedId={null}
              editingId={editingId}
              onReorder={reorder}
              onSelect={(id) => setEditingId(id)}
              onEdit={setEditingId}
              onDelete={deleteStep}
            />
          )}

          {editingId &&
            (() => {
              const target = steps.find((s) => s.id === editingId);
              if (!target) return null;
              return (
                <StepEditor
                  step={target}
                  knownGroups={knownGroups}
                  onChange={updateStep}
                  onClose={() => setEditingId(null)}
                  onDelete={() => deleteStep(target.id)}
                />
              );
            })()}

          <TipResidue frameTips={frame.tips} />
        </section>
      </div>

      <p className="foot">
        数据自动保存在本浏览器 localStorage。推演始终从空板按当前步骤顺序重新计算；
        修改任意步骤后播放位置归零，旧结果不会保留。
      </p>
    </div>
  );
}

function ErrorBanner({ error }: { error: SimError }) {
  return (
    <div className="error-banner" role="alert" data-testid="error-banner">
      <div>
        <span className="code">✕ 第 {error.stepIndex + 1} 步失败：
        {ERROR_LABEL[error.code]}</span>
      </div>
      <div style={{ marginTop: 4 }}>{error.message}</div>
      <div className="wells">受影响孔：{error.wells.join('、')}</div>
      {error.residueSamples && error.residueSamples.length > 0 && (
        <div className="wells">外来样本：{error.residueSamples.join('、')}</div>
      )}
      <div className="wells">
        推演已停止；拖动上方滑块可回看此前 {error.stepIndex} 个有效步骤的状态。
      </div>
    </div>
  );
}

function TipResidue({ frameTips }: { frameTips: Record<string, string[]> }) {
  const groups = Object.entries(frameTips).filter(([, samples]) => samples.length > 0);
  return (
    <div className="tip-status">
      <strong>当前复用吸头状态</strong>
      <div style={{ marginTop: 4 }}>
        {groups.length === 0
          ? '所有复用吸头干净（或尚未使用）。'
          : groups.map(([group, samples]) => (
              <span className="group" key={group}>
                {group}：{samples.join('、')}
              </span>
            ))}
      </div>
    </div>
  );
}
