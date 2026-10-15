import type { CompanionId } from '../data/companions';
import type { CurrencyId, MaterialId } from '../data/items';
import type { UltimateId } from '../data/skills';
import { NODE_BY_ID } from '../data/progression';
import { TUNING, type AdvanceMode } from '../config/tuning';

/**
 * 영구 저장 상태. 판 상태(RunState, sim/battle.ts)와 완전히 분리된다.
 * 판이 끝날 때 settlement.ts의 settleRun()만 이 객체를 바꾼다.
 */
export interface SaveData {
  version: 1;
  currencies: Record<CurrencyId, number>;
  materials: Partial<Record<MaterialId, number>>;
  blueprints: string[];
  rescued: CompanionId[];
  /** 일반 난이도 최초 클리어한 챕터 */
  clearedChapters: number[];
  /** 해금된 고난도 챕터 (일반 클리어 시 해금, 고난도 자체는 미구현) */
  hardUnlocked: number[];
  nodes: Record<string, number>;
  equippedUltimates: UltimateId[];
  /** 중복 정산 방지: 이미 정산한 판 id */
  settledRunIds: number[];
  nextRunId: number;
  stats: { runs: number; clears: number; defeats: number };
  settings: { advanceMode: AdvanceMode; bgmVolume: number; sfxVolume: number };
}

export function newSave(): SaveData {
  return {
    version: 1,
    currencies: { nyangJelly: 0, goldenCatnip: 0, golgolGear: 0 },
    materials: {},
    blueprints: [],
    rescued: [],
    clearedChapters: [],
    hardUnlocked: [],
    nodes: {},
    equippedUltimates: [],
    settledRunIds: [],
    nextRunId: 1,
    stats: { runs: 0, clears: 0, defeats: 0 },
    settings: { advanceMode: TUNING.defaultAdvanceMode, bgmVolume: 0.6, sfxVolume: 0.8 },
  };
}

export interface SaveStorage {
  load(): string | null;
  store(raw: string): void;
  clear(): void;
}

const KEY = 'nyang-churu-save-v1';

export const localStorageAdapter: SaveStorage = {
  load: () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  store: (raw) => {
    try { localStorage.setItem(KEY, raw); } catch { /* 저장 불가 환경: 메모리로만 진행 */ }
  },
  clear: () => {
    try { localStorage.removeItem(KEY); } catch { /* noop */ }
  },
};

export function memoryStorage(): SaveStorage & { raw: string | null } {
  const s = {
    raw: null as string | null,
    load: () => s.raw,
    store: (raw: string) => { s.raw = raw; },
    clear: () => { s.raw = null; },
  };
  return s;
}

/** 깨진 값·이전 버전 저장도 기본값 위에 덮어써서 읽는다. */
export function loadSave(storage: SaveStorage): SaveData {
  const raw = storage.load();
  const base = newSave();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...parsed,
      currencies: { ...base.currencies, ...parsed.currencies },
      materials: { ...parsed.materials },
      stats: { ...base.stats, ...parsed.stats },
      settings: { ...base.settings, ...parsed.settings },
      version: 1,
    };
  } catch {
    return base;
  }
}

export function writeSave(storage: SaveStorage, save: SaveData): void {
  storage.store(JSON.stringify(save));
}

export function nodeLevel(save: SaveData, id: string): number {
  return save.nodes[id] ?? 0;
}

export type BuyResult = 'ok' | 'max' | 'locked' | 'poor';

export function canBuyNode(save: SaveData, id: string): BuyResult {
  const node = NODE_BY_ID[id];
  const lvl = nodeLevel(save, id);
  if (lvl >= node.maxLevel) return 'max';
  if (node.requires?.some((r) => nodeLevel(save, r) <= 0)) return 'locked';
  if (save.currencies[node.currency] < node.cost(lvl)) return 'poor';
  return 'ok';
}

export function buyNode(save: SaveData, id: string): BuyResult {
  const check = canBuyNode(save, id);
  if (check !== 'ok') return check;
  const node = NODE_BY_ID[id];
  const lvl = nodeLevel(save, id);
  save.currencies[node.currency] -= node.cost(lvl);
  save.nodes[id] = lvl + 1;
  if (node.unlocksUltimate && save.equippedUltimates.length < TUNING.ultimate.maxEquipped) {
    save.equippedUltimates.push(node.unlocksUltimate);
  }
  return 'ok';
}

/** 해금된 궁극기 장착 토글. 최대 3종. */
export function toggleUltimate(save: SaveData, id: UltimateId): boolean {
  if (nodeLevel(save, `ult_${id}`) <= 0) return false;
  const i = save.equippedUltimates.indexOf(id);
  if (i >= 0) { save.equippedUltimates.splice(i, 1); return true; }
  if (save.equippedUltimates.length >= TUNING.ultimate.maxEquipped) return false;
  save.equippedUltimates.push(id);
  return true;
}

/** 판 시작 시 영구 성장을 반영한 출격 능력치 */
export interface Loadout {
  maxHp: number;
  damageMul: number;
  baseLuck: number;
  campMaxMental: number;
  ultimateEnabled: boolean;
  ultimates: UltimateId[];
  rescued: CompanionId[];
  advanceMode: AdvanceMode;
}

export function buildLoadout(save: SaveData): Loadout {
  return {
    maxHp: TUNING.player.maxHp + nodeLevel(save, 'hp') * 10,
    damageMul: 1 + nodeLevel(save, 'atk') * 0.06,
    baseLuck: TUNING.player.baseLuck + nodeLevel(save, 'luck'),
    campMaxMental: TUNING.camp.maxMental + nodeLevel(save, 'campMental') * 15,
    ultimateEnabled: nodeLevel(save, 'ultSlot') > 0,
    ultimates: [...save.equippedUltimates].slice(0, TUNING.ultimate.maxEquipped),
    rescued: [...save.rescued],
    advanceMode: save.settings.advanceMode,
  };
}
