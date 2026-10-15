import type { CompanionId } from '../data/companions';
import type { RunKills } from '../sim/battle';
import { LEGACY_MATERIAL_IDS, type CurrencyId, type LootId, type MaterialId } from '../data/items';
import type { UltimateId } from '../data/skills';
import { NODE_BY_ID } from '../data/progression';
import { TUNING, type PassPolicy } from '../config/tuning';
import type { WeaponId } from '../data/weapons';
import { ARMOR_DEFS, type ArmorId } from '../data/armor';
import { ACCESSORY_DEFS, ACCESSORY_SLOTS, type AccessoryId } from '../data/accessories';
import { equippedAccessoryStats, equippedArmorStats, equippedWeaponAttackMul } from './forge';
import { COSTUME_DEFS, type CostumeId } from '../data/costumes';
import { syncCostumeUnlocks } from './costume';

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
  /** 액세서리 설계도(나비). 시점 미정이라 정상 진행에서는 생기지 않는다. */
  accessoryBlueprints: AccessoryId[];
  /** 보유 액세서리와 강화 상태. 같은 아이템은 하나만 보유 */
  accessories: Partial<Record<AccessoryId, { level: number; fails: Record<number, number> }>>;
  /** 코스튬 도안(나비 옷장). 해금 조건은 나비 구출 전에도 기록한다. */
  costumeBlueprints: CostumeId[];
  /** 보유 코스튬(한 번 제작하면 영구 보유, 강화·등급 없음) */
  costumes: CostumeId[];
  /**
   * 장비 슬롯. 보호구 머리·몸통·발 각 1칸(확정). 액세서리는 종류 무관 2칸(확정), 같은 아이템 중복 불가.
   * costume: 착용 코스튬(null = 기본 모습). 외형 전용이라 능력치 계산(buildLoadout)에 쓰지 않는다.
   */
  equipment: { weapon: WeaponId; head: ArmorId | null; body: ArmorId | null; feet: ArmorId | null; accessories: (AccessoryId | null)[]; costume: CostumeId | null };
  /**
   * nabiFirstTalk: 나비 첫 대화(파자마 도안). pajamaFreeCraftUsed: 파자마 무료 제작 1회 사용.
   * starThreadGranted: 최종 챕터 최초 클리어 별빛 자수실 3개 지급 완료(중복 지급 방지).
   */
  flags: { forgeVisited: boolean; nabiFirstTalk: boolean; pajamaFreeCraftUsed: boolean; starThreadGranted: boolean };
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
    passPolicy: PassPolicy; bgmVolume: number; sfxVolume: number;
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
  clearConfirmed?: { rescue: CompanionId | null; time: number; heroLevel: number; kills: RunKills };
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
    accessoryBlueprints: [],
    accessories: {},
    costumeBlueprints: [],
    costumes: [],
    equipment: { weapon: 'starterGlove', head: null, body: null, feet: null, accessories: [null, null], costume: null },
    flags: { forgeVisited: false, nabiFirstTalk: false, pajamaFreeCraftUsed: false, starThreadGranted: false },
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
      passPolicy: TUNING.defaultPassPolicy, bgmVolume: 0.6, sfxVolume: 0.8,
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
    // 액세서리: 항상 2칸, 보유하지 않은·알 수 없는·같은 아이템 중복은 비운다(이전 저장의 accessory 1칸 자리는 버림)
    const accessories = { ...parsed.accessories };
    const accSlots: (AccessoryId | null)[] = [];
    const src = Array.isArray(equipment.accessories) ? equipment.accessories : [];
    for (let i = 0; i < ACCESSORY_SLOTS; i++) {
      const id = src[i] ?? null;
      accSlots.push(id && ACCESSORY_DEFS[id] && accessories[id] && !accSlots.includes(id) ? id : null);
    }
    equipment.accessories = accSlots;
    delete (equipment as { accessory?: unknown }).accessory;
    // 코스튬: 알 수 없는 id는 버리고, 보유하지 않은 코스튬을 입고 있으면 기본 모습으로(이전 저장의 문자열 자리 포함)
    const known = (x: unknown): x is CostumeId => typeof x === 'string' && x in COSTUME_DEFS;
    const costumeBlueprints = [...new Set((Array.isArray(parsed.costumeBlueprints) ? parsed.costumeBlueprints : []).filter(known))];
    const costumes = [...new Set((Array.isArray(parsed.costumes) ? parsed.costumes : []).filter(known))];
    if (!known(equipment.costume) || !costumes.includes(equipment.costume)) equipment.costume = null;
    const loaded: SaveData = {
      ...base,
      ...parsed,
      currencies: { ...base.currencies, ...parsed.currencies },
      materials: materials as SaveData['materials'],
      weapons: { ...base.weapons, ...parsed.weapons },
      armorBlueprints: [...(parsed.armorBlueprints ?? [])],
      armor,
      accessoryBlueprints: [...(parsed.accessoryBlueprints ?? [])],
      accessories,
      costumeBlueprints,
      costumes,
      equipment,
      flags: { ...base.flags, ...parsed.flags },
      stats: { ...base.stats, ...parsed.stats },
      settings: legacySettings({ ...base.settings, ...parsed.settings }),
      version: 1,
    };
    // 코스튬 추가 전 저장도 이미 채운 조건(Ch 1 클리어·코숏 구출 등)의 도안을 받는다. 진행은 초기화하지 않는다.
    syncCostumeUnlocks(loaded);
    return loaded;
  } catch {
    return base;
  }
}

