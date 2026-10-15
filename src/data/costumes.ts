import type { MaterialId } from './items';
import type { MaterialCount } from './weapons';
import type { MaterialSource } from './armor';
import type { CompanionId } from './companions';

/**
 * 나비 옷장 코스튬 5벌(코스튬-5벌-확정정리.md).
 * 확정: 외형 전용 한 벌 세트, 능력치·세트효과·강화·등급·냥젤리 비용 없음, 제작 100% 성공, 한 번 제작하면 영구 보유,
 *       도안 해금 조건, 제작 재료와 수량, 파자마 무료 제작 1회, 별빛 자수실 최종 챕터 최초 클리어 3개,
 *       캠프(나비 옷장)에서만 변경, 보호구 능력 유지·외형은 코스튬 우선, 실제 장착 무기 외형 유지.
 * 임시: 아래 look 색은 승인 시안(docs/costume-concepts/)을 보고 고른 임시 도형 색이다. 실제 스프라이트가 아니다.
 * TEMP: 신규 재료 획득처(위임 배치안, COSTUME_MATERIAL_SOURCES).
 */

export type CostumeId = 'sprout' | 'chef' | 'pajamas' | 'explorer' | 'starlight';

/** 본편 최종 챕터(15챕터 구성, 확정) */
export const FINAL_CHAPTER = 15;

/** 도안 해금 조건 */
export type CostumeUnlock =
  | { kind: 'clearOrRescue'; chapter: number; companion: CompanionId }
  | { kind: 'rescue'; companion: CompanionId }
  | { kind: 'nabiFirstTalk' }
  | { kind: 'firstClear'; chapter: number };

/** 임시 도형 표현용 색(외형 참고 시안에서 고른 임시 값) */
export interface CostumeLook {
  hat: 'sproutCap' | 'chefHat' | 'sleepCap' | 'explorerHat' | 'starBand';
  hatColor: number;
  accent: number;
  top: number;
  topKind: 'vest' | 'apron' | 'pajama' | 'pocketVest' | 'heroSuit';
  bottom: number | null;
  feet: number;
  cape?: number;
}

export interface CostumeDef {
  id: CostumeId;
  name: string;
  unlock: CostumeUnlock;
  /** 비어 있으면 무료 제작(파자마, 1회) */
  craft: MaterialCount[];
  /** 기획 문서 외형 설명 그대로 */
  lookText: string;
  /** 승인 시안 원본 파일(docs/costume-concepts/) */
  concept: string;
  look: CostumeLook;
}

const m = (id: MaterialId, count: number): MaterialCount => ({ id, count });

