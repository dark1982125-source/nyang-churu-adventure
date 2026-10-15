/** 영구 재화·제작 재료·판 안 경험치 아이템의 이름표. 이름은 기획 문서(무기-6종-기획정리.md) 그대로. */

export type CurrencyId = 'nyangJelly' | 'goldenCatnip' | 'golgolGear';

export const MATERIAL_NAMES = {
  // 장갑
  softJelly: '말랑 젤리덩이',
  wornLeather: '헤진 가죽조각',
  oldYarn: '낡은 털실뭉치',
  hardJelly: '단단젤리',
  glossyLeather: '윤기나는 가죽',
  goldenFurball: '황금빛 털뭉치',
  // 검
  fishboneShard: '생선가시조각',
  smallStone: '작은 돌조각',
  smoothStone: '매끈한 돌조각',
  hardFishbone: '단단한 생선뼈',
  shinyFishbone: '빛나는 생선뼈',
  // 망치
  tornRubber: '찢어진 고무조각',
  thinTwig: '가는 나뭇가지',
  smallNail: '작은 쇠못',
  reinforcedBolt: '강화볼트',
  rainbowClay: '무지개 점토',
  goldenPawCore: '황금 발바닥 코어',
  goldenCatnipBranch: '황금 개다래 가지',
  // 창
  driedBonito: '가다랑어포',
  brokenChopsticks: '부러진 젓가락',
  saltCrystal: '소금결정',
  dancingBonito: '춤추는 가다랑어포',
  titaniumChopsticks: '티타늄 젓가락',
  starBonito: '별빛 가다랑어포',
  // 낚싯봉
  catnipPouch: '작은 캣닢 주머니',
  oldFishingRod: '버려진 낚싯대',
  fallenRibbon: '떨어진 리본',
  sturdyLine: '탄탄한 낚싯줄',
  magicCatnipBall: '마법의 캣닢볼',
  fairyRibbon: '요정의 리본',
  rainbowRod: '무지개 낚싯대',
  // 런처
  emptyChuru: '다 먹은 츄르봉지',
  rustyBolt: '녹슨 볼트',
  rustyPlate: '녹슨 철판',
  brokenHandle: '부서진 손잡이',
  limitedChuru: '한정판 츄르봉지',
  lightPlate: '가벼운 철판',
  flawlessHandle: '무결점 손잡이',
} as const;

export type MaterialId = keyof typeof MATERIAL_NAMES;

/** 예전 저장 ID → 현재 ID. 이름을 정식명(생선가시조각)에 맞춰 바꾼 ID를 저장 불러오기에서 옮긴다. */
export const LEGACY_MATERIAL_IDS: Record<string, MaterialId> = { fishSpine: 'fishboneShard' };

export const CURRENCY_NAMES: Record<CurrencyId, string> = {
  nyangJelly: '냥젤리',
  goldenCatnip: '황금 개다래',
  golgolGear: '골골기어',
};

export type RunPickupId = 'smallCatnip' | 'smallGear' | 'reviveBell' | 'jailKey';

export const PICKUP_NAMES: Record<RunPickupId, string> = {
  smallCatnip: '작은 개다래',
  smallGear: '작은 톱니',
  reviveBell: '다시냥 방울',
  jailKey: '감옥 열쇠',
};

export type LootId = CurrencyId | MaterialId;
export const LOOT_NAMES: Record<LootId, string> = { ...CURRENCY_NAMES, ...MATERIAL_NAMES };

export function isCurrency(id: LootId): id is CurrencyId {
  return id in CURRENCY_NAMES;
}
