import { ENHANCE_RULES, ENHANCE_TABLE, SPECIAL_REWARDS, WEAPON_DEFS, enhanceAttackBonus, type MaterialCount, type WeaponId } from '../data/weapons';
import { ARMOR_DEFS, ARMOR_IDS, ARMOR_SPECIAL_REWARDS, armorStatsAt, emptyArmorStats, type ArmorId, type ArmorSlot, type ArmorStats } from '../data/armor';
import type { MaterialId } from '../data/items';
import type { SaveData } from './save';
import { TUNING } from '../config/tuning';

/**
 * 대장간: 설계도 → 제작 → 강화 → 장착. 냥젤리 비용 없음, 실제 재료만 소모.
 * 대장간은 깡깡이 구출(Ch 2) 이후 열린다. 미래 시설을 미리 열지 않는다.
 */

export function forgeUnlocked(save: SaveData): boolean {
  return save.rescued.includes('kangkang');
}

/**
 * 대장간 첫 방문: 장갑·검 설계도와 누빔모자·누빔조끼 설계도 지급(각 1회).
 * 보호구 추가 전에 이미 방문한 저장도 다음 방문 때 보호구 설계도만 받는다(중복 없음).
 */
export function visitForge(save: SaveData): (WeaponId | ArmorId)[] {
  if (!forgeUnlocked(save)) return [];
  const granted: (WeaponId | ArmorId)[] = [];
  if (!save.flags.forgeVisited) {
    save.flags.forgeVisited = true;
    for (const def of Object.values(WEAPON_DEFS)) {
      if (def.blueprint.kind === 'forgeFirstVisit' && !save.blueprints.includes(def.id)) {
        save.blueprints.push(def.id);
        granted.push(def.id);
      }
    }
  }
  for (const def of Object.values(ARMOR_DEFS)) {
    if (def.blueprint.kind === 'forgeFirstVisit' && !save.armorBlueprints.includes(def.id)) {
      save.armorBlueprints.push(def.id);
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

/** 일반 난도 최초 클리어 보호구 설계도(확정: 탐험헬멧 Ch 4). 설계도 시점 미정 장비는 여기로 나오지 않는다. */
export function firstClearArmorBlueprints(chapter: number): ArmorId[] {
  return Object.values(ARMOR_DEFS)
    .filter((d) => d.blueprint.kind === 'firstClear' && d.blueprint.chapter === chapter)
    .map((d) => d.id);
}

/** 클리어 1회분 특별 재료(무기·보호구 공통, 행운 미적용, 매 클리어 재료당 1개) */
export function specialClearRewards(chapter: number, difficulty: 'normal' | 'hard', mainCh8Cleared: boolean): MaterialId[] {
  const out = [...SPECIAL_REWARDS, ...ARMOR_SPECIAL_REWARDS]
    .filter((r) => r.difficulty === difficulty && r.chapters.includes(chapter) && (!r.requiresCh8 || mainCh8Cleared))
    .map((r) => r.material);
  return [...new Set(out)];
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

interface Enhanceable { enhanceMaterial: MaterialId | null; special5: MaterialCount[]; special10: MaterialCount[] }
interface EnhanceState { level: number; fails: Record<number, number> }

export function enhanceInfo(save: SaveData, id: WeaponId): EnhanceInfo {
  return enhanceInfoFor(save, WEAPON_DEFS[id], save.weapons[id]);
}

/** 무기·보호구 공통 강화 판정(성공률·소모량·실패 보정·10회 보장은 무기 공통표) */
function enhanceInfoFor(save: SaveData, def: Enhanceable, w: EnhanceState | undefined): EnhanceInfo {
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
  return enhanceFor(save, WEAPON_DEFS[id], save.weapons[id], roll);
}

function enhanceFor(save: SaveData, def: Enhanceable, state: EnhanceState | undefined, roll: () => number): EnhanceResult {
  const info = enhanceInfoFor(save, def, state);
  if (info.blocker || !info.material || info.target === null || !state) return { attempted: false, success: false, info, newLevel: info.level };
  const w = state;
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

// ───────────────────────── 보호구(깡깡이)

export function canCraftArmor(save: SaveData, id: ArmorId): CraftCheck {
  const def = ARMOR_DEFS[id];
  if (!forgeUnlocked(save)) return 'forgeLocked';
  if (!save.armorBlueprints.includes(id)) return 'noBlueprint';
  if (save.armor[id]) return 'owned';
  if (!def.craft.every((x) => have(save, x))) return 'materials';
  return 'ok';
}

/** 보호구 제작. 무기와 같은 재료 창고에서 확정 수량만큼 소모한다. */
export function craftArmor(save: SaveData, id: ArmorId): CraftCheck {
  const c = canCraftArmor(save, id);
  if (c !== 'ok') return c;
  spend(save, ARMOR_DEFS[id].craft);
  save.armor[id] = { level: 0, fails: {} };
  return 'ok';
}

export function armorEnhanceInfo(save: SaveData, id: ArmorId): EnhanceInfo {
  return enhanceInfoFor(save, ARMOR_DEFS[id], save.armor[id]);
}

/** 보호구 강화 1회. 규칙은 무기와 같고(실패 시 기본 재료만, 특별 재료는 성공 시), 효과만 보호구 표를 쓴다. */
export function enhanceArmor(save: SaveData, id: ArmorId, roll: () => number): EnhanceResult {
  return enhanceFor(save, ARMOR_DEFS[id], save.armor[id], roll);
}

/** 캠프에서만 호출. 같은 부위 1칸이라 기존 장비는 자동으로 빠진다. */
export function equipArmor(save: SaveData, id: ArmorId): 'ok' | 'notOwned' {
  if (!save.armor[id]) return 'notOwned';
  save.equipment[ARMOR_DEFS[id].slot] = id;
  return 'ok';
}

export function unequipArmor(save: SaveData, slot: ArmorSlot): void {
  save.equipment[slot] = null;
}

/**
 * 장착 보호구 합산 능력치. 저장 값을 읽기만 하며 몇 번 불러도 같다(장착·해제·로드 반복으로 누적되지 않음).
 * 같은 부위 중복 장착은 구조상 불가(부위당 1칸), 보유하지 않은 장비 id는 무시한다.
 * 저항 합산 방식·상한은 미정이라 여기서는 종류별 원값 목록만 모으고 combineResist()로 합친다.
 */
export function equippedArmorStats(save: SaveData): { total: ArmorStats; resistParts: Record<string, number[]> } {
  const total = emptyArmorStats();
  const resistParts: Record<string, number[]> = {};
  for (const slot of ['head', 'body', 'feet'] as ArmorSlot[]) {
    const id = save.equipment[slot];
    if (!id || !ARMOR_IDS.includes(id) || ARMOR_DEFS[id].slot !== slot) continue;
    const st = save.armor[id];
    if (!st) continue;
    const s = armorStatsAt(id, st.level);
    total.maxHp += s.maxHp;
    total.defense += s.defense;
    total.evasion += s.evasion;
    for (const k of ['bleed', 'burn', 'freeze', 'slow', 'stun', 'knockback', 'critDamage'] as const) {
      if (s[k] > 0) (resistParts[k] ??= []).push(s[k]);
    }
  }
  for (const k of ['bleed', 'burn', 'freeze', 'slow', 'stun', 'knockback', 'critDamage'] as const) total[k] = combineResist(resistParts[k] ?? []);
  return { total, resistParts };
}

/** 미정 옵션: 같은 종류 저항 합산(TUNING.undecided.resist). 결과는 0~상한. */
export function combineResist(parts: number[], opts: { stacking: 'additive' | 'multiplicative'; cap: number } = TUNING.undecided.resist): number {
  if (!parts.length) return 0;
  const raw = opts.stacking === 'additive' ? parts.reduce((a, b) => a + b, 0) : 1 - parts.reduce((a, b) => a * (1 - b), 1);
  return Math.max(0, Math.min(opts.cap, raw));
}
