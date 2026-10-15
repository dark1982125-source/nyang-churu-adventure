import type { LootId, MaterialId, CurrencyId } from '../data/items';
import { CURRENCY_NAMES } from '../data/items';
import type { RunResult } from '../sim/battle';
import type { SaveData } from './save';

export interface SettlementSummary {
  applied: boolean;
  /** 이미 정산된 판이면 true (중복 지급 방지) */
  duplicate: boolean;
  newlyRescued: string | null;
  firstClear: boolean;
  loot: Partial<Record<LootId, number>>;
}

const MAX_SETTLED_IDS = 50;

/**
 * 판 결과를 영구 저장에 반영한다. 같은 runId는 한 번만 반영된다.
 * - 성공/실패 모두: 획득한 영구 재화·제작 재료 보존
 * - 성공 시에만: 신규 동료 구출 확정, 최초 클리어·고난도 해금
 * - 판 안 임시 레벨·기술·다시냥 방울은 Battle 객체와 함께 버려진다(저장에 없음)
 */
export function settleRun(save: SaveData, result: RunResult): SettlementSummary {
  const summary: SettlementSummary = { applied: false, duplicate: false, newlyRescued: null, firstClear: false, loot: result.loot };
  if (save.settledRunIds.includes(result.runId)) {
    summary.duplicate = true;
    return summary;
  }

  for (const [id, n] of Object.entries(result.loot) as [LootId, number][]) {
    if (!n) continue;
    if (id in CURRENCY_NAMES) save.currencies[id as CurrencyId] += n;
    else save.materials[id as MaterialId] = (save.materials[id as MaterialId] ?? 0) + n;
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
    }
    // 챕터 일반 완료 시 해당 고난도 해금(고난도 자체는 미구현)
    if (!save.hardUnlocked.includes(result.chapterId)) save.hardUnlocked.push(result.chapterId);
  } else {
    save.stats.defeats++;
  }

  save.settledRunIds.push(result.runId);
  if (save.settledRunIds.length > MAX_SETTLED_IDS) save.settledRunIds.splice(0, save.settledRunIds.length - MAX_SETTLED_IDS);
  summary.applied = true;
  return summary;
}

/** 출격 시 판 id 발급. 발급 즉시 저장해 두면 같은 id가 다시 쓰이지 않는다. */
export function issueRunId(save: SaveData): number {
  return save.nextRunId++;
}
