import type { EnemyKind } from './enemies';
import type { CompanionId } from './companions';
import { TUNING } from '../config/tuning';

/** 시간대별 스폰 단계(TEMP). from초부터 다음 단계 전까지 적용 */
export interface SpawnStage {
  /** 일반 구간 활성 전투 시간 기준 시작 초 */
  from: number;
  /** 무리 생성 간격(초) */
  interval: number;
  /** 한 번에 나오는 무리 크기 [최소, 최대] */
  group: [number, number];
  /** 동시에 살아 있을 수 있는 잡몹 상한(성능·밀도) */
  maxAlive: number;
  /** 등장 잡몹과 가중치 */
  pool: { kind: EnemyKind; weight: number }[];
  /** 체력 배율(뒤 웨이브일수록 성장한 빌드에 맞춘 무리) */
  hpMul: number;
}

/**
 * 일반 구간(11차 확정 방향: 횡스크롤 뱀서류). 처치 수가 아니라 활성 전투 시간으로 끝난다.
 * 시간 동안 단계별 표에 따라 소수 → 증가 → 무리 압박으로 계속 생성한다.
 * 활성 시간은 일반 구간 전투가 실제로 흐를 때만 센다(선택창·일시정지·등장 연출·엘리트/보스전·이동 중엔 멈춤).
 */
