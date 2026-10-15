import { describe, expect, test } from 'vitest';
import { Battle } from '../src/sim/battle';
import { buildLoadout, loadSave, memoryStorage, newSave, writeSave, type SaveData } from '../src/meta/save';
import {
  beginRun, completePendingClear, markClearConfirmed, pendingClear, recordRunLoot, recoverInterruptedRun, settleRun,
} from '../src/meta/settlement';
import { botChoose, botInput } from './bot';

const DT = 1 / 60;

/** 실제 판을 클리어 확정 순간까지 진행하고, BattleScene처럼 그때 저널에 기록·저장한다. */
function playUntilConfirm(storage: ReturnType<typeof memoryStorage>, seed = 7): { save: SaveData; b: Battle } {
  const save = loadSave(storage);
  const runId = beginRun(save, 1);
  writeSave(storage, save);
  const b = new Battle({ runId, seed, loadout: buildLoadout(save) });
  while (!b.clearConfirmed && !b.finished && b.t < 600) {
    if (b.paused) { botChoose(b); continue; }
    b.update(DT, botInput(b));
    recordRunLoot(save, runId, b.loot);
  }
  expect(b.clearConfirmed).toBe(true);
  markClearConfirmed(save, b.result(), b.chapter.rescue?.companion ?? null);
  writeSave(storage, save);
  return { save, b };
}

describe('보스 처치(클리어 확정) 뒤 구출 중 앱 종료', () => {
  test('재실행 시 중도 종료로 정산하지 않고 구출 완료 대기 상태로 남는다(동료 미지급)', () => {
    const storage = memoryStorage();
    const { b } = playUntilConfirm(storage);
    expect(b.finished).toBe(false); // 감옥으로 가기 전·중
    // 여기서 앱 종료 → 재실행
    const reopened = loadSave(storage);
    expect(recoverInterruptedRun(reopened)).toBeNull();
    const p = pendingClear(reopened);
    expect(p?.clearConfirmed.rescue).toBe('kosyot');
    expect(reopened.rescued).toEqual([]); // 감옥 개방 전 동료 미지급
    expect(reopened.currencies.nyangJelly).toBe(0); // 재화도 아직 미정산
    expect(reopened.stats).toMatchObject({ runs: 0, quits: 0, clears: 0 });
  });

  test('구출 완료 흐름 마지막에 승리로 한 번만 정산: 동료·재화·최초 클리어, 재실행·재호출해도 중복 없음', () => {
    const storage = memoryStorage();
    const { b } = playUntilConfirm(storage);
    const confirmedLoot = { ...b.loot };
    const reopened = loadSave(storage);
    recoverInterruptedRun(reopened);
    const done = completePendingClear(reopened)!;
    expect(done.result.outcome).toBe('victory');
    expect(done.summary.newlyRescued).toBe('kosyot');
    expect(done.summary.firstClear).toBe(true);
    expect(reopened.rescued).toEqual(['kosyot']);
    expect(reopened.currencies.nyangJelly).toBe(confirmedLoot.nyangJelly ?? 0);
    expect(reopened.stats).toMatchObject({ runs: 1, clears: 1, quits: 0 });
    expect(reopened.activeRun).toBeNull();
    writeSave(storage, reopened);

    const again = loadSave(storage);
    expect(recoverInterruptedRun(again)).toBeNull();
    expect(pendingClear(again)).toBeNull();
    expect(completePendingClear(again)).toBeNull();
    expect(again.currencies.nyangJelly).toBe(confirmedLoot.nyangJelly ?? 0);
    expect(again.rescued).toEqual(['kosyot']);
    expect(again.stats.clears).toBe(1);
  });

  test('구출 흐름 도중 또 꺼져도(정산 전) 다시 구출 흐름으로 돌아오고 지급은 한 번', () => {
    const storage = memoryStorage();
    playUntilConfirm(storage);
    for (let i = 0; i < 3; i++) {
      const s = loadSave(storage);
      expect(recoverInterruptedRun(s)).toBeNull();
      expect(pendingClear(s)).not.toBeNull();
      expect(s.rescued).toEqual([]);
      writeSave(storage, s);
    }
    const s = loadSave(storage);
    const done = completePendingClear(s)!;
    expect(completePendingClear(s)).toBeNull();
    expect(settleRun(s, done.result).duplicate).toBe(true); // 같은 판 결과가 다시 와도 중복 지급 없음
    expect(s.rescued).toEqual(['kosyot']);
    expect(s.stats.clears).toBe(1);
  });

  test('확정 시점 저널 재화 = 정상 진행 끝 정산 재화(확정 뒤 새 획득 없음, 정상 경로와 같은 보상)', () => {
    const storage = memoryStorage();
    const { save, b } = playUntilConfirm(storage, 7);
    const journal = { ...save.activeRun!.loot };
    // 같은 판을 정상 진행으로 끝까지
    while (!b.finished && b.t < 900) b.update(DT, { forward: true, jump: false, ult: null });
    expect(b.mode).toBe('victory');
    expect(b.result().loot).toEqual(journal);
    // 정상 경로 정산이 저널을 지우므로 이후 재실행 복귀 없음
    settleRun(save, b.result());
    expect(save.activeRun).toBeNull();
    expect(pendingClear(save)).toBeNull();
  });

  test('확정 뒤 줍기 저장(recordRunLoot)이 와도 확정 기록은 지워지지 않는다', () => {
    const storage = memoryStorage();
    const { save } = playUntilConfirm(storage);
    recordRunLoot(save, save.activeRun!.runId, { nyangJelly: 1 });
    expect(save.activeRun!.clearConfirmed).toBeTruthy();
  });

  test('이미 정산된 판의 확정 저널이 남아 있으면 지우기만 한다', () => {
    const save = newSave();
    const runId = beginRun(save, 1);
    save.settledRunIds.push(runId);
    save.activeRun!.clearConfirmed = { rescue: 'kosyot', time: 1, heroLevel: 1, kills: { required: 0, requiredTotal: 0, children: 0 } };
    expect(pendingClear(save)).toBeNull();
    expect(recoverInterruptedRun(save)).toBeNull();
    expect(save.activeRun).toBeNull();
    expect(save.rescued).toEqual([]);
  });

  test('클리어 확정 전 종료는 그대로 중도 종료(전투 재개 없음, 주운 것만)', () => {
    const storage = memoryStorage();
    const save = loadSave(storage);
    const runId = beginRun(save, 1);
    recordRunLoot(save, runId, { nyangJelly: 3 });
    writeSave(storage, save);
    const s = loadSave(storage);
    const sum = recoverInterruptedRun(s)!;
    expect(sum.applied).toBe(true);
    expect(s.stats.quits).toBe(1);
    expect(s.rescued).toEqual([]);
    expect(pendingClear(s)).toBeNull();
  });
});
