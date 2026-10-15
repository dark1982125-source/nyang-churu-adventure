import type { LootId } from './items';

/**
 * Ch 1 적 정의. 이름·역할·드롭처는 기획 문서 기준, 모든 수치는 TEMP.
 * 드롭처 근거: 무기-6종-기획정리.md 2·3·6·8절.
 */
export type EnemyKind = 'dustSlime' | 'spikyBug' | 'meteorRat' | 'rollingRat' | 'kingDustSlime' | 'stompSole';
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
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  dustSlime: {
    kind: 'dustSlime', name: '먼지 슬라임', rank: 'normal',
    hp: 24, speed: 42, width: 34, height: 26, contactDamage: 6, contactInterval: 0.8,
    catnip: 1, gearChance: 0.35,
    loot: [{ id: 'softJelly', chance: 0.35, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 }],
  },
  spikyBug: {
    kind: 'spikyBug', name: '삐죽 풀벌레', rank: 'normal',
    hp: 18, speed: 72, width: 30, height: 22, contactDamage: 5, contactInterval: 0.8,
    catnip: 1, gearChance: 0.35,
    loot: [{ id: 'oldYarn', chance: 0.3, min: 1, max: 1 }, { id: 'nyangJelly', chance: 0.25, min: 1, max: 1 }],
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
    ],
  },
  rollingRat: {
    kind: 'rollingRat', name: '돌돌 운석쥐', rank: 'elite',
    hp: 200, speed: 60, width: 52, height: 42, contactDamage: 10, contactInterval: 0.8,
    catnip: 8, gearChance: 1,
    loot: [
      { id: 'smallStone', chance: 1, min: 2, max: 3 },
      { id: 'smoothStone', chance: 0.6, min: 1, max: 1 },
      { id: 'nyangJelly', chance: 1, min: 3, max: 5 },
    ],
  },
  kingDustSlime: {
    kind: 'kingDustSlime', name: '왕먼지 슬라임', rank: 'elite',
    hp: 240, speed: 34, width: 64, height: 50, contactDamage: 10, contactInterval: 0.9,
    catnip: 8, gearChance: 1,
    loot: [
      { id: 'hardJelly', chance: 1, min: 1, max: 2 },
      { id: 'softJelly', chance: 1, min: 1, max: 2 },
      { id: 'nyangJelly', chance: 1, min: 3, max: 5 },
    ],
    splitInto: { kind: 'dustSlime', count: 3 }, // TEMP 분열 수
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
};

/** 쿵쿵 돌발바닥 패턴(TEMP). 대시 없이 점프·전진·정지로 대응 가능해야 한다. */
export const BOSS_PATTERNS = {
  /** 발 구르기 → 지면을 따라 왼쪽으로 이동하는 충격파. 점프로 피한다. */
  shockwave: { cooldown: 3.6, telegraph: 0.8, speed: 260, width: 40, height: 30, damage: 14, campDamage: 4 },
  /** 돌 던지기 → 호냥이 앞에 그림자 예고 후 낙하, 왼쪽으로 굴러온다. 점프로 넘는다. */
  rockThrow: { cooldown: 5.5, telegraph: 1.0, count: 2, landAhead: 70, spread: 30, stagger: 0.7, radius: 18, height: 34, rollSpeed: 200, damage: 12, campDamage: 3 },
} as const;

/** 돌돌 운석쥐 구르기(TEMP). 점프 중이면 피해 없이 멈춘다(뒤로 넘어가지 않음). */
export const ROLL_PATTERN = { cooldown: 4.2, telegraph: 0.7, speed: 360, damage: 15, bounce: 140 } as const;
