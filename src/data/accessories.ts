import { TUNING } from '../config/tuning';
import type { MaterialId } from './items';
import type { MaterialCount, SpecialReward } from './weapons';
import type { MaterialSource } from './armor';

/**
 * 나비 액세서리 10종(액세서리-10종-확정정리.md).
 * 확정: 이름·시리즈·종류·대표 효과 1개, 제작 재료와 수량, 기본 강화 재료, +5/+10 특별 재료,
 *       최대 2개 착용·동일 아이템 중복 불가(등급 무관)·같은 종류 다른 아이템과 시리즈 혼합 허용·세트 보너스 없음,
 *       강화 성공률·소모량·실패 보정·10회 보장은 기존 장비 공통.
 * TEMP: 효과 수치·상한(TUNING.accessory), 설계도 시점(전부 잠김 'undecided'), 획득처 배치(위임 배치안).
 */

export type AccessorySeries = 'sun' | 'moon';
export type AccessoryKind = 'necklace' | 'ring' | 'bracelet' | 'brooch' | 'charm';
export type AccessoryId =
  | 'sunNecklace' | 'sunRing' | 'sunBracelet' | 'sunBrooch' | 'sunCharm'
  | 'moonNecklace' | 'moonRing' | 'moonBracelet' | 'moonBrooch' | 'moonCharm';

/** 대표 효과(아이템당 하나만, 강화도 이 효과만) */
export type AccessoryStatKey =
  | 'attack' | 'maxHp' | 'critChance' | 'critDamage' | 'attackSpeed' | 'cooldown' | 'regenInterval' | 'defense' | 'luck' | 'energyRegen';

export const ACCESSORY_SERIES_NAMES: Record<AccessorySeries, string> = { sun: '햇살 방울', moon: '달빛 캣닢' };
export const ACCESSORY_KIND_NAMES: Record<AccessoryKind, string> = { necklace: '목걸이', ring: '반지', bracelet: '팔찌', brooch: '브로치', charm: '부적' };
export const ACCESSORY_STAT_NAMES: Record<AccessoryStatKey, string> = {
  attack: '공격력', maxHp: '최대 체력', critChance: '치명타 확률', critDamage: '치명타 피해량',
  attackSpeed: '기본 공격속도', cooldown: '스킬 쿨타임 감소', regenInterval: '체력 자동 회복속도(회복 간격 단축)',
  defense: '방어력', luck: '행운', energyRegen: '냥기력 회복속도',
};

/** 설계도: 시점 미정이라 정상 진행에서는 잠김. 테스트 우회는 #forge 미리보기 저장에서만(TEMP). */
export type AccessoryBlueprint = { kind: 'undecided' };

export interface AccessoryDef {
  id: AccessoryId;
  name: string;
  series: AccessorySeries;
  kind: AccessoryKind;
  stat: AccessoryStatKey;
  craft: MaterialCount[];
  enhanceMaterial: MaterialId;
  special5: MaterialCount[];
  special10: MaterialCount[];
  blueprint: AccessoryBlueprint;
}

const m = (id: MaterialId, count: number): MaterialCount => ({ id, count });

/** 종류별 제작표(확정): 공통 핵심 재료 수량 + 형태 재료 + 결속 재료. 공통 핵심은 시리즈별(빛바랜 방울/향긋한 캣닢). */
const CRAFT: Record<AccessoryKind, { core: number; form: MaterialCount; bind: MaterialCount }> = {
  necklace: { core: 5, form: m('ribbonPiece', 8), bind: m('smallLink', 3) },
  ring: { core: 2, form: m('oldSilverRing', 3), bind: m('stickySlimeGlue', 1) },
  bracelet: { core: 6, form: m('fadedBead', 8), bind: m('elasticBand', 3) },
  brooch: { core: 4, form: m('bentBroochPin', 3), bind: m('stickySlimeGlue', 2) },
  charm: { core: 3, form: m('oldCharmPiece', 5), bind: m('oldYarn', 2) }, // 부적 결속은 낡은 털실뭉치(확정)
};
const CORE: Record<AccessorySeries, MaterialId> = { sun: 'fadedBell', moon: 'fragrantCatnip' };
const ENHANCE: Record<AccessorySeries, MaterialId> = { sun: 'sunDust', moon: 'moonDew' };

function def(id: AccessoryId, series: AccessorySeries, kind: AccessoryKind, stat: AccessoryStatKey, s5: MaterialId, s10: [MaterialId, MaterialId]): AccessoryDef {
  const c = CRAFT[kind];
  return {
    id, series, kind, stat,
    name: `${ACCESSORY_SERIES_NAMES[series]} ${ACCESSORY_KIND_NAMES[kind]}`,
    craft: [m(CORE[series], c.core), c.form, c.bind],
    enhanceMaterial: ENHANCE[series],
    special5: [m(s5, 1)],
    special10: [m(s10[0], 1), m(s10[1], 1)],
    blueprint: { kind: 'undecided' },
  };
}

