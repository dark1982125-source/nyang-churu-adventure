/**
 * 테스트용 임시 수치(TEMP) 모음.
 *
 * 기획 문서에 수치가 없는 값은 전부 이 파일에 모은다. 여기 있는 값은 확정 기획이 아니며
 * 플레이 테스트로 조정할 대상이다. 확정된 값(예: 다시냥 방울 50%/3초/판당 1회)은
 * `CONFIRMED` 주석으로 따로 표시한다.
 */

/** 전진 방식. 확정 규칙은 hold. auto는 비교용 개발 도구로만 남긴다. */
export type AdvanceMode =
  /** CONFIRMED: 입력 중 오른쪽 전진, 놓으면 정지 */
  | 'hold'
  /** 비교 도구: 자동으로 오른쪽 전진, 전방에 적이 있으면 정지 */
  | 'auto';

/** 적·호냥이 상호 통과 처리. 확정 규칙은 frontBlock. jumpPass는 비교용 개발 도구로만 남긴다. */
export type PassPolicy =
  /** CONFIRMED: 점프 중에도 적과 호냥이가 서로 넘어가 뒤에 남지 않는다 */
  | 'frontBlock'
  /** 비교 도구(이전 안): 점프 중 서로 지나갈 수 있고, 삐콩이 레이저가 뒤쪽 적을 우선 조준 */
  | 'jumpPass';

