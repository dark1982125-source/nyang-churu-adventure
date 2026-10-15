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
  // 보호구(보호구-6종-확정정리.md 재료명 그대로). 무기와 같은 재료 창고를 공유한다.
  oldCloth: '낡은 천조각',
  fluffyMarshmallow: '폭신 마시멜로',
  cloudCottonCandy: '구름 솜사탕',
  cozyBlanketPiece: '포근한 담요조각',
  fantasyFurHat: '환상의 털모자',
  holeyHelmet: '빵꾸난 헬멧',
  smoothHelmet: '매끈한 헬멧',
  captainHelmet: '대장의 헬멧',
  camoFeather: '위장깃털',
  oldSweater: '낡은 스웨터',
  angoraSweater: '앙고라 스웨터',
  shellButton: '조개단추',
  grandmaSweater: '할머니 스웨터',
  tornVest: '찢어진 방탄조끼',
  toughFiber: '튼튼한 방탄섬유',
  captainVest: '대장의 방탄조끼',
  fireLizardScale: '불꽃도마뱀 비늘',
  bouncyPad: '탄력고무패드',
  cloudLeather: '구름가죽',
  snowInsole: '눈꽃깔창',
  wornBoots: '해진 군화',
  stickySlimeGlue: '끈끈 슬라임풀',
  toughLeatherBoots: '질긴 가죽군화',
  captainBoots: '대장의 군화',
  steelWeb: '강철거미줄',
  // 액세서리(액세서리-10종-확정정리.md 재료명 그대로). 요정의 리본·끈끈 슬라임풀·낡은 털실뭉치는 기존 id 공유.
  // 리본조각은 무기 재료 '떨어진 리본'과 통합 미승인이라 별도 id.
  fadedBell: '빛바랜 방울',
  fragrantCatnip: '향긋한 캣닢',
  ribbonPiece: '리본조각',
  oldSilverRing: '낡은 은반지',
  fadedBead: '빛바랜 구슬',
  bentBroochPin: '구부러진 브로치핀',
  oldCharmPiece: '오래된 부적조각',
  smallLink: '작은 연결고리',
  elasticBand: '탄력고무밴드',
  sunDust: '마법의 햇살가루',
  moonDew: '달빛이슬',
  flowerKnot: '향기로운 꽃매듭',
  auroraPearl: '오로라 진주',
  colorGlassBead: '오색 유리구슬',
  goldButterfly: '빛나는 황금나비',
  sacredCharm: '신령한 부적',
  silkKnot: '부드러운 비단매듭',
  silverButterfly: '빛나는 은빛나비',
  sunGem: '태양빛보석',
  moonGem: '달빛보석',
  whiteSilverRing: '순백 은반지',
  rubyHeart: '루비의심장',
  sapphireHeart: '사파이어의심장',
  rainbowBead: '무지개 구슬',
  rainbowCrystal: '무지개 수정',
  starCrystal: '별빛 수정',
  solarBrooch: '태양브로치',
  sunShard: '태양결정조각',
  crescentBrooch: '초승달브로치',
  moonShard: '달빛결정조각',
  solarCharm: '태양의부적',
  lunarCharm: '달의부적',
  shootingStarShard: '별똥별 파편',
  // 코스튬(코스튬-5벌-확정정리.md 재료명 그대로). 낡은 천조각·낡은 털실뭉치·리본조각·헤진 가죽조각은 기존 id 공유.
  freshSprout: '싱그러운 새싹',
  cleanApron: '깨끗한 앞치마',
  explorerCloth: '탐험가의 천조각',
  starEmbroideryThread: '별빛 자수실',
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
