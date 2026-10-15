import type { LootId } from './items';
import type { StatusTag } from './medicines';

/**
 * Ch 1 적 정의. 이름·역할·드롭처는 기획 문서 기준, 모든 수치는 TEMP.
 * 드롭처 근거: 무기-6종-기획정리.md 2·3·6·8절.
 */
export type EnemyKind =
  | 'dustSlime' | 'spikyBug' | 'meteorRat' | 'rollingRat' | 'kingDustSlime' | 'stompSole'
  /** TEMP 시험 적: 캠프 위협 A(지상 원거리 투척), B(공중 투하). 확정 몬스터 아님 */
  | 'pebbleRat' | 'dustBat';
export type EnemyRank = 'normal' | 'elite' | 'boss';

export interface LootRoll {
  id: LootId;
  chance: number; // TEMP
  min: number; // TEMP
  max: number; // TEMP
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  rank: EnemyRank;
  hp: number;
  speed: number;
  width: number;
  height: number;
  contactDamage: number;
  contactInterval: number;
  /** 작은 개다래(호냥이 경험치) 개수 */
  catnip: number;
  /** 작은 톱니(캠프 경험치) 드롭 확률 */
  gearChance: number;
  loot: LootRoll[];
  /** 분열: 처치 시 생성할 자식 */
  splitInto?: { kind: EnemyKind; count: number };
  /** 공중 적: 이 높이에 떠 있다. 지면 이동을 막지 않고 접촉 피해 없음 */
  flying?: { altitude: number };
  /** 캠프 조준 공격(캠프 위협 시험안). 호냥이 전방 standoff 거리에 머물며 예고 후 캠프로 투사체 */
  campShot?: CampShotDef;
  /**
   * [시험] 상태이상 동반 공격. 설정의 '[시험] 적 상태이상' 이 켜졌을 때만 쓴다.
   * Ch 1 적의 상태이상 공격은 기획 미정이라 기본은 꺼져 있다(치료·처방 확인용).
   */
  testStatus?: { tag: StatusTag; intensity: number; duration: number };
  /** 확정 몬스터가 아닌 시험 적 표시 */
  temp?: boolean;
}

export interface CampShotDef {
  /** lob: 지상에서 포물선 투척(조준선 예고). drop: 공중에서 캠프 위로 날려 떨어뜨림(낙하 그림자 예고) */
  style: 'lob' | 'drop';
  /** 호냥이 앞 이 거리에 머문다 */
  standoff: number;
  /** 이만큼 던진 뒤에는 호냥이 앞까지 다가온다(끝까지 멀리서만 쏘지 않게, TEMP) */
  shotsBeforeAdvance: number;
  cooldown: number;
  telegraph: number;
  /** 캠프까지 비행 시간 */
  duration: number;
  /** 시작 높이·도착 높이·포물선 높이 */
  startY: number;
  endY: number;
  arc: number;
  radius: number;
  /** 펀치·기술로 부수는 내구도 */
  hp: number;
  campDamage: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  dustSlime: {
    kind: 'dustSlime', name: '먼지 슬라임', rank: 'normal',
    hp: 24, speed: 42, width: 34, height: 26, contactDamage: 6, contactInterval: 0.8,
    catnip: 1, gearChance: 0.35,
    loot: [
      { id: 'softJelly', chance: 0.35, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 },
      // 보호구 재료(위임 배치 승인, 확률 TEMP): 폭신 마시멜로·끈끈 슬라임풀
      { id: 'fluffyMarshmallow', chance: 0.3, min: 1, max: 1 }, { id: 'stickySlimeGlue', chance: 0.12, min: 1, max: 1 },
      { id: 'fadedBead', chance: 0.15, min: 1, max: 1 }, // 액세서리 재료(위임 배치안, 확률 TEMP)
    ],
    testStatus: { tag: 'slow', intensity: 0.4, duration: 3 },
  },
  spikyBug: {
    kind: 'spikyBug', name: '삐죽 풀벌레', rank: 'normal',
    hp: 18, speed: 72, width: 30, height: 22, contactDamage: 5, contactInterval: 0.8,
    catnip: 1, gearChance: 0.35,
    loot: [
      { id: 'oldYarn', chance: 0.3, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 },
      { id: 'fadedBell', chance: 0.2, min: 1, max: 1 }, // 액세서리 재료(위임 배치안, 확률 TEMP)
    ],
    testStatus: { tag: 'bleed', intensity: 3, duration: 4 },
  },
  meteorRat: {
    kind: 'meteorRat', name: '운석 쥐', rank: 'normal',
    hp: 30, speed: 110, width: 32, height: 24, contactDamage: 8, contactInterval: 0.8,
    catnip: 2, gearChance: 0.4,
    loot: [
      { id: 'smallStone', chance: 0.3, min: 1, max: 1 },
      { id: 'oldYarn', chance: 0.2, min: 1, max: 1 },
      { id: 'emptyChuru', chance: 0.2, min: 1, max: 1 },
      { id: 'nyangJelly', chance: 0.3, min: 1, max: 1 },
      // 보호구 재료(위임 배치 승인, 확률 TEMP): 낡은 천조각·낡은 스웨터
      { id: 'oldCloth', chance: 0.3, min: 1, max: 1 },
      { id: 'oldSweater', chance: 0.3, min: 1, max: 1 },
      { id: 'wornLeather', chance: 0.15, min: 1, max: 1 }, // 헤진 가죽조각(확인서 수급안, 확률 TEMP)
    ],
    testStatus: { tag: 'burn', intensity: 4, duration: 3 },
  },
  rollingRat: {
    kind: 'rollingRat', name: '돌돌 운석쥐', rank: 'elite',
    hp: 200, speed: 60, width: 52, height: 42, contactDamage: 10, contactInterval: 0.8,
    catnip: 8, gearChance: 1,
    loot: [
      { id: 'smallStone', chance: 1, min: 2, max: 3 },
      { id: 'smoothStone', chance: 0.6, min: 1, max: 1 },
      { id: 'nyangJelly', chance: 1, min: 3, max: 5 },
      { id: 'sunDust', chance: 1, min: 2, max: 4 }, // 마법의 햇살가루(위임 배치안, 수량 TEMP)
    ],
  },
  kingDustSlime: {
    kind: 'kingDustSlime', name: '왕먼지 슬라임', rank: 'elite',
    hp: 240, speed: 34, width: 64, height: 50, contactDamage: 10, contactInterval: 0.9,
    catnip: 8, gearChance: 1,
    loot: [
      { id: 'hardJelly', chance: 1, min: 3, max: 5 }, // 단단젤리 일반 난도 엘리트 100% 3~5 (확정 초기 설정)
      { id: 'softJelly', chance: 1, min: 1, max: 2 },
      { id: 'nyangJelly', chance: 1, min: 3, max: 5 },
      { id: 'cloudCottonCandy', chance: 1, min: 3, max: 5 }, // 보호구 기본 강화재(위임 배치 승인, 수량 TEMP)
    ],
    splitInto: { kind: 'dustSlime', count: 3 }, // TEMP 분열 수
    testStatus: { tag: 'poison', intensity: 3, duration: 5 },
  },
  stompSole: {
    kind: 'stompSole', name: '쿵쿵 돌발바닥', rank: 'boss',
    hp: 650, speed: 30, width: 96, height: 92, contactDamage: 14, contactInterval: 1,
    catnip: 0, gearChance: 0,
    loot: [
      { id: 'smallStone', chance: 1, min: 3, max: 4 },
      { id: 'smoothStone', chance: 1, min: 1, max: 2 },
      { id: 'nyangJelly', chance: 1, min: 8, max: 10 },
      { id: 'goldenCatnip', chance: 1, min: 1, max: 2 },
      { id: 'golgolGear', chance: 1, min: 2, max: 3 },
    ],
  },

