import type { Step } from './types';
import { createDefaultProtocol } from './protocol';

const STORAGE_KEY = 'pipette-sandbox:protocol:v1';
export { STORAGE_KEY };

/** 读取本地保存的步骤；不存在或损坏时回退到内置 A1–A8 方案 */
export function loadProtocol(): Step[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProtocol();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createDefaultProtocol();
    return parsed as Step[];
  } catch {
    return createDefaultProtocol();
  }
}

export function saveProtocol(steps: Step[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
  } catch {
    // 隐私模式或存储已满：忽略，本次会话仍可使用
  }
}

export function clearProtocol(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
