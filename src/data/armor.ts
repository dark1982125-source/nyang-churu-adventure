import { TUNING } from '../config/tuning';
import type { MaterialId } from './items';
import type { BlueprintSource, MaterialCount, SpecialReward } from './weapons';

/**
 * 깡깡이 보호구 6종(보호구-6종-확정정리.md).
 * 확정: 이름·부위·제작 재료와 수량·기본 강화 재료·+5/+10 특별 재료·등급별로 붙는 효과 종류·개방 시점(모자·조끼·헬멧).
 * TEMP: 능력치 수치(TUNING.armor), 나머지 3종 설계도 시점(blueprint.kind = 'undecided').
 * 강화 성공률·소모량·실패 보정·10회 보장은 무기 공통표(ENHANCE_TABLE/ENHANCE_RULES)를 쓰지만,
 * 효과는 무기 공격력 증가표가 아니라 아래 보호구별 효과를 쓴다.
 */

export type ArmorId = 'quiltHat' | 'explorerHelmet' | 'quiltVest' | 'bulletArmor' | 'squishySneaker' | 'explorerBoots';
/** 보호구 부위(확정): 머리·몸통·발 각 1칸 */
export type ArmorSlot = 'head' | 'body' | 'feet';
export const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = { head: '머리', body: '몸통', feet: '발' };

/** 지속시간(밀쳐내기는 거리, 치명타는 받는 추가 피해) 감소 저항 종류 */
export type ResistKey = 'bleed' | 'burn' | 'freeze' | 'slow' | 'stun' | 'knockback' | 'critDamage';
export type ArmorStatKey = 'maxHp' | 'defense' | 'evasion' | ResistKey;

export const ARMOR_STAT_NAMES: Record<ArmorStatKey, string> = {
  maxHp: '최대 체력', defense: '방어력', evasion: '회피 확률',
  bleed: '출혈 지속시간 감소', burn: '화상 지속시간 감소', freeze: '빙결 지속시간 감소',
  slow: '적 스킬 감속 지속시간 감소', stun: '기절 지속시간 감소', knockback: '밀쳐내기 거리 감소', critDamage: '받는 치명타 피해 감소',
};

/** 설계도: 무기와 같은 해금 방식 + 아직 정하지 않은 장비 */
export type ArmorBlueprint = BlueprintSource | { kind: 'undecided' };

export interface ArmorDef {
  id: ArmorId;
  name: string;
  slot: ArmorSlot;
  craft: MaterialCount[];
  enhanceMaterial: MaterialId;
  special5: MaterialCount[];
  special10: MaterialCount[];
  blueprint: ArmorBlueprint;
  /** 확정: 등급별로 붙는 효과(일반 / +5 유니크에 추가 / +10 전설에 추가) */
  effects: { normal: ArmorStatKey[]; unique: ArmorStatKey[]; legend: ArmorStatKey[] };
  /** 확정 외형 설명(아트 미제공) */
  look: string;
}

const m = (id: MaterialId, count: number): MaterialCount => ({ id, count });

