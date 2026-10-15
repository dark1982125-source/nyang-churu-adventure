import { isCurrency, type LootId, type MaterialId } from '../data/items';
import type { WeaponId } from '../data/weapons';
import { firstClearBlueprints, specialClearRewards } from './forge';
import type { RunResult } from '../sim/battle';
import type { SaveData } from './save';

export interface SettlementSummary {
  applied: boolean;
  /** 이미 정산된 판이면 true (중복 지급 방지) */
  duplicate: boolean;
  newlyRescued: string | null;
  firstClear: boolean;
  loot: Partial<Record<LootId, number>>;
  blueprints: WeaponId[];
  specials: MaterialId[];
}

const MAX_SETTLED_IDS = 50;

/**
 * 판 결과를 영구 저장에 반영한다. 같은 runId는 한 번만 반영된다.
 * - 성공/실패 모두: 획득한 영구 재화·제작 재료 보존
 * - 성공 시에만: 신규 동료 구출 확정, 최초 클리어·고난도 해금
 * - 판 안 임시 레벨·기술·다시냥 방울은 Battle 객체와 함께 버려진다(저장에 없음)
 */
export function settleRun(save: SaveData, result: RunResult): SettlementSummary {
  const summary: SettlementSummary = { applied: false, duplicate: false, newlyRescued: null, firstClear: false, loot: result.loot, blueprints: [], specials: [] };
  if (save.settledRunIds.includes(result.runId)) {
    summary.duplicate = true;
    if (save.activeRun?.runId === result.runId) save.activeRun = null;
    return summary;
  }

  for (const [id, n] of Object.entries(result.loot) as [LootId, number][]) {
    if (!n) continue;
    if (isCurrency(id)) save.currencies[id] += n;
    else save.materials[id] = (save.materials[id] ?? 0) + n;
  }

  save.stats.runs++;
  if (result.outcome === 'victory') {
    save.stats.clears++;
    if (result.rescued && !save.rescued.includes(result.rescued)) {
      save.rescued.push(result.rescued);
      summary.newlyRescued = result.rescued;
    }
    if (!save.clearedChapters.includes(result.chapterId)) {
      save.clearedChapters.push(result.chapterId);
      summary.firstClear = true;
      // 일반 난도 최초 클리어 설계도(1회 등록)
      for (const bp of firstClearBlueprints(result.chapterId)) {
        if (!save.blueprints.includes(bp)) { save.blueprints.push(bp); summary.blueprints.push(bp); }
      }
    }
    // 지정 챕터 반복 클리어 특별 재료: 매 클리어 1개, 행운 미적용. 전설용은 본편 Ch 8 이후.
    for (const m of specialClearRewards(result.chapterId, 'normal', save.clearedChapters.includes(8))) {
      save.materials[m] = (save.materials[m] ?? 0) + 1;
      summary.specials.push(m);
    }
    // 챕터 일반 완료 시 해당 고난도 해금(고난도 자체는 미구현)
    if (!save.hardUnlocked.includes(result.chapterId)) save.hardUnlocked.push(result.chapterId);
  } else if (result.defeatCause === 'quit') {
    save.stats.quits++;
  } else {
    save.stats.defeats++;
  }

  // 정산과 저널 삭제를 같은 저장 쓰기로 묶어 중복 지급·손실을 막는다
  if (save.activeRun?.runId === result.runId) save.activeRun = null;
  save.settledRunIds.push(result.runId);
  if (save.settledRunIds.length > MAX_SETTLED_IDS) save.settledRunIds.splice(0, save.settledRunIds.length - MAX_SETTLED_IDS);
  summary.applied = true;
  return summary;
}

/** 출격 시 판 id 발급. 발급 즉시 저장해 두면 같은 id가 다시 쓰이지 않는다. */
export function issueRunId(save: SaveData): number {
  return save.nextRunId++;
}

/** 출격: 판 id 발급과 저널 시작을 함께 기록한다(호출 뒤 바로 저장할 것). */
export function beginRun(save: SaveData, chapterId: number): number {
  const runId = issueRunId(save);
  save.activeRun = { runId, chapterId, loot: {} };
  return runId;
}

/** 판 진행 중 주운 영구 재화·재료를 저널에 반영(호출 뒤 바로 저장할 것). 실제 지급은 정산 때 한 번만. */
export function recordRunLoot(save: SaveData, runId: number, loot: Partial<Record<LootId, number>>): void {
  if (save.activeRun?.runId !== runId) return;
  save.activeRun.loot = { ...loot };
}

/**
 * 앱 시작 시: 정산되지 않은 저널이 남아 있으면(갑작스러운 종료) 주운 것만 중도 종료로 정산한다.
 * 이미 정산된 판이면 저널만 지운다. 이어하기는 없다.
 */
export function recoverInterruptedRun(save: SaveData): SettlementSummary | null {
  const a = save.activeRun;
  if (!a) return null;
  return settleRun(save, {
    runId: a.runId, chapterId: a.chapterId, outcome: 'defeat', defeatCause: 'quit', loot: { ...a.loot },
    rescued: null, time: 0, kills: { required: 0, requiredTotal: 0, children: 0 }, heroLevel: 1,
  });
}
