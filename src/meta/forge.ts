import { ENHANCE_RULES, ENHANCE_TABLE, SPECIAL_REWARDS, WEAPON_DEFS, enhanceAttackBonus, type MaterialCount, type WeaponId } from '../data/weapons';
import type { MaterialId } from '../data/items';
import type { SaveData } from './save';

/**
 * 대장간: 설계도 → 제작 → 강화 → 장착. 냥젤리 비용 없음, 실제 재료만 소모.
 * 대장간은 깡깡이 구출(Ch 2) 이후 열린다. 미래 시설을 미리 열지 않는다.
 */

export function forgeUnlocked(save: SaveData): boolean {
  return save.rescued.includes('kangkang');
}

/** 대장간 첫 방문: 장갑·검 설계도 함께 지급(1회) */
export function visitForge(save: SaveData): WeaponId[] {
  if (!forgeUnlocked(save) || save.flags.forgeVisited) return [];
  save.flags.forgeVisited = true;
  const granted: WeaponId[] = [];
  for (const def of Object.values(WEAPON_DEFS)) {
    if (def.blueprint.kind === 'forgeFirstVisit' && !save.blueprints.includes(def.id)) {
      save.blueprints.push(def.id);
      granted.push(def.id);
    }
  }
  return granted;
}

/** 일반 난도 최초 클리어 설계도 */
export function firstClearBlueprints(chapter: number): WeaponId[] {
  return Object.values(WEAPON_DEFS)
    .filter((d) => d.blueprint.kind === 'firstClear' && d.blueprint.chapter === chapter)
    .map((d) => d.id);
}

/** 클리어 1회분 특별 재료(행운 미적용, 매 클리어 1개) */
export function specialClearRewards(chapter: number, difficulty: 'normal' | 'hard', mainCh8Cleared: boolean): MaterialId[] {
  return SPECIAL_REWARDS
    .filter((r) => r.difficulty === difficulty && r.chapters.includes(chapter) && (!r.requiresCh8 || mainCh8Cleared))
    .map((r) => r.material);
}

const have = (save: SaveData, m: MaterialCount) => (save.materials[m.id] ?? 0) >= m.count;
const spend = (save: SaveData, list: MaterialCount[]) => {
  for (const m of list) save.materials[m.id] = (save.materials[m.id] ?? 0) - m.count;
};

export type CraftCheck = 'ok' | 'forgeLocked' | 'noBlueprint' | 'owned' | 'materials';

export function canCraft(save: SaveData, id: WeaponId): CraftCheck {
  const def = WEAPON_DEFS[id];
  if (!forgeUnlocked(save)) return 'forgeLocked';
  if (!save.blueprints.includes(id)) return 'noBlueprint';
  if (save.weapons[id]) return 'owned';
  if (!def.craft.every((m) => have(save, m))) return 'materials';
  return 'ok';
}

export function craftWeapon(save: SaveData, id: WeaponId): CraftCheck {
  const c = canCraft(save, id);
  if (c !== 'ok') return c;
  spend(save, WEAPON_DEFS[id].craft);
  save.weapons[id] = { level: 0, fails: {} };
  return 'ok';
}

export interface EnhanceInfo {
  level: number;
  target: number | null;
  baseRate: number;
  rate: number;
  fails: number;
  /** 확정 성공까지 남은 실패 횟수(0이면 다음 시도 확정) */
  pityLeft: number;
  material: MaterialCount | null;
  specials: MaterialCount[];
  blocker: null | 'max' | 'notOwned' | 'notEnhanceable' | 'forgeLocked' | 'material' | 'special';
}

export function enhanceInfo(save: SaveData, id: WeaponId): EnhanceInfo {
  const def = WEAPON_DEFS[id];
  const w = save.weapons[id];
  const level = w?.level ?? 0;
  const row = ENHANCE_TABLE[level];
  const base: EnhanceInfo = { level, target: row?.target ?? null, baseRate: row?.rate ?? 0, rate: 0, fails: 0, pityLeft: 0, material: null, specials: [], blocker: null };
  if (!w) return { ...base, blocker: 'notOwned' };
  if (!def.enhanceMaterial) return { ...base, blocker: 'notEnhanceable' };
  if (!row) return { ...base, blocker: 'max' };
  const fails = w.fails[row.target] ?? 0;
  const pity = fails >= ENHANCE_RULES.pityAfterFails;
  const rate = pity ? 1 : Math.min(1, row.rate + ENHANCE_RULES.failBonus * fails);
  const material = { id: def.enhanceMaterial, count: row.material };
  const specials = row.target === 5 ? def.special5 : row.target === 10 ? def.special10 : [];
  let blocker: EnhanceInfo['blocker'] = null;
  if (!forgeUnlocked(save)) blocker = 'forgeLocked';
  else if (!have(save, material)) blocker = 'material';
  else if (!specials.every((m) => have(save, m))) blocker = 'special';
  return { ...base, rate, fails, pityLeft: Math.max(0, ENHANCE_RULES.pityAfterFails - fails), material, specials, blocker };
}

export interface EnhanceResult { attempted: boolean; success: boolean; info: EnhanceInfo; newLevel: number }

/**
 * 강화 1회 시도. 실패: 기본 재료만 소모, 단계·특별 재료 보존, 실패 기록 +1(저장).
 * 성공: 기본 재료 + 특별 재료 소모, 해당 단계 실패 기록 초기화. +5 유니크·+10 전설(추가 추첨 없음).
 */
export function enhanceWeapon(save: SaveData, id: WeaponId, roll: () => number): EnhanceResult {
  const info = enhanceInfo(save, id);
  if (info.blocker || !info.material || info.target === null) return { attempted: false, success: false, info, newLevel: info.level };
  const w = save.weapons[id]!;
  spend(save, [info.material]);
  const success = roll() < info.rate;
  if (success) {
    spend(save, info.specials);
    w.level = info.target;
    delete w.fails[info.target];
  } else {
    w.fails[info.target] = info.fails + 1;
  }
  return { attempted: true, success, info, newLevel: w.level };
}

export type EquipCheck = 'ok' | 'notOwned' | 'notCombatReady';

/** 캠프에서만 호출. 판 중 교체 없음. */
export function equipWeapon(save: SaveData, id: WeaponId): EquipCheck {
  if (!save.weapons[id]) return 'notOwned';
  if (!WEAPON_DEFS[id].combatReady) return 'notCombatReady';
  save.equipment.weapon = id;
  return 'ok';
}

/** 장착 무기의 공격력 배율(TEMP: 무기 기본 공격력 20을 기준 1.0으로 환산) */
export function equippedWeaponAttackMul(save: SaveData): number {
  const id = save.equipment.weapon;
  const lvl = save.weapons[id]?.level ?? 0;
  return (WEAPON_DEFS[id].baseAttack / 20) * (1 + enhanceAttackBonus(lvl));
}