  // ── 캠프 위협 시험안(TEMP). 이름·외형·수치·등장 빈도 모두 확정 아님.
  pebbleRat: {
    kind: 'pebbleRat', name: '(시험) 조약돌 투척쥐', rank: 'normal', temp: true,
    hp: 22, speed: 70, width: 30, height: 26, contactDamage: 5, contactInterval: 0.9,
    catnip: 1, gearChance: 0.4,
    loot: [{ id: 'smallStone', chance: 0.3, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 }],
    campShot: { style: 'lob', standoff: 240, shotsBeforeAdvance: 2, cooldown: 4.2, telegraph: 0.9, duration: 1.6, startY: 30, endY: 50, arc: 110, radius: 11, hp: 1, campDamage: 10 },
  },
  dustBat: {
    kind: 'dustBat', name: '(시험) 먼지 박쥐', rank: 'normal', temp: true,
    hp: 18, speed: 80, width: 30, height: 20, contactDamage: 0, contactInterval: 1,
    catnip: 1, gearChance: 0.4,
    loot: [{ id: 'oldYarn', chance: 0.3, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 }],
    flying: { altitude: 125 },
    campShot: { style: 'drop', standoff: 150, shotsBeforeAdvance: 2, cooldown: 5, telegraph: 1.1, duration: 1.3, startY: 125, endY: 40, arc: 30, radius: 12, hp: 1, campDamage: 12 },
  },
};

/** 쿵쿵 돌발바닥 패턴(TEMP). 대시 없이 점프·전진·정지로 대응 가능해야 한다. */
export const BOSS_PATTERNS = {
  /** 발 구르기 → 지면을 따라 왼쪽으로 이동하는 충격파. 점프로 피한다. */
  shockwave: {
    cooldown: 3.6, telegraph: 0.8, speed: 260, width: 40, height: 30, damage: 14, campDamage: 4,
    /** [시험] 상태이상 켰을 때만 */
    testStatus: { tag: 'freeze' as StatusTag, intensity: 1, duration: 1.2 },
  },
  /** 돌 투척(원안): 캠프를 향해 큰 돌을 포물선으로 던진다. 호냥이가 공중 펀치·기술로 부술 수 있다. */
  rockThrow: { cooldown: 5.5, telegraph: 0.9, duration: 3.2, startY: 110, endY: 60, arc: 140, radius: 20, hp: 10, campDamage: 14 },
} as const;

/** 돌돌 운석쥐 구르기(TEMP). 점프 중이면 피해 없이 멈춘다(뒤로 넘어가지 않음). */
export const ROLL_PATTERN = { cooldown: 4.2, telegraph: 0.7, speed: 360, damage: 15, bounce: 140 } as const;

/**
 * 적 등급별 제어 저항(확정 방식). 수치는 TUNING.enemyCc(TEMP).
 * 수면·기절·빙결: 일반 정상, 엘리트 단축, 보스는 행동정지 대신 짧은 감속.
 * 밀쳐내기: 일반 정상, 엘리트 거리 감소, 보스 위치 이동 면역. DOT는 전 등급 적용.
 */
export type EnemyCcKind = 'sleep' | 'stun' | 'freeze';