export const ACCESSORY_DEFS: Record<AccessoryId, AccessoryDef> = {
  sunNecklace: def('sunNecklace', 'sun', 'necklace', 'attack', 'flowerKnot', ['fairyRibbon', 'sunGem']),
  sunRing: def('sunRing', 'sun', 'ring', 'critChance', 'auroraPearl', ['whiteSilverRing', 'rubyHeart']),
  sunBracelet: def('sunBracelet', 'sun', 'bracelet', 'attackSpeed', 'colorGlassBead', ['rainbowBead', 'rainbowCrystal']),
  sunBrooch: def('sunBrooch', 'sun', 'brooch', 'regenInterval', 'goldButterfly', ['solarBrooch', 'sunShard']),
  sunCharm: def('sunCharm', 'sun', 'charm', 'luck', 'sacredCharm', ['solarCharm', 'shootingStarShard']),
  moonNecklace: def('moonNecklace', 'moon', 'necklace', 'maxHp', 'silkKnot', ['fairyRibbon', 'moonGem']),
  moonRing: def('moonRing', 'moon', 'ring', 'critDamage', 'auroraPearl', ['whiteSilverRing', 'sapphireHeart']),
  moonBracelet: def('moonBracelet', 'moon', 'bracelet', 'cooldown', 'colorGlassBead', ['rainbowBead', 'starCrystal']),
  moonBrooch: def('moonBrooch', 'moon', 'brooch', 'defense', 'silverButterfly', ['crescentBrooch', 'moonShard']),
  moonCharm: def('moonCharm', 'moon', 'charm', 'energyRegen', 'sacredCharm', ['lunarCharm', 'shootingStarShard']),
};

export const ACCESSORY_IDS = Object.keys(ACCESSORY_DEFS) as AccessoryId[];
/** 확정: 액세서리 착용 칸 수(종류 무관) */
export const ACCESSORY_SLOTS = 2;

interface Curve { base: number; perLow: number; unique: number; perHigh: number; legend: number }

/** 강화 단계의 대표 효과 값(TEMP). +1~4·+6~9 점진, +5·+10 크게 상승. 무기 공격력표를 쓰지 않는다. */
export function accessoryValueAt(id: AccessoryId, level: number): number {
  const c = TUNING.accessory.values[ACCESSORY_DEFS[id].stat] as Curve;
  if (level >= 10) return c.legend;
  if (level >= 5) return c.unique + c.perHigh * (level - 5);
  return c.base + c.perLow * level;
}

/**
 * 액세서리 특별 재료 반복 클리어 보상 — 위임 배치안(사용자 확인 대상). 매 클리어 재료당 1개, 행운 미적용.
 * +5용은 일반 난도, +10(전설)용은 고난도·본편 Ch 8 이후. 한 챕터에 몰지 않고 세 챕터로 분산.
 * 요정의 리본은 낚싯봉 +10과 같은 재료라 기존 배치(고난도 3/10/12)를 그대로 쓰고 여기서 다시 넣지 않는다.
 */
export const ACCESSORY_SPECIAL_REWARDS: SpecialReward[] = [
  { material: 'flowerKnot', difficulty: 'normal', chapters: [3, 7, 10], requiresCh8: false },
  { material: 'auroraPearl', difficulty: 'normal', chapters: [2, 8, 12], requiresCh8: false },
  { material: 'colorGlassBead', difficulty: 'normal', chapters: [5, 7, 11], requiresCh8: false },
  { material: 'goldButterfly', difficulty: 'normal', chapters: [4, 9, 13], requiresCh8: false },
  { material: 'sacredCharm', difficulty: 'normal', chapters: [3, 6, 12], requiresCh8: false },
  { material: 'silkKnot', difficulty: 'normal', chapters: [2, 10, 13], requiresCh8: false },
  { material: 'silverButterfly', difficulty: 'normal', chapters: [6, 8, 14], requiresCh8: false },
  { material: 'sunGem', difficulty: 'hard', chapters: [6, 9, 14], requiresCh8: true },
  { material: 'moonGem', difficulty: 'hard', chapters: [8, 11, 14], requiresCh8: true },
  { material: 'whiteSilverRing', difficulty: 'hard', chapters: [4, 8, 12], requiresCh8: true },
  { material: 'rubyHeart', difficulty: 'hard', chapters: [9, 11, 13], requiresCh8: true },
  { material: 'sapphireHeart', difficulty: 'hard', chapters: [7, 10, 14], requiresCh8: true },
  { material: 'rainbowBead', difficulty: 'hard', chapters: [5, 7, 11], requiresCh8: true },
  { material: 'rainbowCrystal', difficulty: 'hard', chapters: [7, 9, 13], requiresCh8: true },
  { material: 'starCrystal', difficulty: 'hard', chapters: [7, 12, 14], requiresCh8: true },
  { material: 'solarBrooch', difficulty: 'hard', chapters: [6, 9, 13], requiresCh8: true },
  { material: 'sunShard', difficulty: 'hard', chapters: [4, 9, 11], requiresCh8: true },
  { material: 'crescentBrooch', difficulty: 'hard', chapters: [8, 11, 12], requiresCh8: true },
  { material: 'moonShard', difficulty: 'hard', chapters: [10, 12, 14], requiresCh8: true },
  { material: 'solarCharm', difficulty: 'hard', chapters: [3, 6, 9], requiresCh8: true },
  { material: 'lunarCharm', difficulty: 'hard', chapters: [8, 10, 12], requiresCh8: true },
  { material: 'shootingStarShard', difficulty: 'hard', chapters: [11, 12, 14], requiresCh8: true },
];