/** 설정 정리: 폐기된 입력 유지 전진 설정(advanceMode)을 지운다. 진행 저장은 건드리지 않는다. */
function legacySettings(st: SaveData['settings'] & { advanceMode?: unknown }): SaveData['settings'] {
  const { advanceMode: _dropped, ...rest } = st;
  return rest;
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
  /**
   * 착용 액세서리 효과(출격 순간 한 번 계산). 최대 체력·방어·행운은 위 maxHp·defense·baseLuck에 이미 합산,
   * 나머지는 판 안 패시브와 합친 뒤 상한(TEMP)을 적용한다.
   */
  accessory: { attack: number; critChance: number; critDamage: number; attackSpeed: number; cooldown: number; regenInterval: number; energyRegen: number };
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
  const acc = equippedAccessoryStats(save);
  return {
    maxHp: TUNING.player.maxHp + nodeLevel(save, 'hp') * 10 + armor.maxHp + acc.maxHp,
    damageMul: 1 + nodeLevel(save, 'atk') * 0.06,
    baseLuck: TUNING.player.baseLuck + nodeLevel(save, 'luck') + acc.luck,
    campMaxMental: TUNING.camp.maxMental + nodeLevel(save, 'campMental') * 15,
    ultimateEnabled: nodeLevel(save, 'ultSlot') > 0,
    ultimates: [...save.equippedUltimates].slice(0, TUNING.ultimate.maxEquipped),
    rescued: [...save.rescued],
    passPolicy: save.settings.passPolicy,
    weapon: save.equipment.weapon,
    weaponAttackMul: equippedWeaponAttackMul(save),
    defense: TUNING.defense.base + nodeLevel(save, 'def') * TUNING.defense.perNodeLevel + equipmentDefense(save) + acc.defense,
    panacea: nodeLevel(save, 'panacea') > 0,
    campThreatTest: save.settings.campThreatTest,
    statusTest: save.settings.statusTest,
    armor: {
      maxHp: armor.maxHp,
      evasion: armor.evasion,
      resist: { bleed: armor.bleed, burn: armor.burn, freeze: armor.freeze, slow: armor.slow, stun: armor.stun, knockback: armor.knockback, critDamage: armor.critDamage },
    },
    accessory: {
      attack: acc.attack, critChance: acc.critChance, critDamage: acc.critDamage, attackSpeed: acc.attackSpeed,
      cooldown: acc.cooldown, regenInterval: acc.regenInterval, energyRegen: acc.energyRegen,
    },
  };
}