export interface NormalPhaseDef {
  /** 활성 전투 시간(초). Ch 1 웨이브당 180초는 사용자 동의 첫 테스트 기준(최종 고정 아님) */
  duration: number;
  stages: SpawnStage[];
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
  /** 엘리트/보스 체력 배율(TEMP, 11차 9분 구성에서 다시 측정). 분열체도 같은 배율 */
  finaleHpMul?: number;
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
 * Ch 1 말랑 운석 평원. 3웨이브·엘리트 1/엘리트 2/보스 구성과 적 종류는 확정.
 * 일반 구간 웨이브당 활성 180초(총 540초)는 사용자 동의 첫 테스트 기준(TEST_BASELINE, 최종 고정 아님).
 * 단계 시점·간격·무리·동시 상한·체력 배율·지점은 전부 TEMP.
 * pebbleRat(캠프 위협 A)·dustBat(B)은 시험 적(TEMP). 설정의 '[시험] 캠프 위협 A/B'를 끄면 풀에서 빠진다.
 */
export const CHAPTER_1: ChapterDef = {
  id: 1,
  name: 'Ch 1',
  region: '말랑 운석 평원',
  waves: [
    {
      triggerX: 700,
      normal: {
        duration: 180, // TEST_BASELINE 사용자 동의 첫 테스트 기준
        stages: [ // TEMP
          { from: 0, interval: 1.6, group: [1, 2], maxAlive: 6, hpMul: 1, pool: [{ kind: 'dustSlime', weight: 3 }, { kind: 'spikyBug', weight: 2 }] },
          { from: 50, interval: 1.6, group: [2, 3], maxAlive: 9, hpMul: 1, pool: [{ kind: 'dustSlime', weight: 3 }, { kind: 'spikyBug', weight: 2 }, { kind: 'pebbleRat', weight: 1 }] },
          { from: 120, interval: 1.7, group: [2, 4], maxAlive: 12, hpMul: 1, pool: [{ kind: 'dustSlime', weight: 3 }, { kind: 'spikyBug', weight: 3 }, { kind: 'meteorRat', weight: 1 }, { kind: 'pebbleRat', weight: 1 }] },
        ],
      },
      finale: 'rollingRat',
      finaleHpMul: 1.3, // TEMP 11차 재측정
    },
    {
      triggerX: 1900,
      normal: {
        duration: 180, // TEST_BASELINE
        stages: [ // TEMP
          { from: 0, interval: 1.5, group: [2, 3], maxAlive: 8, hpMul: 1, pool: [{ kind: 'spikyBug', weight: 2 }, { kind: 'meteorRat', weight: 2 }, { kind: 'dustSlime', weight: 2 }, { kind: 'pebbleRat', weight: 1 }] },
          { from: 50, interval: 1.6, group: [2, 4], maxAlive: 12, hpMul: 1.05, pool: [{ kind: 'spikyBug', weight: 2 }, { kind: 'meteorRat', weight: 2 }, { kind: 'dustSlime', weight: 2 }, { kind: 'pebbleRat', weight: 2 }, { kind: 'dustBat', weight: 2 }] },
          { from: 120, interval: 1.8, group: [3, 6], maxAlive: 16, hpMul: 1.1, pool: [{ kind: 'spikyBug', weight: 3 }, { kind: 'meteorRat', weight: 2 }, { kind: 'dustSlime', weight: 3 }, { kind: 'pebbleRat', weight: 1 }, { kind: 'dustBat', weight: 2 }] },
        ],
      },
      finale: 'kingDustSlime',
      finaleHpMul: 2.2, // TEMP 11차 재측정
    },
    {
      triggerX: 3100,
      normal: {
        duration: 180, // TEST_BASELINE
        stages: [ // TEMP
          { from: 0, interval: 1.5, group: [2, 3], maxAlive: 10, hpMul: 1.15, pool: [{ kind: 'meteorRat', weight: 3 }, { kind: 'dustSlime', weight: 2 }, { kind: 'spikyBug', weight: 2 }, { kind: 'pebbleRat', weight: 1 }, { kind: 'dustBat', weight: 1 }] },
          { from: 50, interval: 1.7, group: [3, 5], maxAlive: 16, hpMul: 1.25, pool: [{ kind: 'meteorRat', weight: 3 }, { kind: 'dustSlime', weight: 2 }, { kind: 'spikyBug', weight: 2 }, { kind: 'pebbleRat', weight: 2 }, { kind: 'dustBat', weight: 2 }] },
          { from: 120, interval: 1.9, group: [5, 8], maxAlive: 24, hpMul: 1.35, pool: [{ kind: 'meteorRat', weight: 4 }, { kind: 'dustSlime', weight: 3 }, { kind: 'spikyBug', weight: 3 }, { kind: 'pebbleRat', weight: 1 }, { kind: 'dustBat', weight: 2 }] },
        ],
      },
      finale: 'stompSole',
      finaleHpMul: 2.5, // TEMP 11차 재측정
    },
  ],
  rescue: { companion: 'kosyot', jailX: 4000 }, // jailX TEMP
};

export const CHAPTERS: ChapterDef[] = [CHAPTER_1];

/** 본편 챕터 수(확정) */
export const MAIN_CHAPTER_COUNT = 15;

/** 일반 구간 활성 시간의 현재 단계 */
export function stageAt(def: NormalPhaseDef, elapsed: number): SpawnStage {
  let cur = def.stages[0];
  for (const st of def.stages) if (elapsed >= st.from) cur = st;
  return cur;
}

/**
 * 뒤 챕터 시간 기반 설계 제안(TEMP, 처치 목표 증가표를 대체). 일반 구간 시간은 Ch 1 테스트 기준(웨이브당 180초)을 그대로 두고,
 * 챕터가 뒤로 갈수록 무리 크기·동시 상한·체력 배율을 키우는 방향만 제안한다. implemented=false 챕터는 진행·완료 표시에 쓰지 않는다.
 */
export function proposedChapterScaling(chapter: number): { normalSeconds: number; groupMul: number; maxAliveMul: number; hpMul: number; implemented: boolean } {
  const G = TUNING.waves.chapterScaling;
  const n = chapter - 1;
  return {
    normalSeconds: CHAPTER_1.waves[0].normal.duration,
    groupMul: Math.round((1 + G.group * n) * 100) / 100,
    maxAliveMul: Math.round((1 + G.maxAlive * n) * 100) / 100,
    hpMul: Math.round((1 + G.hp * n) * 100) / 100,
    implemented: CHAPTERS.some((c) => c.id === chapter),
  };
}
