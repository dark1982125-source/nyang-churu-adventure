import type { EnemyKind } from './enemies';
import type { CompanionId } from './companions';

/**
 * 일반 구간(확정 구조): 목표 처치 수를 채울 때까지 잡몹이 계속 생성된다.
 * '계속'은 동시 무한 개체가 아니라, 동시 수·간격을 데이터로 제어한다는 뜻(수치 TEMP).
 */
export interface NormalPhaseDef {
  /** 등장 잡몹과 가중치 */
  pool: { kind: EnemyKind; weight: number }[];
  /** 지정 처치 수. 달성 즉시 스폰 중단·잔여 잡몹 제거 → 엘리트/보스 */
  killTarget: number;
  /** 동시에 살아 있을 수 있는 잡몹 수 */
  maxAlive: number;
  /** 스폰 간격(초) */
  interval: number;
}

export interface WaveDef {
  /**
   * 첫 웨이브 시작 지점. 2·3웨이브와 감옥은 실행 중 앞 구간을 정리한 지점 + 이동 거리(TUNING.advance)로 다시 정해지고,
   * 여기 값은 초기값으로만 쓴다(자동 전진으로 일반 구간에서 전진하는 거리가 판마다 달라서).
   */
  triggerX: number;
  normal: NormalPhaseDef;
  /** 웨이브 끝 엘리트/보스. 본체와 분열·소환체를 전부 처치해야 다음 웨이브 */
  finale: EnemyKind;
}

export interface ChapterDef {
  id: number;
  name: string;
  region: string;
  waves: [WaveDef, WaveDef, WaveDef];
  /** 구출 챕터: 보스 열쇠로 여는 감옥 위치와 동료 */
  rescue?: { companion: CompanionId; jailX: number };
}

/**
 * Ch 1 말랑 운석 평원. 3웨이브·엘리트 1/엘리트 2/보스 구성과 적 종류는 확정,
 * 목표 처치 수·동시 수·간격·지점은 TEMP.
 * pebbleRat(캠프 위협 A)·dustBat(B)은 시험 적(TEMP). 설정의 '[시험] 캠프 위협 A/B'를 끄면 풀에서 빠진다.
 */
export const CHAPTER_1: ChapterDef = {
  id: 1,
  name: 'Ch 1',
  region: '말랑 운석 평원',
  waves: [
    {
      triggerX: 700,
      normal: { pool: [{ kind: 'dustSlime', weight: 3 }, { kind: 'spikyBug', weight: 2 }, { kind: 'pebbleRat', weight: 1 }], killTarget: 9, maxAlive: 5, interval: 1.3 }, // TEMP
      finale: 'rollingRat',
    },
    {
      triggerX: 1900,
      normal: { pool: [{ kind: 'spikyBug', weight: 2 }, { kind: 'meteorRat', weight: 2 }, { kind: 'dustSlime', weight: 2 }, { kind: 'pebbleRat', weight: 2 }, { kind: 'dustBat', weight: 2 }], killTarget: 12, maxAlive: 6, interval: 1.1 }, // TEMP
      finale: 'kingDustSlime',
    },
    {
      triggerX: 3100,
      normal: { pool: [{ kind: 'meteorRat', weight: 3 }, { kind: 'dustSlime', weight: 2 }, { kind: 'spikyBug', weight: 2 }, { kind: 'pebbleRat', weight: 2 }, { kind: 'dustBat', weight: 2 }], killTarget: 13, maxAlive: 7, interval: 1.0 }, // TEMP
      finale: 'stompSole',
    },
  ],
  rescue: { companion: 'kosyot', jailX: 4000 }, // jailX TEMP
};

export const CHAPTERS: ChapterDef[] = [CHAPTER_1];

/** 지정 처치 수 합계 = 일반 구간 목표 + 엘리트/보스 본체. 분열·소환체는 따로 센다. */
export function requiredKillCount(ch: ChapterDef): number {
  return ch.waves.reduce((sum, w) => sum + w.normal.killTarget + 1, 0);
}
