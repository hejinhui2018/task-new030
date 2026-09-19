import { ALL_WELL_IDS, isWellId, WELL_CAPACITY } from './plate';
import type {
  SimError,
  SimFrame,
  SimResult,
  Step,
  WellId,
  WellState
} from './types';

/** 浮点比较容差（µM·µL 量级的物质量） */
const EPS = 1e-7;

function emptyWell(id: WellId): WellState {
  return { id, volume: 0, amounts: {}, mixed: true };
}

function initialWells(): Record<WellId, WellState> {
  const wells: Record<WellId, WellState> = {};
  for (const id of ALL_WELL_IDS) {
    wells[id] = emptyWell(id);
  }
  return wells;
}

function cloneWells(wells: Record<WellId, WellState>): Record<WellId, WellState> {
  const next: Record<WellId, WellState> = {};
  for (const id of Object.keys(wells)) {
    const w = wells[id]!;
    next[id] = { ...w, amounts: { ...w.amounts } };
  }
  return next;
}

/** 孔位经过 validateStepShape 校验后一定存在 */
function at(wells: Record<WellId, WellState>, id: WellId): WellState {
  return wells[id]!;
}

/** 孔内当前浓度（µM）；空孔为 0 */
export function wellConcentration(well: WellState): number {
  if (well.volume <= EPS) return 0;
  return wellTotalAmount(well) / well.volume;
}

export function wellTotalAmount(well: WellState): number {
  return Object.values(well.amounts).reduce((sum, a) => sum + a, 0);
}

function sampleSet(well: WellState): Set<string> {
  const set = new Set<string>();
  for (const [sample, amount] of Object.entries(well.amounts)) {
    if (amount > EPS) set.add(sample);
  }
  return set;
}

/** 板上所有孔的物质量总和（µM·µL）——质量守恒测试用 */
export function plateTotalAmount(wells: Record<WellId, WellState>): number {
  return Object.values(wells).reduce((sum, w) => sum + wellTotalAmount(w), 0);
}

export function plateTotalVolume(wells: Record<WellId, WellState>): number {
  return Object.values(wells).reduce((sum, w) => sum + w.volume, 0);
}

/** 步骤数据本身是否合法（孔位、体积等），返回错误信息（空数组 = 合法） */
export function validateStepShape(step: Step): string[] {
  const errors: string[] = [];
  const num = (v: number) => typeof v === 'number' && Number.isFinite(v);

  switch (step.type) {
    case 'load':
      if (!isWellId(step.target)) errors.push('目标孔位无效');
      if (!num(step.volume) || step.volume <= 0) errors.push('加入体积必须大于 0');
      if (!num(step.concentration) || step.concentration < 0)
        errors.push('浓度不能为负');
      if (step.concentration > 0 && !step.sample.trim())
        errors.push('样本必须命名');
      if (step.volume > WELL_CAPACITY + EPS)
        errors.push(`单孔容量上限为 ${WELL_CAPACITY} µL`);
      break;
    case 'mix':
      if (!isWellId(step.target)) errors.push('目标孔位无效');
      break;
    case 'transfer':
      if (!isWellId(step.source)) errors.push('源孔位无效');
      if (!isWellId(step.target)) errors.push('目标孔位无效');
      if (step.source === step.target) errors.push('源孔与目标孔不能相同');
      if (!num(step.volume) || step.volume <= 0) errors.push('转移体积必须大于 0');
      break;
    case 'discard':
      if (!isWellId(step.source)) errors.push('源孔位无效');
      if (!num(step.volume) || step.volume <= 0) errors.push('弃去体积必须大于 0');
      break;
  }

  if (step.tip.kind === 'reuse' && !step.tip.group.trim())
    errors.push('复用吸头必须指定组名');

  return errors;
}

function fail(
  stepIndex: number,
  code: SimError['code'],
  message: string,
  wells: WellId[],
  residueSamples?: string[]
): SimError {
  return { stepIndex, code, message, wells, residueSamples };
}

/** 各步骤涉及的孔位（报错时展示） */
function involvedWells(step: Step): WellId[] {
  switch (step.type) {
    case 'load':
    case 'mix':
      return [step.target];
    case 'transfer':
      return [step.source, step.target];
    case 'discard':
      return [step.source];
  }
}

/**
 * 按当前步骤顺序从空板开始推演。
 * 返回每一步成功后的帧；遇到首个失败立即停止，失败步不产生帧。
 */
