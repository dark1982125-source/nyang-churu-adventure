/**
 * 닥터 코숏 치료품. 이름·해제 대상은 치료-상태이상-방어-확정.md 기준(확정).
 * 게임 안 고양이 전용 처방 연출이며 실제 제품·사용법이 아니다.
 * 이전의 '만능 개다래 정화약'은 폐기: 개다래 정화약은 이제 독만 푼다.
 */
export type StatusTag = 'poison' | 'burn' | 'bleed' | 'freeze' | 'slow';
export type DotTag = 'poison' | 'burn' | 'bleed';
export const DOT_TAGS: DotTag[] = ['poison', 'burn', 'bleed'];

export const STATUS_NAMES: Record<StatusTag, string> = {
  poison: '독', burn: '화상', bleed: '출혈', freeze: '빙결', slow: '감속',
};

/** 개별 약 5종 + 만능 처방약. 캣닢 캡슐(HP)은 별도 pickup 'capsule'. */
export type MedicineId = 'antidote' | 'bandage' | 'mintOintment' | 'hotPack' | 'nyangCas' | 'panacea';

export interface MedicineDef {
  id: MedicineId;
  name: string;
  /** 해제하는 상태. 감속은 적 기술 감속만(지형 둔화 제외) */
  cures: StatusTag[];
}

export const MEDICINES: Record<MedicineId, MedicineDef> = {
  antidote: { id: 'antidote', name: '개다래 정화약', cures: ['poison'] },
  bandage: { id: 'bandage', name: '보송보송 붕대', cures: ['bleed'] },
  mintOintment: { id: 'mintOintment', name: '시원 민트연고', cures: ['burn'] },
  hotPack: { id: 'hotPack', name: '캡사이신 핫팩', cures: ['freeze'] },
  nyangCas: { id: 'nyangCas', name: '사뿐 냥카스', cures: ['slow'] },
  /** 골골기어 영구 진화 해금. HP 회복 없음. 지형 둔화·붙잡힘·바퀴 속박·봉인·시야 가림 제외 */
  panacea: { id: 'panacea', name: '코숏의 만능 처방약', cures: ['poison', 'burn', 'bleed', 'freeze', 'slow'] },
};

/** 증상 → 개별 약 */
export const MEDICINE_FOR: Record<StatusTag, MedicineId> = {
  poison: 'antidote', bleed: 'bandage', burn: 'mintOintment', freeze: 'hotPack', slow: 'nyangCas',
};

/** 캣닢 캡슐 표시명 */
export const CAPSULE_NAME = '캣닢 캡슐';
