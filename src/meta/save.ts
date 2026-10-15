import type { CompanionId } from '../data/companions';
import { LEGACY_MATERIAL_IDS, type CurrencyId, type LootId, type MaterialId } from '../data/items';
import type { UltimateId } from '../data/skills';
import { NODE_BY_ID } from '../data/progression';
import { TUNING, type AdvanceMode, type PassPolicy } from '../config/tuning';
import type { WeaponId } from '../data/weapons';
import { ARMOR_DEFS, type ArmorId } from '../data/armor';
import { equippedArmorStats, equippedWeaponAttackMul } from './forge';

/**
 * 영구 저장 상태. 판 상태(RunState, sim/battle.ts)와 완전히 분리된다.
 * 판이 끝날 때 settlement.ts의 settleRun()만 이 객체를 바꾼다.
 */
export interface SaveData {
  version: 1;
  currencies: Record<CurrencyId, number>;
  materials: Partial<Record<MaterialId, number>>;
  blueprints: WeaponId[];
  /** 보유 무기와 강화 상태. fails: 목표 단계별 연속 실패 횟수(성공 시 초기화) */
  weapons: Partial<Record<WeaponId, { level: number; fails: Record<number, number> }>>;
  /** 보호구 설계도(깡깡이). 무기 설계도와 따로 둔다. */
  armorBlueprints: ArmorId[];
  /** 보유 보호구와 강화 상태(무기와 같은 구조) */
  armor: Partial<Record<ArmorId, { level: number; fails: Record<number, number> }>>;
  /**
   * 장비 슬롯. 보호구 머리·몸통·발 각 1칸(확정). 액세서리 1칸은 나비 제작 미구현이라 비어 있다
   * (액세서리 2칸·중복 금지·코스튬 별도칸 제안은 미승인이라 넣지 않음). 코스튬은 기존 그대로 별도 표시.
   */
  equipment: { weapon: WeaponId; head: ArmorId | null; body: ArmorId | null; feet: ArmorId | null; accessory: string | null; costume: string | null };
  flags: { forgeVisited: boolean };
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
  stats: { runs: number; clears: number; defeats: number; quits: number };
  /**
   * 진행 중인 판의 저널. 출격 즉시 기록하고, 영구 재화·재료를 주울 때마다 갱신·저장한다.
   * 정상 종료 정산과 같은 저장 쓰기에서 지워진다. 앱이 도중에 꺼져 남아 있으면 다음 실행 때 중도 종료로 정산한다.
   */
  activeRun: ActiveRun | null;
  settings: {
    advanceMode: AdvanceMode; passPolicy: PassPolicy; bgmVolume: number; sfxVolume: number;
    /** [시험] 캠프 위협 A/B 임시 적 등장 */
    campThreatTest: boolean;
    /** [시험] 적 공격의 상태이상(치료·처방 확인용). Ch 1 적 상태이상은 기획 미정 */
    statusTest: boolean;
  };
}

export interface ActiveRun {
  runId: number;
  chapterId: number;
  loot: Partial<Record<LootId, number>>;
  /**
   * 클리어 확정 뒤(최종 보스 처치 → 열쇠·감옥·구출 연출 중) 기록. 이 상태로 앱이 꺼지면 다음 실행 때
   * 중도 종료로 정산하지 않고 구출 완료 흐름(감옥 개방 → 정체 공개 → 결과)으로 돌아간다. 전투 재개는 없다.
   * 동료·클리어 보상은 감옥을 연 뒤 정산에서만 지급한다.
   */
  clearConfirmed?: { rescue: CompanionId | null; time: number; heroLevel: number; kills: { required: number; requiredTotal: number; children: number } };
}

