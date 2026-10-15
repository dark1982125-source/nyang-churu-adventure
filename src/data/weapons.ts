import type { MaterialId } from './items';

/**
 * 무기 제작·강화 데이터. 무기-6종-기획정리.md 1~9절의 확정표를 그대로 옮겼다.
 * 기본 공격력(baseAttack)만 문서에 없어서 TEMP.
 */

export type WeaponId = 'starterGlove' | 'jellyGlove' | 'fishboneSword' | 'pawHammer' | 'skewerSpear' | 'catnipRod' | 'churuLauncher';
/** 전투 동작(기본 공격·전용 5종) 묶음. 지금은 장갑 계열만 전투에 연결되어 있다. */
export type WeaponKind = 'glove' | 'sword' | 'hammer' | 'spear' | 'rod' | 'launcher';

export interface MaterialCount { id: MaterialId; count: number }

/** 설계도 해금 조건 */
export type BlueprintSource =
  | { kind: 'forgeFirstVisit' } // 깡깡이 구출 후 대장간 첫 방문
  | { kind: 'firstClear'; chapter: number } // 일반 난도 최초 클리어
  | { kind: 'starter' }; // 기본 지급(제작 없음)

export interface WeaponCraftDef {
  id: WeaponId;
  name: string;
  kind: WeaponKind;
  basicAttack: string;
  /** TEMP: 무기 기본 공격력. 강화 보너스는 이 값 기준 합산 */
  baseAttack: number;
  craft: MaterialCount[];
  enhanceMaterial: MaterialId | null;
  /** +5 성공 시 소모할 특별 재료 */
  special5: MaterialCount[];
  /** +10 성공 시 소모할 특별 재료 */
  special10: MaterialCount[];
  blueprint: BlueprintSource;
  /** 이 브랜치에서 전투 동작이 연결되어 있는지 */
  combatReady: boolean;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponCraftDef> = {
  starterGlove: {
    id: 'starterGlove', name: '기본 장갑', kind: 'glove', basicAttack: '냥냥 펀치', baseAttack: 20,
    craft: [], enhanceMaterial: null, special5: [], special10: [],
    blueprint: { kind: 'starter' }, combatReady: true,
  },
  jellyGlove: {
    id: 'jellyGlove', name: '젤리 펀치 장갑', kind: 'glove', basicAttack: '빠른 전방 냥냥 펀치', baseAttack: 20,
    craft: [{ id: 'softJelly', count: 10 }, { id: 'wornLeather', count: 5 }, { id: 'oldYarn', count: 3 }],
    enhanceMaterial: 'hardJelly',
    special5: [{ id: 'glossyLeather', count: 1 }],
    special10: [{ id: 'goldenFurball', count: 1 }],
    blueprint: { kind: 'forgeFirstVisit' }, combatReady: true,
  },
  fishboneSword: {
    id: 'fishboneSword', name: '생선뼈 검', kind: 'sword', basicAttack: '전방 부채꼴 베기', baseAttack: 20,
    craft: [{ id: 'fishboneShard', count: 10 }, { id: 'smallStone', count: 5 }, { id: 'oldYarn', count: 3 }],
    enhanceMaterial: 'smoothStone',
    special5: [{ id: 'hardFishbone', count: 1 }],
    special10: [{ id: 'shinyFishbone', count: 1 }],
    blueprint: { kind: 'forgeFirstVisit' }, combatReady: false,
  },
  catnipRod: {
    id: 'catnipRod', name: '캣닢 낚싯봉', kind: 'rod', basicAttack: '캣닢 잎 마법탄', baseAttack: 20,
    craft: [{ id: 'catnipPouch', count: 10 }, { id: 'oldFishingRod', count: 5 }, { id: 'fallenRibbon', count: 3 }],
    enhanceMaterial: 'sturdyLine',
    special5: [{ id: 'magicCatnipBall', count: 1 }],
    special10: [{ id: 'fairyRibbon', count: 1 }, { id: 'rainbowRod', count: 1 }],
    blueprint: { kind: 'firstClear', chapter: 3 }, combatReady: false,
  },
  churuLauncher: {
    id: 'churuLauncher', name: '츄르츄르 런처', kind: 'launcher', basicAttack: '작은 젤리 포탄', baseAttack: 20,
    // 런처는 최초 제작 4종 10/5/5/3 예외
    craft: [{ id: 'emptyChuru', count: 10 }, { id: 'rustyBolt', count: 5 }, { id: 'rustyPlate', count: 5 }, { id: 'brokenHandle', count: 3 }],
    enhanceMaterial: 'reinforcedBolt',
    special5: [{ id: 'limitedChuru', count: 1 }],
    special10: [{ id: 'lightPlate', count: 1 }, { id: 'flawlessHandle', count: 1 }],
    blueprint: { kind: 'firstClear', chapter: 4 }, combatReady: false,
  },
  pawHammer: {
    id: 'pawHammer', name: '말랑 발바닥 망치', kind: 'hammer', basicAttack: '말랑 쿵 내려치기', baseAttack: 20,
    craft: [{ id: 'tornRubber', count: 10 }, { id: 'thinTwig', count: 5 }, { id: 'smallNail', count: 3 }],
    enhanceMaterial: 'reinforcedBolt',
    special5: [{ id: 'rainbowClay', count: 1 }],
    special10: [{ id: 'goldenPawCore', count: 1 }, { id: 'goldenCatnipBranch', count: 1 }],
    blueprint: { kind: 'firstClear', chapter: 5 }, combatReady: false,
  },
  skewerSpear: {
    id: 'skewerSpear', name: '생선꼬치 창 (제안명)', kind: 'spear', basicAttack: '콕콕 찌르기', baseAttack: 20,
    craft: [{ id: 'driedBonito', count: 10 }, { id: 'brokenChopsticks', count: 5 }, { id: 'oldYarn', count: 3 }],
    enhanceMaterial: 'saltCrystal',
    special5: [{ id: 'dancingBonito', count: 1 }],
    special10: [{ id: 'titaniumChopsticks', count: 1 }, { id: 'starBonito', count: 1 }],
    blueprint: { kind: 'firstClear', chapter: 6 }, combatReady: false,
  },
};

export const CRAFTABLE_WEAPONS: WeaponId[] = ['jellyGlove', 'fishboneSword', 'catnipRod', 'churuLauncher', 'pawHammer', 'skewerSpear'];

/** 모든 무기 공통 강화표(확정). index 0 = 목표 +1 */
export const ENHANCE_TABLE: { target: number; rate: number; material: number; attackBonus: number }[] = [
  { target: 1, rate: 1.0, material: 5, attackBonus: 0.05 },
  { target: 2, rate: 1.0, material: 5, attackBonus: 0.05 },
  { target: 3, rate: 0.9, material: 8, attackBonus: 0.05 },
  { target: 4, rate: 0.8, material: 8, attackBonus: 0.05 },
  { target: 5, rate: 0.7, material: 15, attackBonus: 0.15 },
  { target: 6, rate: 0.6, material: 17, attackBonus: 0.05 },
  { target: 7, rate: 0.5, material: 20, attackBonus: 0.05 },
  { target: 8, rate: 0.4, material: 23, attackBonus: 0.05 },
  { target: 9, rate: 0.25, material: 27, attackBonus: 0.05 },
  { target: 10, rate: 0.1, material: 35, attackBonus: 0.25 },
];

export const ENHANCE_RULES = {
  failBonus: 0.05, // CONFIRMED 같은 무기·목표 단계 실패당 +5%p
  pityAfterFails: 9, // CONFIRMED 9회 연속 실패 후 10번째 확정 성공
  maxLevel: 10,
  /** 행운은 강화 확률에 적용하지 않는다(기존 제안 유지, 최종 확인 대상) */
  luckApplies: false,
} as const;

/** +0 무기 공격력 기준 합산 보너스. +5 = 35%, +10 = 80%. */
export function enhanceAttackBonus(level: number): number {
  return ENHANCE_TABLE.filter((r) => r.target <= level).reduce((s, r) => s + r.attackBonus, 0);
}

export function weaponGrade(level: number): '일반' | '유니크' | '전설' {
  return level >= 10 ? '전설' : level >= 5 ? '유니크' : '일반';
}

/**
 * 지정 챕터 반복 클리어 특별 재료 보상(확정). 매 클리어 1개, 행운 미적용.
 * hard + legendary 재료는 본편 Ch 8 일반 클리어 이후에만 지급.
 */
export interface SpecialReward { material: MaterialId; difficulty: 'normal' | 'hard'; chapters: number[]; requiresCh8: boolean }

export const SPECIAL_REWARDS: SpecialReward[] = [
  { material: 'glossyLeather', difficulty: 'normal', chapters: [3, 6, 10], requiresCh8: false },
  { material: 'goldenFurball', difficulty: 'hard', chapters: [3, 8, 13], requiresCh8: true },
  { material: 'hardFishbone', difficulty: 'normal', chapters: [2, 6, 8], requiresCh8: false },
  { material: 'shinyFishbone', difficulty: 'hard', chapters: [2, 7, 12], requiresCh8: true },
  { material: 'rainbowClay', difficulty: 'normal', chapters: [5, 7, 10], requiresCh8: false },
  { material: 'goldenPawCore', difficulty: 'hard', chapters: [5, 9, 13], requiresCh8: true },
  { material: 'goldenCatnipBranch', difficulty: 'hard', chapters: [3, 10, 12], requiresCh8: true },
  { material: 'dancingBonito', difficulty: 'normal', chapters: [6, 8, 10], requiresCh8: false },
  { material: 'titaniumChopsticks', difficulty: 'hard', chapters: [5, 9, 12], requiresCh8: true },
  { material: 'starBonito', difficulty: 'hard', chapters: [6, 8, 14], requiresCh8: true },
  { material: 'magicCatnipBall', difficulty: 'normal', chapters: [3, 8, 10], requiresCh8: false },
  { material: 'fairyRibbon', difficulty: 'hard', chapters: [3, 10, 12], requiresCh8: true },
  { material: 'rainbowRod', difficulty: 'hard', chapters: [2, 8, 14], requiresCh8: true },
  { material: 'limitedChuru', difficulty: 'normal', chapters: [4, 9, 13], requiresCh8: false },
  { material: 'lightPlate', difficulty: 'hard', chapters: [4, 9, 11], requiresCh8: true },
  { material: 'flawlessHandle', difficulty: 'hard', chapters: [5, 7, 14], requiresCh8: true },
];

/**
 * 장비 슬롯(확정): 무기 1칸 + 보호구 머리·몸통·발 각 1칸(보호구-6종-확정정리.md) + 액세서리 1칸, 코스튬 별도.
 * 액세서리 2칸·동일품 중복 금지·코스튬 별도칸 제안은 미승인이라 반영하지 않는다.
 */
export type GearSlot = 'weapon' | 'head' | 'body' | 'feet' | 'accessory';
export const GEAR_SLOT_NAMES: Record<GearSlot, string> = { weapon: '무기', head: '머리 보호구', body: '몸통 보호구', feet: '발 보호구', accessory: '액세서리' };