export const TUNING = {
  defaultAdvanceMode: 'hold' as AdvanceMode, // CONFIRMED
  defaultPassPolicy: 'frontBlock' as PassPolicy, // CONFIRMED

  world: {
    gravity: 1500, // TEMP
    groundY: 0,
    /** 카메라에서 호냥이 왼쪽에 보이는 폭 */
    viewBehind: 260,
    viewAhead: 700,
  },

  player: {
    width: 36,
    height: 48,
    maxHp: 100, // TEMP
    moveSpeed: 150, // TEMP 전진 속도
    jumpVelocity: 560, // TEMP
    contactInvuln: 0.6, // TEMP 피격 후 무적
    maxEnergy: 100, // TEMP 냥기력 최대치
    energyRegen: 6, // TEMP 초당 자연 회복
    baseLuck: 0, // TEMP 영구 기본 행운 시작값
    baseCritChance: 0.05, // TEMP
    baseCritMultiplier: 1.5, // TEMP
    /** 기본 공격 세로 판정: 호냥이 머리 위로 이만큼 더 닿는다(공중 펀치) */
    punchReachUp: 45, // TEMP
  },

  basicAttack: {
    interval: 0.45, // TEMP
    range: 70, // TEMP
    damage: 10, // TEMP
    /** Lv.1 시작, 최대 Lv.5, 등급 진화 없음 */
    maxLevel: 5, // CONFIRMED
    damagePerLevel: 0.2, // TEMP 레벨당 +20%
    intervalPerLevel: 0.04, // TEMP 레벨당 주기 감소
  },

  camp: {
    width: 90,
    height: 70,
    maxMental: 100, // TEMP
    /** 이동 중 호냥이와의 간격. 미정: 캠프 간격 */
    followGap: 200, // TEMP
    moveSpeed: 170, // TEMP
    /** 캠프에 붙은 적의 초당 멘탈 피해 */
    contactDps: 4, // TEMP
  },

  ultimate: {
    gaugeMax: 100, // TEMP
    /** 미정: 기본 공격이 궁극기 게이지를 채우는지 여부 */
    basicAttackCharges: false, // TEMP
    basicAttackChargeAmount: 1, // TEMP (위 옵션이 켜졌을 때만)
    maxEquipped: 3, // CONFIRMED 최대 3종 장착
  },

  growth: {
    /** 호냥이 레벨업 필요 경험치(작은 개다래) */
    heroXpCurve: (level: number) => 3 + level * 2, // TEMP
    /** 캠프 레벨업 필요 경험치(작은 톱니) */
    campXpCurve: (level: number) => 3 + level * 2, // TEMP
    exclusiveSlots: 3, // CONFIRMED 전용 5종 중 최대 3종
    passiveSlotLimit: 5, // CONFIRMED 공통 패시브 최대 5종
    passiveMaxLevel: 5, // CONFIRMED 각 Lv.5, 등급 진화 없음
    campSkillMaxLevel: 5, // CONFIRMED 각 지원 판 안 임시 강화 최대 Lv.5 (영구 진화는 별도)
    /** 등급별 피해 배율. 일반 Lv1~3, 유니크 Lv1~3, 전설 */
    gradeDamage: { normal: [1.0, 1.25, 1.5], unique: [1.9, 2.2, 2.5], legend: [3.2] }, // TEMP
    gradeCooldown: { normal: [1.0, 0.95, 0.9], unique: [0.85, 0.8, 0.75], legend: [0.65] }, // TEMP
  },

  luck: {
    /** 미정: 행운 공식·상한·기본 확률. 일반 94/유니크 5/전설 1은 이전 테스트 제안값. */
    baseUniqueChance: 0.05, // TEMP
    baseLegendChance: 0.01, // TEMP
    uniquePerLuck: 0.01, // TEMP
    legendPerLuck: 0.003, // TEMP
    uniqueCap: 0.3, // TEMP
    legendCap: 0.1, // TEMP
    /** 희귀 드롭 확률 배율: 1 + luck * rareDropPerLuck */
    rareDropPerLuck: 0.1, // TEMP
  },

  revive: {
    hpRatio: 0.5, // CONFIRMED 최대 HP의 50%
    invuln: 3, // CONFIRMED 3초 무적
    perRun: 1, // CONFIRMED 판당 1회
    /** 엘리트·보스 처치 시 다시냥 방울 드롭 확률 */
    eliteDropChance: 0.15, // TEMP
  },

  /** 공통 패시브 레벨당 효과. 적용 범위는 확정, 수치·상한은 전부 TEMP. */
  passives: {
    attack: 0.08, // 기본 공격·전용 스킬·공격 궁극기 +8%/Lv
    skillDamage: 0.1, // 전용 스킬만 +10%/Lv
    attackSpeed: 0.08, // 기본 공격 주기 -8%/Lv
    critChance: 0.05, // +5%p/Lv
    critDamage: 0.2, // 치명타 배율 +0.2/Lv
    maxHp: 15, // +15/Lv, 현재 HP도 같이 증가
    hpRegen: 0.8, // 초당 회복량/Lv (습득 시에만 자연 회복)
    /** 방어 포인트/Lv. 공식(100/(100+방어력))은 확정, 포인트는 TEMP */
    defense: 10,
    evasion: 0.04, // +4%p/Lv
    maxEnergy: 12, // +12/Lv, 현재 기력도 같이 증가
    energyRegen: 0.2, // 기본 회복 속도 +20%/Lv
    luck: 2, // +2/Lv
    pickupRadius: 0.25, // 수집 반경 +25%/Lv
    cooldown: 0.06, // 전용 스킬 쿨타임 -6%/Lv
    caps: { evasion: 0.4, cooldown: 0.5, critChance: 0.6 }, // 미정 상한
  },

  /**
   * 호냥이 방어력. CONFIRMED: 최종 방어력 = 영구 스탯 + 장비 + 판 임시 보너스,
   * 직접 피해(접촉·근접·투사체·폭발) × 100/(100+방어력), DOT·위험지형 지속 피해 제외.
   * 포인트·반올림·음수 방어·다른 감산 순서·캠프 적용은 미정.
   */
  defense: {
    base: 0, // TEMP 영구 기본 방어력
    perNodeLevel: 5, // TEMP 영구 성장 테스트 노드 1레벨당
    /** 미정: 음수 방어. 지금은 0 미만을 0으로 본다 */
    minDefense: 0, // TEMP
    /** 미정: 반올림. 지금은 반올림하지 않는다(소수 HP 피해 유지) */
    round: false, // TEMP
  },

  /**
   * 보호구 능력치(보호구-6종-확정정리.md). 등급별로 붙는 효과 종류는 확정(src/data/armor.ts),
   * 수치는 전부 TEMP. 모자 2종 수치는 문서가 준 초기 테스트 수치(이것도 TEMP 밸런스).
   * curve: +0 base, +1~4 단계마다 perLow, +5 unique(총), +6~9 단계마다 perHigh, +10 legend(총).
   * step: 등급(일반/+5 유니크/+10 전설)별 값. 0이면 그 등급에 해당 효과 없음.
   * 저항 값은 지속시간(밀쳐내기는 거리, 치명타는 추가 피해) 감소 비율. 면역 아님.
   */
  armor: {
    quiltHat: { maxHp: { base: 20, perLow: 2, unique: 35, perHigh: 3, legend: 60 }, bleed: [0.1, 0.2, 0.3] }, // TEMP(문서 초기 테스트 수치)
    explorerHelmet: { maxHp: { base: 20, perLow: 2, unique: 35, perHigh: 3, legend: 60 }, stun: [0.1, 0.2, 0.3] }, // TEMP(문서 초기 테스트 수치)
    quiltVest: { defense: { base: 8, perLow: 1, unique: 15, perHigh: 1.5, legend: 25 }, knockback: [0, 0.2, 0.3], critDamage: [0, 0, 0.2] }, // TEMP
    bulletArmor: { defense: { base: 12, perLow: 1.5, unique: 22, perHigh: 2, legend: 35 }, burn: [0, 0.2, 0.3], maxHp: [0, 0, 20] }, // TEMP 조끼보다 높은 방어(확정 관계)
    squishySneaker: { evasion: { base: 0.03, perLow: 0.003, unique: 0.06, perHigh: 0.005, legend: 0.1 }, slow: [0, 0.2, 0.3], freeze: [0, 0, 0.2] }, // TEMP
    explorerBoots: { defense: { base: 6, perLow: 1, unique: 12, perHigh: 1.5, legend: 20 }, knockback: [0, 0.2, 0.3], slow: [0, 0, 0.2] }, // TEMP
  },

  /**
   * 미정 규칙의 시험 옵션(사용자 결정 전). 기본값은 지금 동작을 바꾸지 않는 쪽.
   * - resist: 같은 종류 저항이 여러 장비에서 올 때 합산 방식·상한·빙결 최대시간과의 적용 순서.
   * - enemyCrit: 적 치명타 발생 규칙. 확정 전이라 기본 꺼짐(조끼 +10 치명타 피해 감소는 꺼져 있으면 효과 없음).
   * - heroKnockback: 호냥이가 밀려날 때 캠프 동기 이동과의 관계. 지금 호냥이를 미는 적은 없다(시험 진입점만).
   */
  undecided: {
    resist: {
      stacking: 'additive' as 'additive' | 'multiplicative', // TEMP 합산 / 곱연산(1-∏(1-r))
      cap: 0.6, // TEMP 저항 합산 상한
      /** 빙결: 'resistThenCap' 저항 뒤 최대시간 제한, 'capThenResist' 최대시간 제한 뒤 저항 */
      freezeOrder: 'resistThenCap' as 'resistThenCap' | 'capThenResist', // TEMP
    },
    enemyCrit: {
      enabled: false, // 미정: 적 치명타 없음이 기본
      chance: 0.1, // TEMP(켰을 때만)
      multiplier: 1.5, // TEMP
      /** 'bonusOnly' 치명타 추가분만 감소, 'wholeHit' 치명타 피해 전체 감소 */
      reduction: 'bonusOnly' as 'bonusOnly' | 'wholeHit', // TEMP
    },
    heroKnockback: {
      /** 'campStays' 캠프는 제자리(간격 줄어듦, 최소 간격에서 멈춤), 'campPushed' 캠프도 같이 밀려 간격 유지 */
      campSync: 'campStays' as 'campStays' | 'campPushed', // TEMP
      minGap: 60, // TEMP 호냥이-캠프 최소 간격
    },
  },

  /**
   * 상태이상. 중첩 규칙은 확정(같은 DOT는 강한 효과 유지·시간 갱신, 빙결·감속은 강도 중첩 없이 시간 갱신,
   * 다른 종류는 공존, 빙결 해제 뒤 짧은 재빙결 면역). 수치는 전부 TEMP.
   */
  status: {
    /** 미정: 약한 효과가 다시 걸릴 때 강한 효과를 얼마나 연장할지. 지금은 강한 강도 그대로 시간만 갱신 */
    weakerRefreshes: true, // TEMP
    /** 빙결 한 번이 이어질 수 있는 최대 시간(재적용으로 무한히 늘지 않게) */
    freezeMaxDuration: 2.5, // TEMP
    /** 빙결 해제(치료·자연 종료) 뒤 재빙결 면역 시간. 시간 미정 */
    refreezeImmunity: 1.5, // TEMP
    /** 감속 중 이동 속도 배율 */
    slowMoveMul: 0.5, // TEMP
  },

  /** 적 등급별 제어 저항. 적용 방식(일반 정상/엘리트 단축·감소/보스 감속 대체·밀쳐내기 면역)은 확정, 수치 TEMP */
  enemyCc: {
    eliteDurationMul: 0.5, // TEMP 엘리트 수면·기절·빙결 시간 배율
    eliteKnockbackMul: 0.4, // TEMP 엘리트 밀쳐내기 거리 배율
    bossSlowMul: 0.6, // TEMP 보스: 행동 정지 대신 이 속도 배율의 감속
    bossSlowDuration: 1.0, // TEMP 보스 감속 대체 시간(원래 시간과 무관한 짧은 감속)
  },

  pickups: {
    magnetRadius: 130, // TEMP 기본 수집 반경
    magnetSpeed: 420, // TEMP
    /** 화면 뒤로 놓친 드롭을 기록하는 거리 */
    missedBehind: 300,
  },

  waves: {
    /** 웨이브 시작 지점에서 더 전진할 수 있는 거리. 확정: 웨이브 중 호냥이·캠프 함께 정차 → 0 */
    arenaLength: 0,
    /** 전투 구역 끝에서 적 스폰 지점까지(화면 밖 전방) */
    spawnAhead: 600, // TEMP
    /** 일반 구간 → 엘리트/보스 등장 연출 시간. 이 동안 전투 타이머 전부 정지(확정), 길이는 TEMP */
    finaleIntro: 1.2, // TEMP
    /** 분열 적 세대 상한. 무한 분열 방지용 기술적 장치 */
    maxSplitGeneration: 1, // TEMP
  },

  supports: {
    barrier: { interval: 12, shield: 25, levelShield: 10, levelInterval: 1 }, // TEMP 수염할아버지 골골송 배리어
    laser: { interval: 3.2, damage: 22, levelDamage: 8, levelInterval: 0.3 }, // TEMP 삐콩이 서치 레이저
    capsule: { interval: 14, heal: 20, levelHeal: 6, levelInterval: 1.5, lifetime: 9, dropAhead: 100 }, // TEMP 코숏 캣닢 캡슐. 투하 위치는 웨이브 정차 중에도 수집 반경(130) 안
    /** 코숏 증상별 처방: 판단 주기마다 증상 하나에 맞는 약 한 개 투하 */
    prescription: { interval: 6, levelInterval: 0.8, retry: 0.5, lifetime: 9, dropAhead: 90 }, // TEMP 빙결로 못 움직여도 반경 안에 떨어지게
    /**
     * 미정: 같은 약이 이미 바닥·비행 중일 때. 'nextSymptom' = 다음 증상 약을 처방, 'wait' = 이번 처방을 건너뛴다.
     * 중복 투하 회피 방향 자체는 확정.
     */
    prescriptionOnDuplicate: 'nextSymptom' as 'nextSymptom' | 'wait', // TEMP
    /** 미정: 초당 피해 동률인 DOT 사이 순서 */
    dotTieOrder: ['poison', 'burn', 'bleed'] as const, // TEMP
    /**
     * 코숏의 만능 처방약(골골기어 영구 진화). 해금 레벨·쿨타임·개별 약 대체/병행은 미정.
     * 'coexist' = 치료 가능한 증상이 minSymptoms 이상일 때만 만능약, 아니면 개별 약.
     */
    panacea: { policy: 'coexist' as 'coexist' | 'replace', minSymptoms: 2, cooldown: 18 }, // TEMP
  },

  /**
   * 후보가 부족한 칸만 채우는 대체 보상. 종류는 확정(호냥이 3종, 캠프 2종), 양은 TEMP.
   * 슬롯을 쓰지 않고 즉시 적용된다.
   */
  fillers: {
    heroJelly: 5, // TEMP 냥젤리(판 획득물로 정산)
    heroHeal: 30, // TEMP HP 즉시 회복
    heroEnergy: 40, // TEMP 냥기력 즉시 회복
    campGear: 1, // TEMP 골골기어(판 획득물로 정산)
    campMental: 25, // TEMP 캠프 멘탈 즉시 회복
  },
} as const;

export type Grade = 'normal' | 'unique' | 'legend';