export function simulate(steps: Step[]): SimResult {
  let wells = initialWells();
  const tips: Record<string, string[]> = {};
  const frames: SimFrame[] = [
    { applied: 0, wells, tips: {}, changedWells: [] }
  ];

  for (const [i, step] of steps.entries()) {
    const shapeErrors = validateStepShape(step);
    if (shapeErrors.length > 0) {
      return {
        frames,
        error: fail(i, 'INVALID_STEP', shapeErrors.join('；'), involvedWells(step))
      };
    }

    // 复用吸头：取该组吸头上此前残留的样本（新吸头永远干净、用后弃去）
    const tip = step.tip;
    const reused = tip.kind === 'reuse';
    const groupName = tip.kind === 'reuse' ? tip.group : '';
    const residue = reused ? [...(tips[groupName] ?? [])] : [];
    const touch = (well: WellState, incoming: string[] = []): SimError | null => {
      if (!reused) return null;
      const present = sampleSet(well);
      for (const s of incoming) present.add(s);
      const foreign = residue.filter((s) => !present.has(s));
      return foreign.length > 0
        ? fail(
            i,
            'CARRYOVER',
            `复用吸头（组「${groupName}」）上残留 ${foreign.join('、')}，接触 ${well.id} 时会带入该样本`,
            [well.id],
            foreign
          )
        : null;
    };
    const pickUp = (well: WellState) => {
      if (!reused) return;
      for (const s of sampleSet(well)) {
        if (!residue.includes(s)) residue.push(s);
      }
    };

    wells = cloneWells(wells);
    let changed: WellId[] = [];

    if (step.type === 'load') {
      const w = at(wells, step.target);
      if (w.volume + step.volume > WELL_CAPACITY + EPS) {
        return {
          frames,
          error: fail(
            i,
            'OVERFLOW',
            `${w.id} 将溢出：现有 ${fmt(w.volume)} µL + 加入 ${fmt(step.volume)} µL 超过 ${WELL_CAPACITY} µL`,
            [w.id]
          )
        };
      }
      const contamination = touch(
        w,
        step.concentration > 0 ? [step.sample] : []
      );
      if (contamination) return { frames, error: contamination };

      if (step.concentration > 0) {
        w.amounts[step.sample] =
          (w.amounts[step.sample] ?? 0) + step.volume * step.concentration;
      }
      w.volume += step.volume;
      // 空孔进液天然均匀；向已有液体加注后必须重新混匀
      w.mixed = w.volume - step.volume <= EPS;
      pickUp(w);
      changed = [w.id];
    } else if (step.type === 'mix') {
      const w = at(wells, step.target);
      if (w.volume <= EPS) {
        return {
          frames,
          error: fail(i, 'INVALID_STEP', `${w.id} 内没有液体，无法混匀`, [w.id])
        };
      }
      const contamination = touch(w);
      if (contamination) return { frames, error: contamination };
      w.mixed = true;
      pickUp(w);
      changed = [w.id];
    } else if (step.type === 'transfer') {
      const src = at(wells, step.source);
      const dst = at(wells, step.target);

      if (!src.mixed) {
        return {
          frames,
          error: fail(
            i,
            'UNMIXED_SOURCE',
            `${src.id} 尚未混匀，吸出的液体不能代表当前浓度，请先混匀再转移`,
            [src.id, dst.id]
          )
        };
      }
      if (step.volume > src.volume + EPS) {
        return {
          frames,
          error: fail(
            i,
            'EMPTY_ASPIRATE',
            `${src.id} 将被吸空：需要 ${fmt(step.volume)} µL，仅剩 ${fmt(src.volume)} µL`,
            [src.id, dst.id]
          )
        };
      }
      // 吸液动作先发生：脏吸头只在吸液阶段对照源孔检查。
      // 吸入的就是源孔液体，随后注入目标孔是预期内的转移（稀释链靠它传播），
      // 因此目标孔不再单独判带入。
      const srcContamination = touch(src);
      if (srcContamination) return { frames, error: srcContamination };
      if (dst.volume + step.volume > WELL_CAPACITY + EPS) {
        return {
          frames,
          error: fail(
            i,
            'OVERFLOW',
            `${dst.id} 将溢出：现有 ${fmt(dst.volume)} µL + 注入 ${fmt(step.volume)} µL 超过 ${WELL_CAPACITY} µL`,
            [src.id, dst.id]
          )
        };
      }

      // 按源孔当前组成等比例移走物质量
      const ratio = step.volume / src.volume;
      for (const [sample, amount] of Object.entries(src.amounts)) {
        const moved = amount * ratio;
        src.amounts[sample] = amount - moved;
        dst.amounts[sample] = (dst.amounts[sample] ?? 0) + moved;
      }
      src.volume -= step.volume;
      dst.volume += step.volume;
      dst.mixed = false;
      pickUp(src);
      pickUp(dst);
      changed = [src.id, dst.id];
    } else {
      // discard
      const src = at(wells, step.source);
      if (step.volume > src.volume + EPS) {
        return {
          frames,
          error: fail(
            i,
            'EMPTY_ASPIRATE',
            `${src.id} 将被吸空：需要弃去 ${fmt(step.volume)} µL，仅剩 ${fmt(src.volume)} µL`,
            [src.id]
          )
        };
      }
      const contamination = touch(src);
      if (contamination) return { frames, error: contamination };

      const ratio = step.volume / src.volume;
      for (const [sample, amount] of Object.entries(src.amounts)) {
        src.amounts[sample] = amount - amount * ratio;
      }
      src.volume -= step.volume;
      pickUp(src);
      changed = [src.id];
    }

    if (tip.kind === 'reuse') {
      tips[tip.group] = residue;
    }
    frames.push({
      applied: i + 1,
      wells,
      tips: JSON.parse(JSON.stringify(tips)) as Record<string, string[]>,
      changedWells: changed
    });
  }

  return { frames, error: null };
}

function fmt(v: number): string {
  return `${Math.round(v * 100) / 100}`;
}