export const ARMOR_DEFS: Record<ArmorId, ArmorDef> = {
  quiltHat: {
    id: 'quiltHat', name: '폭신폭신 누빔모자', slot: 'head',
    craft: [m('oldCloth', 10), m('fluffyMarshmallow', 8), m('oldYarn', 3)],
    enhanceMaterial: 'cloudCottonCandy',
    special5: [m('cozyBlanketPiece', 1)],
    special10: [m('goldenFurball', 1), m('fantasyFurHat', 1)],
    blueprint: { kind: 'forgeFirstVisit' },
    effects: { normal: ['maxHp', 'bleed'], unique: [], legend: [] },
    look: '귀가 드러나는 둥근 누빔모자',
  },
  explorerHelmet: {
    id: 'explorerHelmet', name: '든든탐험헬멧', slot: 'head',
    craft: [m('holeyHelmet', 10), m('fluffyMarshmallow', 8), m('rustyBolt', 3)],
    enhanceMaterial: 'reinforcedBolt',
    special5: [m('smoothHelmet', 1)],
    special10: [m('captainHelmet', 1), m('camoFeather', 1)],
    blueprint: { kind: 'firstClear', chapter: 4 },
    effects: { normal: ['maxHp', 'stun'], unique: [], legend: [] },
    look: '파스텔 카키/올리브 군용 철모, 귀 구멍과 발바닥 문양',
  },
  quiltVest: {
    id: 'quiltVest', name: '폭신누빔조끼', slot: 'body',
    craft: [m('oldSweater', 15), m('fluffyMarshmallow', 12), m('oldYarn', 5)],
    enhanceMaterial: 'cloudCottonCandy',
    special5: [m('angoraSweater', 1)],
    special10: [m('shellButton', 1), m('grandmaSweater', 1)],
    blueprint: { kind: 'forgeFirstVisit' },
    effects: { normal: ['defense'], unique: ['knockback'], legend: ['critDamage'] },
    look: '크림색·살구 테두리 짧은 민소매',
  },
  bulletArmor: {
    id: 'bulletArmor', name: '튼튼 방탄갑옷', slot: 'body',
    craft: [m('tornVest', 15), m('rustyPlate', 12), m('rustyBolt', 5)],
    enhanceMaterial: 'reinforcedBolt',
    special5: [m('toughFiber', 1)],
    special10: [m('captainVest', 1), m('fireLizardScale', 1)],
    blueprint: { kind: 'undecided' },
    effects: { normal: ['defense'], unique: ['burn'], legend: ['maxHp'] },
    look: '귀여운 짧은 경갑',
  },
  squishySneaker: {
    id: 'squishySneaker', name: '폭신말캉 스니커', slot: 'feet',
    craft: [m('wornLeather', 10), m('fluffyMarshmallow', 8), m('oldYarn', 3)],
    enhanceMaterial: 'cloudCottonCandy',
    special5: [m('bouncyPad', 1)],
    special10: [m('cloudLeather', 1), m('snowInsole', 1)],
    blueprint: { kind: 'undecided' },
    effects: { normal: ['evasion'], unique: ['slow'], legend: ['freeze'] },
    look: '둥근 앞코·두툼한 젤리 밑창',
  },
  explorerBoots: {
    id: 'explorerBoots', name: '튼튼 탐험부츠', slot: 'feet',
    craft: [m('wornBoots', 10), m('tornRubber', 8), m('stickySlimeGlue', 3)],
    enhanceMaterial: 'hardJelly',
    special5: [m('toughLeatherBoots', 1)],
    special10: [m('captainBoots', 1), m('steelWeb', 1)],
    blueprint: { kind: 'undecided' },
    effects: { normal: ['defense'], unique: ['knockback'], legend: ['slow'] },
    look: '파스텔 카키·두꺼운 고무 밑창·짧은 발목 보호대',
  },
};

export const ARMOR_IDS = Object.keys(ARMOR_DEFS) as ArmorId[];

/**
 * 보호구 특별 재료 반복 클리어 보상(위임 배치, 확정 문서 기준). 매 클리어 1개, 행운 미적용,
 * 고난도(전설용)는 본편 Ch 8 이후. 황금빛 털뭉치는 장갑과 같은 재료·같은 배치(고난도 3/8/13)라
 * weapons.ts의 SPECIAL_REWARDS에 이미 있어 여기서 다시 넣지 않는다(중복 지급 방지).
 */
export const ARMOR_SPECIAL_REWARDS: SpecialReward[] = [
  { material: 'cozyBlanketPiece', difficulty: 'normal', chapters: [3, 8, 10], requiresCh8: false },
  { material: 'fantasyFurHat', difficulty: 'hard', chapters: [6, 10, 14], requiresCh8: true },
  { material: 'smoothHelmet', difficulty: 'normal', chapters: [5, 9, 13], requiresCh8: false },
  { material: 'captainHelmet', difficulty: 'hard', chapters: [5, 9, 13], requiresCh8: true },
  { material: 'camoFeather', difficulty: 'hard', chapters: [3, 10, 12], requiresCh8: true },
  { material: 'angoraSweater', difficulty: 'normal', chapters: [3, 8, 10], requiresCh8: false },
  { material: 'shellButton', difficulty: 'hard', chapters: [2, 8, 14], requiresCh8: true },
  { material: 'grandmaSweater', difficulty: 'hard', chapters: [3, 10, 13], requiresCh8: true },
  { material: 'toughFiber', difficulty: 'normal', chapters: [5, 9, 13], requiresCh8: false },
  { material: 'captainVest', difficulty: 'hard', chapters: [5, 9, 13], requiresCh8: true },
  { material: 'fireLizardScale', difficulty: 'hard', chapters: [9, 11, 14], requiresCh8: true },
  { material: 'bouncyPad', difficulty: 'normal', chapters: [5, 7, 10], requiresCh8: false },
  { material: 'cloudLeather', difficulty: 'hard', chapters: [3, 8, 13], requiresCh8: true },
  { material: 'snowInsole', difficulty: 'hard', chapters: [8, 10, 14], requiresCh8: true },
  { material: 'toughLeatherBoots', difficulty: 'normal', chapters: [5, 9, 13], requiresCh8: false },
  { material: 'captainBoots', difficulty: 'hard', chapters: [5, 9, 13], requiresCh8: true },
  { material: 'steelWeb', difficulty: 'hard', chapters: [3, 10, 12], requiresCh8: true },
];

/**
 * 보호구 기본 재료 획득처(위임 배치). 지금 있는 Ch 1 적에만 실제 드롭을 붙이고(enemies.ts, 확률 TEMP),
 * 아직 없는 챕터는 이 표로만 준비한다. "기계병·갑옷병" 등은 계열 지정이며 정식 몬스터명이 아니다.
 */
