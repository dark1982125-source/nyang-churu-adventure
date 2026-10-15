import type { EnemyKind } from './enemies';
import type { CompanionId } from './companions';

export interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  /** 같은 그룹 안 스폰 간격(초) */
  interval: number;
}

export interface WaveDef {
  /** 이 x 지점에 도착하면 캠프가 정차하고 웨이브가 시작된다 */
  triggerX: number;
  /** 순서대로 스폰되는 일반 적 */
  groups: SpawnGroup[];
  /** 웨이브 끝 엘리트/보스. 일반 적을 모두 처치한 뒤 등장 */
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
 * 적 수·간격·지점은 TEMP.
 */
export const CHAPTER_1: ChapterDef = {
  id: 1,
  name: 'Ch 1',
  region: '말랑 운석 평원',
  waves: [
    {
      triggerX: 700,
      groups: [
        { kind: 'dustSlime', count: 5, interval: 1.4 }, // TEMP
        { kind: 'spikyBug', count: 4, interval: 1.2 }, // TEMP
      ],
      finale: 'rollingRat',
    },
    {
      triggerX: 1900,
      groups: [
        { kind: 'spikyBug', count: 4, interval: 1.1 }, // TEMP
        { kind: 'meteorRat', count: 4, interval: 1.3 }, // TEMP
        { kind: 'dustSlime', count: 4, interval: 1.0 }, // TEMP
      ],
      finale: 'kingDustSlime',
    },
    {
      triggerX: 3100,
      groups: [
        { kind: 'meteorRat', count: 5, interval: 1.0 }, // TEMP
        { kind: 'dustSlime', count: 4, interval: 1.0 }, // TEMP
        { kind: 'spikyBug', count: 4, interval: 0.9 }, // TEMP
      ],
      finale: 'stompSole',
    },
  ],
  rescue: { companion: 'kosyot', jailX: 4000 }, // jailX TEMP
};

export const CHAPTERS: ChapterDef[] = [CHAPTER_1];

/** 지정 처치 대상 수(분열로 생기는 적 제외). 분열 적 집계 정책은 미정이라 따로 센다. */
export function requiredKillCount(ch: ChapterDef): number {
  return ch.waves.reduce((sum, w) => sum + w.groups.reduce((s, g) => s + g.count, 0) + 1, 0);
}