export function newSave(): SaveData {
  return {
    version: 1,
    currencies: { nyangJelly: 0, goldenCatnip: 0, golgolGear: 0 },
    materials: {},
    blueprints: [],
    weapons: { starterGlove: { level: 0, fails: {} } },
    armorBlueprints: [],
    armor: {},
    equipment: { weapon: 'starterGlove', head: null, body: null, feet: null, accessory: null, costume: null },
    flags: { forgeVisited: false },
    rescued: [],
    clearedChapters: [],
    hardUnlocked: [],
    nodes: {},
    equippedUltimates: [],
    settledRunIds: [],
    nextRunId: 1,
    stats: { runs: 0, clears: 0, defeats: 0, quits: 0 },
    activeRun: null,
    settings: {
      advanceMode: TUNING.defaultAdvanceMode, passPolicy: TUNING.defaultPassPolicy, bgmVolume: 0.6, sfxVolume: 0.8,
      campThreatTest: true, statusTest: false,
    },
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
    const materials: Record<string, number> = { ...parsed.materials };
    for (const [oldId, newId] of Object.entries(LEGACY_MATERIAL_IDS)) {
      if (materials[oldId] !== undefined) {
        materials[newId] = (materials[newId] ?? 0) + materials[oldId];
        delete materials[oldId];
      }
    }
    const armor = { ...parsed.armor };
    const equipment = { ...base.equipment, ...parsed.equipment };
    // 보호구 이전 저장의 몸통·발 칸(문자열 자리)이나 보유하지 않은·다른 부위 장비는 비운다(능력치 중복·유령 장비 방지)
    for (const slot of ['head', 'body', 'feet'] as const) {
      const id = equipment[slot] as ArmorId | null;
      if (id && (!ARMOR_DEFS[id] || ARMOR_DEFS[id].slot !== slot || !armor[id])) equipment[slot] = null;
    }
    return {
      ...base,
      ...parsed,
      currencies: { ...base.currencies, ...parsed.currencies },
      materials: materials as SaveData['materials'],
      weapons: { ...base.weapons, ...parsed.weapons },
      armorBlueprints: [...(parsed.armorBlueprints ?? [])],
      armor,
      equipment,
      flags: { ...base.flags, ...parsed.flags },
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
  if (node.requiresRescue && !save.rescued.includes(node.requiresRescue)) return 'locked';
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
  passPolicy: PassPolicy;
  weapon: WeaponId;
  /** 장착 무기 기본 공격력·강화 보너스 배율 */
  weaponAttackMul: number;
  /** 영구 방어력 + 장비 방어력(판 임시 보너스는 전투 중 더한다) */
  defense: number;
  /** 코숏의 만능 처방약 해금(골골기어 영구 진화) */
  panacea: boolean;
  campThreatTest: boolean;
  statusTest: boolean;
  /**
   * 장착 보호구 능력치(출격 순간 한 번 계산). 최대 체력·방어는 위 maxHp·defense에 이미 합산,
   * 회피는 판 안 회피와 합쳐 상한 적용, 저항은 상태이상 시간·밀쳐내기·치명타(미정 옵션)에 쓴다.
   */
  armor: { maxHp: number; evasion: number; resist: { bleed: number; burn: number; freeze: number; slow: number; stun: number; knockback: number; critDamage: number } };
}

/** 장착 보호구의 방어 포인트 합(수치 TEMP). 영구 + 장비 + 판 임시 중 '장비' 몫. */
export function equipmentDefense(save: SaveData): number {
  return equippedArmorStats(save).total.defense;
}

/**
 * 출격 능력치. 저장을 읽기만 하는 순수 계산이라 몇 번 불러도 같은 값이다.
 * 보호구 최대 체력은 출격 때 최대 HP에 한 번만 더해지고, 판 중 장비 교체가 없어 재계산·재회복이 없다.
 */
export function buildLoadout(save: SaveData): Loadout {
  const armor = equippedArmorStats(save).total;
  return {
    maxHp: TUNING.player.maxHp + nodeLevel(save, 'hp') * 10 + armor.maxHp,
    damageMul: 1 + nodeLevel(save, 'atk') * 0.06,
    baseLuck: TUNING.player.baseLuck + nodeLevel(save, 'luck'),
    campMaxMental: TUNING.camp.maxMental + nodeLevel(save, 'campMental') * 15,
    ultimateEnabled: nodeLevel(save, 'ultSlot') > 0,
    ultimates: [...save.equippedUltimates].slice(0, TUNING.ultimate.maxEquipped),
    rescued: [...save.rescued],
    advanceMode: save.settings.advanceMode,
    passPolicy: save.settings.passPolicy,
    weapon: save.equipment.weapon,
    weaponAttackMul: equippedWeaponAttackMul(save),
    defense: TUNING.defense.base + nodeLevel(save, 'def') * TUNING.defense.perNodeLevel + equipmentDefense(save),
    panacea: nodeLevel(save, 'panacea') > 0,
    campThreatTest: save.settings.campThreatTest,
    statusTest: save.settings.statusTest,
    armor: {
      maxHp: armor.maxHp,
      evasion: armor.evasion,
      resist: { bleed: armor.bleed, burn: armor.burn, freeze: armor.freeze, slow: armor.slow, stun: armor.stun, knockback: armor.knockback, critDamage: armor.critDamage },
    },
  };
}