export interface MaterialSource { chapter: number | 'late' | 'midLate'; enemy: string; family?: boolean; implemented: boolean }
export const ARMOR_MATERIAL_SOURCES: Partial<Record<MaterialId, MaterialSource[]>> = {
  oldCloth: [
    { chapter: 1, enemy: '운석 쥐', implemented: true },
    { chapter: 2, enemy: '끈끈 벌레', implemented: false },
    { chapter: 'late', enemy: '장난감·갑옷 계열 적', family: true, implemented: false },
  ],
  fluffyMarshmallow: [
    { chapter: 1, enemy: '먼지 슬라임', implemented: true },
    { chapter: 2, enemy: '젤리 방울', implemented: false },
    { chapter: 'late', enemy: '슬라임 계열', family: true, implemented: false },
  ],
  cloudCottonCandy: [
    { chapter: 1, enemy: '왕먼지 슬라임(엘리트)', implemented: true },
    { chapter: 2, enemy: '푸딩포식자(보스)', implemented: false },
    { chapter: 'late', enemy: '먼지·구름 계열 엘리트', family: true, implemented: false },
  ],
  holeyHelmet: [
    { chapter: 4, enemy: '기계병(계열)', family: true, implemented: false },
    { chapter: 5, enemy: '블록 병사', implemented: false },
    { chapter: 'late', enemy: '갑옷병(계열)', family: true, implemented: false },
  ],
  oldSweater: [
    { chapter: 1, enemy: '운석 쥐', implemented: true },
    { chapter: 2, enemy: '끈끈 벌레', implemented: false },
    { chapter: 8, enemy: '눈덩이 악동', implemented: false },
  ],
  tornVest: [
    { chapter: 5, enemy: '블록 병사', implemented: false },
    { chapter: 9, enemy: '공장 로봇', implemented: false },
    { chapter: 'late', enemy: '갑옷병(계열)', family: true, implemented: false },
  ],
  wornBoots: [
    { chapter: 4, enemy: '기계병(계열)', family: true, implemented: false },
    { chapter: 5, enemy: '블록 병사', implemented: false },
    { chapter: 'late', enemy: '갑옷병(계열)', family: true, implemented: false },
  ],
  wornLeather: [
    // 확인서 수급안(생물 계열). 가시등 멧돼지는 확인서 기재명이며 기존 15챕터 적 목록에는 없어 데이터로만 둔다.
    { chapter: 1, enemy: '운석 쥐', implemented: true },
    { chapter: 3, enemy: '가시등 멧돼지', implemented: false },
    { chapter: 8, enemy: '서리 늑대', implemented: false },
  ],
  tornRubber: [
    // 기존 승인 획득처 유지
    { chapter: 5, enemy: '블록 병사', implemented: false },
    { chapter: 5, enemy: '장난감 드론', implemented: false },
    { chapter: 5, enemy: '불량 뽑기기계', implemented: false },
  ],
  stickySlimeGlue: [
    { chapter: 1, enemy: '먼지 슬라임', implemented: true },
    { chapter: 2, enemy: '젤리 방울', implemented: false },
    { chapter: 'midLate', enemy: '슬라임 계열', family: true, implemented: false },
  ],
};

/** 강화 단계 → 등급 index(0 일반, 1 유니크 +5~9, 2 전설 +10) */
export function armorGradeIndex(level: number): 0 | 1 | 2 {
  return level >= 10 ? 2 : level >= 5 ? 1 : 0;
}

interface Curve { base: number; perLow: number; unique: number; perHigh: number; legend: number }

function curveAt(c: Curve, level: number): number {
  if (level >= 10) return c.legend;
  if (level >= 5) return c.unique + c.perHigh * (level - 5);
  return c.base + c.perLow * level;
}

export type ArmorStats = Record<ArmorStatKey, number>;

export function emptyArmorStats(): ArmorStats {
  return { maxHp: 0, defense: 0, evasion: 0, bleed: 0, burn: 0, freeze: 0, slow: 0, stun: 0, knockback: 0, critDamage: 0 };
}

/** 보호구 하나가 강화 단계에서 주는 능력치. 그 등급에 아직 붙지 않은 효과는 0. */
export function armorStatsAt(id: ArmorId, level: number): ArmorStats {
  const out = emptyArmorStats();
  const tune = TUNING.armor[id] as Partial<Record<ArmorStatKey, Curve | readonly number[]>>;
  const g = armorGradeIndex(level);
  const def = ARMOR_DEFS[id];
  const active = [...def.effects.normal, ...(g >= 1 ? def.effects.unique : []), ...(g >= 2 ? def.effects.legend : [])];
  for (const key of active) {
    const t = tune[key];
    if (!t) continue;
    out[key] = Array.isArray(t) ? (t as readonly number[])[g] : curveAt(t as Curve, level);
  }
  return out;
}
