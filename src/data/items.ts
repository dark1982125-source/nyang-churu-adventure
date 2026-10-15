/** 영구 재화·제작 재료·판 안 경험치 아이템의 이름표. 이름은 기획 문서 그대로. */

export type CurrencyId = 'nyangJelly' | 'goldenCatnip' | 'golgolGear';
export type MaterialId =
  | 'softJelly' // 말랑 젤리덩이
  | 'hardJelly' // 단단젤리
  | 'smallStone' // 작은 돌조각
  | 'smoothStone' // 매끈한 돌조각
  | 'oldYarn' // 낡은 털실뭉치
  | 'emptyChuru'; // 다 먹은 츄르봉지
export type RunPickupId = 'smallCatnip' | 'smallGear' | 'reviveBell' | 'jailKey';

export const CURRENCY_NAMES: Record<CurrencyId, string> = {
  nyangJelly: '냥젤리',
  goldenCatnip: '황금 개다래',
  golgolGear: '골골기어',
};

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  softJelly: '말랑 젤리덩이',
  hardJelly: '단단젤리',
  smallStone: '작은 돌조각',
  smoothStone: '매끈한 돌조각',
  oldYarn: '낡은 털실뭉치',
  emptyChuru: '다 먹은 츄르봉지',
};

export const PICKUP_NAMES: Record<RunPickupId, string> = {
  smallCatnip: '작은 개다래',
  smallGear: '작은 톱니',
  reviveBell: '다시냥 방울',
  jailKey: '감옥 열쇠',
};

export type LootId = CurrencyId | MaterialId;
export const LOOT_NAMES: Record<LootId, string> = { ...CURRENCY_NAMES, ...MATERIAL_NAMES };
