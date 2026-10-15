/** 동료 정의. 구출 챕터는 현재-개발기준.md 기준. */
export type CompanionId = 'grandpa' | 'pikong' | 'kosyot' | 'kangkang' | 'samsaek' | 'bolt' | 'nabi' | 'eolluk';

export interface CompanionDef {
  id: CompanionId;
  name: string;
  /** 처음부터 동행 */
  initial: boolean;
  rescueChapter?: number;
  support: string;
  /** 이 브랜치에서 전투 지원이 실제로 동작하는지 */
  implemented: boolean;
}

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  grandpa: { id: 'grandpa', name: '수염할아버지', initial: true, support: '골골송 배리어', implemented: true },
  pikong: { id: 'pikong', name: '삐콩이', initial: true, support: '서치 레이저', implemented: true },
  kosyot: { id: 'kosyot', name: '닥터 코숏', initial: false, rescueChapter: 1, support: '캣닢 캡슐 투하', implemented: true },
  kangkang: { id: 'kangkang', name: '대장장이 깡깡이', initial: false, rescueChapter: 2, support: '무기 제작', implemented: false },
  samsaek: { id: 'samsaek', name: '셰프 삼색이', initial: false, rescueChapter: 3, support: '냥기력 보급', implemented: false },
  bolt: { id: 'bolt', name: '엔지니어 볼트', initial: false, rescueChapter: 4, support: '캠프 응급수리', implemented: false },
  nabi: { id: 'nabi', name: '나비', initial: false, rescueChapter: 6, support: '보호구·액세서리 제작', implemented: false },
  eolluk: { id: 'eolluk', name: '얼룩이', initial: false, rescueChapter: 8, support: '캠프 위장막', implemented: false },
};
