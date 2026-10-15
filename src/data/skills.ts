/**
 * 무기·기술 데이터. 이름과 효과 설명은 무기-6종-기획정리.md 2절(젤리 펀치 장갑) 그대로이고,
 * 피해·냥기력·쿨타임·범위·궁극기 충전량은 전부 TEMP.
 *
 * 다른 무기는 WEAPONS에 같은 형태로 추가하면 된다(플러그인 구조). 지금은 기본 지급 무기인
 * 장갑만 전투 동작이 연결되어 있다.
 */

export type ExclusiveSkillId = 'udada' | 'uppercut' | 'straight' | 'kneading' | 'purrBeam';

export type SkillShape =
  /** 가까운 전방 적에게 순서대로 작은 주먹을 날리고, 앞 적이 죽으면 다음 적으로 넘어간다 */
  | { kind: 'chain'; shots: number; shotInterval: number; range: number }
  /** 전방 직사각형 구역 즉시 타격 (관통) */
  | { kind: 'zone'; x1: number; x2: number; y1: number; y2: number; hits: number; hitInterval: number; telegraph: number }
  /** 전방 빔 (관통, 기절) */
  | { kind: 'beam'; length: number; height: number; stun: number; telegraph: number };

export interface ExclusiveSkillDef {
  id: ExclusiveSkillId;
  name: string;
  desc: string;
  damage: number; // TEMP 1타 피해
  energy: number; // TEMP 냥기력 소모
  cooldown: number; // TEMP
  ultCharge: number; // TEMP 실제 발동 시 궁극기 게이지 충전량(차등)
  /** 발동 조건 거리: 이 거리 안 전방에 적이 있어야 자동 발동 */
  triggerRange: number;
  shape: SkillShape;
}

export interface WeaponDef {
  id: string;
  name: string;
  basicAttack: { name: string; desc: string };
  exclusives: ExclusiveSkillDef[];
}

export const GLOVE: WeaponDef = {
  id: 'jellyGlove',
  name: '젤리 펀치 장갑',
  basicAttack: { name: '냥냥 펀치', desc: '빠른 전방 냥냥 펀치' },
  exclusives: [
    {
      id: 'udada', name: '우다다 냥냥냥냥!',
      desc: '가까운 전방으로 작은 젤리 주먹 연속 발사. 앞의 적 처치 후 뒤의 적으로 이어짐',
      damage: 9, energy: 18, cooldown: 4.5, ultCharge: 8, triggerRange: 240,
      shape: { kind: 'chain', shots: 6, shotInterval: 0.09, range: 260 },
    },
    {
      id: 'uppercut', name: '폴짝폴짝 어퍼컷',
      desc: '전방 아래에서 위로 주먹 기운 상승, 지상·낮은 공중 타격 (강제 점프 없음)',
      damage: 26, energy: 15, cooldown: 3.5, ultCharge: 6, triggerRange: 110,
      shape: { kind: 'zone', x1: 20, x2: 110, y1: 0, y2: 130, hits: 1, hitInterval: 0, telegraph: 0 },
    },
    {
      id: 'straight', name: '쭉쭉 스트레이트',
      desc: '젤리 팔이 짧고 빠르게 뻗었다 돌아오며 직선 관통',
      damage: 22, energy: 12, cooldown: 2.8, ultCharge: 5, triggerRange: 170,
      shape: { kind: 'zone', x1: 10, x2: 180, y1: 8, y2: 44, hits: 1, hitInterval: 0, telegraph: 0 },
    },
    {
      id: 'kneading', name: '꾹꾹이 꾹꾹',
      desc: '전방 앞발 그림자 후 거대 앞발이 번갈아 내려와 공중·지상 반복 광역 타격',
      damage: 16, energy: 28, cooldown: 7, ultCharge: 12, triggerRange: 300,
      shape: { kind: 'zone', x1: 60, x2: 300, y1: 0, y2: 220, hits: 4, hitInterval: 0.22, telegraph: 0.6 },
    },
    {
      id: 'purrBeam', name: '골골냥냥파',
      desc: '거대한 에너지를 전방 발사, 피해·기절',
      damage: 40, energy: 35, cooldown: 9, ultCharge: 16, triggerRange: 380,
      shape: { kind: 'beam', length: 420, height: 56, stun: 1.5, telegraph: 0.35 },
    },
  ],
};

export const WEAPONS: Record<string, WeaponDef> = { [GLOVE.id]: GLOVE };

/** 공통 패시브(판 한정). 보유 한도는 미정이라 TUNING.growth.passiveSlotLimit로 분리. */
export type PassiveId = 'vitality' | 'energyFlow' | 'luckyBell' | 'sharpClaws';
export const PASSIVES: Record<PassiveId, { name: string; desc: string }> = {
  vitality: { name: '말랑 체력', desc: '최대 HP +15, 즉시 15 회복 (TEMP)' },
  energyFlow: { name: '기력 순환', desc: '냥기력 회복 +25% (TEMP)' },
  luckyBell: { name: '행운의 꼬리', desc: '판 임시 행운 +2 (TEMP)' },
  sharpClaws: { name: '날카로운 발톱', desc: '모든 피해 +8% (TEMP)' },
};

/** 캠프 선택창 후보(캠프 경험치). 캠프 스킬 등급/행운 적용은 미정이라 단순 레벨만 둔다. */
export type CampSkillId = 'barrier' | 'laser' | 'capsule' | 'repair';
export const CAMP_SKILLS: Record<CampSkillId, { name: string; desc: string; companion: string | null }> = {
  barrier: { name: '골골송 배리어 강화', desc: '수염할아버지 배리어 보호량·주기 강화', companion: 'grandpa' },
  laser: { name: '서치 레이저 강화', desc: '삐콩이 레이저 피해·주기 강화', companion: 'pikong' },
  capsule: { name: '캣닢 캡슐 강화', desc: '코숏 캡슐 회복량·주기 강화', companion: 'kosyot' },
  repair: { name: '응급 보수', desc: '캠프 멘탈 즉시 회복 (반복 선택 가능)', companion: null },
};

/**
 * 궁극기 6종. 분류(공격 광역/단일, 방어 감속/튕겨내기, 회복 호냥이/캠프 완전회복)는 확정,
 * 명칭·효과 수치·해금 조건은 미정이라 아래 효과는 전부 검토용 TEMP 자리표시자다.
 */
export type UltimateId = 'atkArea' | 'atkSingle' | 'defSlow' | 'defReflect' | 'healHero' | 'healCamp';
export const ULTIMATES: Record<UltimateId, { name: string; category: string; tempEffect: string }> = {
  atkArea: { name: '공격·광역 (가칭)', category: '공격', tempEffect: '화면 안 모든 적 60 피해' },
  atkSingle: { name: '공격·단일 (가칭)', category: '공격', tempEffect: '가장 강한 전방 적 220 피해' },
  defSlow: { name: '방어·감속 (가칭)', category: '방어', tempEffect: '5초간 모든 적 50% 감속' },
  defReflect: { name: '방어·튕겨내기 (가칭)', category: '방어', tempEffect: '적 투사체·충격파 제거, 적 밀어냄' },
  healHero: { name: '회복·호냥이 (가칭)', category: '회복', tempEffect: '호냥이 HP 완전 회복' },
  healCamp: { name: '회복·캠프 (가칭)', category: '회복', tempEffect: '캠프 멘탈 완전 회복' },
};
