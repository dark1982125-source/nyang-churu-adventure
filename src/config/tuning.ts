/**
 * 테스트용 임시 수치(TEMP) 모음.
 *
 * 기획 문서에 수치가 없는 값은 전부 이 파일에 모은다. 여기 있는 값은 확정 기획이 아니며
 * 플레이 테스트로 조정할 대상이다. 확정된 값(예: 다시냥 방울 50%/3초/판당 1회)은
 * `CONFIRMED` 주석으로 따로 표시한다.
 */

/** 미정 정책의 임시 선택지. 기획에서 확정되면 이 값을 고정하고 나머지 분기를 지운다. */
export type AdvanceMode =
  /** TEMP: 전진 입력을 누르는 동안만 오른쪽 이동, 입력이 없으면 정지 */
  | 'hold'
  /** TEMP: 자동으로 오른쪽 전진, 전방에 적이 있으면 정지 */
  | 'auto';

export const TUNING = {
  /** 미정: 자동/수동 전진. 캠프 화면 설정에서 바꿀 수 있는 검토용 옵션. */
  defaultAdvanceMode: 'hold' as AdvanceMode,

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
  },

  basicAttack: {
    interval: 0.45, // TEMP
    range: 70, // TEMP
    damage: 10, // TEMP
    /** 미정: 기본 공격 최대 레벨 */
    maxLevel: 5, // TEMP
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
    /** 미정: 공통 패시브 보유 한도. null = 제한 없음(임시). 3칸 확정 아님. */
    passiveSlotLimit: null as number | null,
    passiveMaxLevel: 5, // TEMP
    campSkillMaxLevel: 5, // TEMP 미정: 캠프 스킬 등급 체계
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

  pickups: {
    magnetRadius: 130, // TEMP
    magnetSpeed: 420, // TEMP
    /** 화면 뒤로 놓친 드롭을 기록하는 거리 */
    missedBehind: 300,
  },

  waves: {
    /** 동시에 살아 있는 적 최대 수 */
    maxAlive: 9, // TEMP
    /** 웨이브 시작 지점에서 전방 전투 구역 끝까지 */
    arenaLength: 200, // TEMP
    /** 전투 구역 끝에서 적 스폰 지점까지(화면 밖 전방) */
    spawnAhead: 600, // TEMP
    /** 분열 적 세대 상한. 무한 분열 방지용 기술적 장치 */
    maxSplitGeneration: 1, // TEMP
  },

  supports: {
    barrier: { interval: 12, shield: 25, levelShield: 10, levelInterval: 1 }, // TEMP 수염할아버지 골골송 배리어
    laser: { interval: 3.2, damage: 22, levelDamage: 8, levelInterval: 0.3 }, // TEMP 삐콩이 서치 레이저
    capsule: { interval: 14, heal: 20, levelHeal: 6, levelInterval: 1.5, lifetime: 9, dropAhead: 170 }, // TEMP 코숏 캣닢 캡슐
    campRepair: 30, // TEMP 캠프 선택지 '응급 보수' 즉시 회복량
  },
} as const;

export type Grade = 'normal' | 'unique' | 'legend';
