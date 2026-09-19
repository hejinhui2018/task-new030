/**
 * 移液方案预演引擎 —— 类型定义
 *
 * 设计原则：引擎是纯函数，不依赖 React/DOM。
 * 给定步骤数组，simulate() 从空板开始逐帧推演，绝不保留旧结果。
 */

/** 孔位编号，A1..H12 */
export type WellId = string;

/** 样本标识（二倍稀释全程是同一个样本，复用吸头时靠它识别跨样本带入） */
export type SampleId = string;

/** 吸头策略：每步新吸头，或复用某个命名组内的吸头 */
export type TipMode =
  | { kind: 'new' }
  | { kind: 'reuse'; group: string };

interface StepBase {
  id: string;
  /** 该步使用的吸头策略 */
  tip: TipMode;
  /** 备注，仅用于展示 */
  note?: string;
}

/** 向孔内加入液体：样本（concentration > 0，需命名）或稀释液（concentration = 0） */
export interface LoadStep extends StepBase {
  type: 'load';
  target: WellId;
  volume: number;
  concentration: number;
  sample: string;
}

/** 混匀指定孔（在孔内吹打） */
export interface MixStep extends StepBase {
  type: 'mix';
  target: WellId;
}

/** 从 source 吸取 volume µL 并注入 target */
export interface TransferStep extends StepBase {
  type: 'transfer';
  source: WellId;
  target: WellId;
  volume: number;
}

/** 从 source 弃去 volume µL（到废液缸） */
export interface DiscardStep extends StepBase {
  type: 'discard';
  source: WellId;
  volume: number;
}

export type Step = LoadStep | MixStep | TransferStep | DiscardStep;

/** 单个孔的状态。amounts 按样本记录物质量（µM·µL），浓度恒等于 sum(amounts)/volume */
export interface WellState {
  id: WellId;
  volume: number;
  amounts: Record<SampleId, number>;
  /** 内容物是否均匀；进液后变 false，混匀后变 true */
  mixed: boolean;
}

export type ErrorCode =
  | 'INVALID_STEP'
  | 'UNMIXED_SOURCE'
  | 'EMPTY_ASPIRATE'
  | 'OVERFLOW'
  | 'CARRYOVER';

/** 首次失败：推演停在这一步，不产生该步之后的任何帧 */
export interface SimError {
  stepIndex: number;
  code: ErrorCode;
  message: string;
  /** 受影响孔位 */
  wells: WellId[];
  /** 吸头带入场景：残留在吸头上的外来样本 */
  residueSamples?: SampleId[];
}

/**
 * 一帧孔板快照。frames[i] 表示已成功执行前 i 个步骤后的状态：
 * frames[0] 是空板，步骤 steps[i-1] 成功后得到 frames[i]。
 */
export interface SimFrame {
  /** 已成功执行的步骤数 */
  applied: number;
  wells: Record<WellId, WellState>;
  /** 各复用吸头组当前吸头上残留的样本 id */
  tips: Record<string, SampleId[]>;
  /** 本帧相对上一帧发生变化的孔（用于高亮） */
  changedWells: WellId[];
}

export interface SimResult {
  frames: SimFrame[];
  /** 首个失败步骤；null 表示全部成功 */
  error: SimError | null;
}