export const COSTUME_DEFS: Record<CostumeId, CostumeDef> = {
  sprout: {
    id: 'sprout', name: '새싹 구조대 세트',
    unlock: { kind: 'clearOrRescue', chapter: 1, companion: 'kosyot' },
    craft: [m('oldCloth', 12), m('oldYarn', 5), m('freshSprout', 3)],
    lookText: '정수리에 두잎 새싹 달린 둥근 모자·민트 짧은 조끼·크림 발싸개',
    concept: 'honyangi-sprout-rescue-v1.png',
    look: { hat: 'sproutCap', hatColor: 0x9fdcc4, accent: 0x6cc24a, top: 0x9fdcc4, topKind: 'vest', bottom: null, feet: 0xf7ecd6 },
  },
  chef: {
    id: 'chef', name: '꼬마 요리사 세트',
    unlock: { kind: 'rescue', companion: 'samsaek' },
    craft: [m('oldCloth', 15), m('ribbonPiece', 5), m('cleanApron', 1)],
    lookText: '낮은 크림 요리모자·살구 앞치마·크림 둥근 신발',
    concept: 'honyangi-chef-v1.png',
    look: { hat: 'chefHat', hatColor: 0xfbf3e2, accent: 0xf7ecd6, top: 0xffa07a, topKind: 'apron', bottom: null, feet: 0xf7ecd6 },
  },
  pajamas: {
    id: 'pajamas', name: '포근 파자마 세트',
    unlock: { kind: 'nabiFirstTalk' },
    craft: [],
    lookText: '연보라/연노랑 수면모자·별무늬 잠옷·슬리퍼',
    concept: 'honyangi-pajamas-v1.png',
    look: { hat: 'sleepCap', hatColor: 0xc4a8f5, accent: 0xfbe39a, top: 0xc4a8f5, topKind: 'pajama', bottom: 0xc4a8f5, feet: 0xf7ecd6 },
  },
  explorer: {
    id: 'explorer', name: '씩씩 탐험가 세트',
    unlock: { kind: 'rescue', companion: 'eolluk' },
    craft: [m('wornLeather', 12), m('oldYarn', 5), m('explorerCloth', 3)],
    lookText: '카키/베이지 탐험모·주머니조끼·짧은부츠',
    concept: 'honyangi-explorer-v1.png',
    look: { hat: 'explorerHat', hatColor: 0xc8b88f, accent: 0x9b8a62, top: 0xcbbd98, topKind: 'pocketVest', bottom: null, feet: 0x9b7b55 },
  },
  starlight: {
    id: 'starlight', name: '별빛 영웅 세트',
    unlock: { kind: 'firstClear', chapter: FINAL_CHAPTER },
    craft: [m('oldCloth', 15), m('ribbonPiece', 8), m('starEmbroideryThread', 3)],
    lookText: '남색/금빛 별머리띠·짧은망토·영웅복·부츠',
    concept: 'honyangi-starlight-hero-v1.png',
    look: { hat: 'starBand', hatColor: 0xf2c94c, accent: 0xf2c94c, top: 0x27407a, topKind: 'heroSuit', bottom: null, feet: 0x27407a, cape: 0x27407a },
  },
};

export const COSTUME_IDS = Object.keys(COSTUME_DEFS) as CostumeId[];

/** 별빛 자수실: 최종 챕터 일반 최초 클리어 1회 지급(확정). 반복 획득처 없음, 재전투를 요구하지 않는다. */
export const STAR_THREAD_FIRST_CLEAR = 3;

/** 도안 조건 표시 문구 */
export function unlockText(u: CostumeUnlock): string {
  switch (u.kind) {
    case 'clearOrRescue': return `Ch ${u.chapter} 최초 클리어 / 코숏 구출`;
    case 'rescue': return u.companion === 'samsaek' ? '삼색이 구출(Ch 3)' : u.companion === 'eolluk' ? '얼룩이 구출(Ch 8)' : `${u.companion} 구출`;
    case 'nabiFirstTalk': return '나비 구출 후 첫 대화';
    case 'firstClear': return `본편 최종 Ch ${u.chapter} 최초 클리어`;
  }
}

/**
 * 코스튬 신규 재료 획득처 — 위임 배치안(사용자 확인 대상). 기존 15챕터 문서에 이름이 있는 적만 쓰고,
 * 이름 있는 적이 없는 챕터는 '계열(미매핑)'으로만 적어 신규 적을 확정하지 않는다.
 * implemented=true는 지금 Ch 1 적에 실제 드롭으로 붙인 것(확률 TEMP). 나머지 챕터는 미구현이라 정상 진행으로는 아직 못 얻는다.
 * 별빛 자수실은 문서대로 최종 챕터 최초 클리어 지급뿐이라 여기 넣지 않는다.
 */
export const COSTUME_MATERIAL_SOURCES: Partial<Record<MaterialId, MaterialSource[]>> = {
  freshSprout: [
    { chapter: 1, enemy: '삐죽 풀벌레', implemented: true },
    { chapter: 3, enemy: '화난 덩굴', implemented: false },
    { chapter: 10, enemy: '밀림 계열(미매핑)', family: true, implemented: false },
  ],
  cleanApron: [
    { chapter: 3, enemy: '가시 도토리', implemented: false },
    { chapter: 5, enemy: '장난감 드론', implemented: false },
    { chapter: 9, enemy: '용암배달부', implemented: false },
  ],
  explorerCloth: [
    { chapter: 6, enemy: '모래잠복충', implemented: false },
    { chapter: 8, enemy: '서리 늑대', implemented: false },
    { chapter: 10, enemy: '밀림 계열(미매핑)', family: true, implemented: false },
  ],
};