/**
 * 액세서리 기본·강화 재료 획득처 — 위임 배치안. 기존 15챕터 문서에 이름이 있는 적만 쓰고,
 * 이름 있는 적이 없는 챕터(Ch 4·7·10·11·12·14 등)는 '미매핑(계열 후보)'으로 표시해 신규 적을 확정하지 않는다.
 * implemented=true는 지금 Ch 1 적에 실제 드롭으로 붙인 것(확률 TEMP).
 */
export const ACCESSORY_MATERIAL_SOURCES: Partial<Record<MaterialId, MaterialSource[]>> = {
  fadedBell: [
    { chapter: 1, enemy: '삐죽 풀벌레', implemented: true },
    { chapter: 5, enemy: '태엽 쥐', implemented: false },
    { chapter: 6, enemy: '선인장 악동', implemented: false },
  ],
  fragrantCatnip: [
    { chapter: 3, enemy: '가시 도토리·화난 덩굴', implemented: false },
    { chapter: 6, enemy: '신기루 여우', implemented: false },
    { chapter: 10, enemy: '밀림 계열(미매핑)', family: true, implemented: false },
  ],
  ribbonPiece: [
    { chapter: 2, enemy: '젤리 방울', implemented: false },
    { chapter: 5, enemy: '장난감 드론', implemented: false },
    { chapter: 13, enemy: '검은목도리 추적자', implemented: false },
  ],
  oldSilverRing: [
    { chapter: 2, enemy: '늪지 개구리', implemented: false },
    { chapter: 6, enemy: '모래 벼룩', implemented: false },
    { chapter: 7, enemy: '수정 동굴 계열(미매핑)', family: true, implemented: false },
  ],
  fadedBead: [
    { chapter: 1, enemy: '먼지 슬라임', implemented: true },
    { chapter: 5, enemy: '불량 뽑기기계', implemented: false },
    { chapter: 8, enemy: '눈덩이 악동', implemented: false },
  ],
  bentBroochPin: [
    { chapter: 3, enemy: '그림자 나방', implemented: false },
    { chapter: 5, enemy: '블록 병사', implemented: false },
    { chapter: 9, enemy: '공장 로봇', implemented: false },
  ],
  oldCharmPiece: [
    { chapter: 3, enemy: '화난 덩굴', implemented: false },
    { chapter: 6, enemy: '모래잠복충', implemented: false },
    { chapter: 12, enemy: '메아리 회랑 계열(미매핑)', family: true, implemented: false },
  ],
  smallLink: [
    { chapter: 4, enemy: '기계 계열(미매핑)', family: true, implemented: false },
    { chapter: 5, enemy: '태엽 쥐', implemented: false },
    { chapter: 9, enemy: '공장 로봇', implemented: false },
  ],
  elasticBand: [
    { chapter: 2, enemy: '끈끈 벌레', implemented: false },
    { chapter: 5, enemy: '장난감 드론', implemented: false },
    { chapter: 9, enemy: '용암배달부', implemented: false },
  ],
  sunDust: [
    { chapter: 1, enemy: '돌돌 운석쥐(엘리트)', implemented: true },
    { chapter: 6, enemy: '모래술사 사르르', implemented: false },
    { chapter: 9, enemy: '화산 공장 엘리트·보스(미매핑)', family: true, implemented: false },
  ],
  moonDew: [
    { chapter: 2, enemy: '젤리 집게왕(엘리트)', implemented: false },
    { chapter: 8, enemy: '빙결백작 오들오들', implemented: false },
    { chapter: 10, enemy: '밀림 엘리트·보스(미매핑)', family: true, implemented: false },
  ],
};
