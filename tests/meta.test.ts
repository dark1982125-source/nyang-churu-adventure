import { describe, expect, test } from 'vitest';
import { buildLoadout, buyNode, loadSave, memoryStorage, newSave, toggleUltimate, writeSave } from '../src/meta/save';
import { issueRunId, settleRun } from '../src/meta/settlement';
import type { RunResult } from '../src/sim/battle';
import { runBot } from './bot';

function result(over: Partial<RunResult> = {}): RunResult {
  return {
    runId: 1, chapterId: 1, outcome: 'victory', defeatCause: null,
    loot: { nyangJelly: 10, softJelly: 3 }, rescued: 'kosyot', time: 100,
    kills: { required: 37, requiredTotal: 37, children: 3 }, heroLevel: 7, ...over,
  };
}

describe('정산', () => {
  test('성공: 재화·재료 반영, 코숏 구출 확정, 최초 클리어·고난도 해금', () => {
    const s = newSave();
    const sum = settleRun(s, result());
    expect(sum.applied).toBe(true);
    expect(s.currencies.nyangJelly).toBe(10);
    expect(s.materials.softJelly).toBe(3);
    expect(s.rescued).toEqual(['kosyot']);
    expect(sum.firstClear).toBe(true);
    expect(s.hardUnlocked).toContain(1);
  });

  test('같은 판을 두 번 정산해도 보상·구출이 중복 지급되지 않는다', () => {
    const s = newSave();
    settleRun(s, result());
    const again = settleRun(s, result());
    expect(again.duplicate).toBe(true);
    expect(s.currencies.nyangJelly).toBe(10);
    expect(s.rescued).toEqual(['kosyot']);
    expect(s.stats.runs).toBe(1);
  });

  test('실패: 획득 재화·재료는 보존, 신규 구출은 없음, 기존 구출은 유지', () => {
    const s = newSave();
    s.rescued = ['kosyot'];
    settleRun(s, result({ runId: 2, outcome: 'defeat', defeatCause: 'hero', rescued: null, loot: { nyangJelly: 4, smallStone: 2 } }));
    expect(s.currencies.nyangJelly).toBe(4);
    expect(s.materials.smallStone).toBe(2);
    expect(s.rescued).toEqual(['kosyot']);
    expect(s.clearedChapters).toEqual([]);
  });

  test('판 id는 출격마다 새로 발급된다', () => {
    const s = newSave();
    expect(issueRunId(s)).toBe(1);
    expect(issueRunId(s)).toBe(2);
  });
});

describe('실패 → 영구 성장 → 재도전 루프', () => {
  test('판 결과의 재화로 영구 노드를 사고, 다음 판 출격 능력치에 반영된다. 임시 성장은 이어지지 않는다', () => {
    const storage = memoryStorage();
    const save = loadSave(storage);
    // 1판: 봇이 진행한 결과(성공·실패와 무관하게 재화가 남는지 확인)
    const first = runBot({ save, seed: 2 }).battle;
    const r1 = first.result();
    settleRun(save, { ...r1, runId: issueRunId(save) });
    writeSave(storage, save);
    const reloaded = loadSave(storage);
    expect(reloaded.currencies.nyangJelly).toBe(r1.loot.nyangJelly ?? 0);
    expect(reloaded.currencies.nyangJelly).toBeGreaterThan(10);

    expect(buyNode(reloaded, 'hp')).toBe('ok');
    const lo = buildLoadout(reloaded);
    expect(lo.maxHp).toBe(110);

    const second = runBot({ save: reloaded, seed: 4, maxTime: 1 }).battle;
    expect(second.player.maxHp).toBe(110);
    expect(second.heroLevel).toBe(1);
    expect(second.skills.exclusives).toEqual([]);
    expect(second.hasBell).toBe(false);
  });
});

describe('저장', () => {
  test('저장/불러오기 왕복, 깨진 데이터는 새 저장으로', () => {
    const st = memoryStorage();
    const s = newSave();
    s.currencies.golgolGear = 7;
    writeSave(st, s);
    expect(loadSave(st).currencies.golgolGear).toBe(7);
    st.raw = '{broken';
    expect(loadSave(st).currencies.golgolGear).toBe(0);
  });

  test('노드 가격·선행 조건·최대 레벨', () => {
    const s = newSave();
    expect(buyNode(s, 'hp')).toBe('poor');
    s.currencies.goldenCatnip = 10;
    expect(buyNode(s, 'ult_atkArea')).toBe('locked');
    expect(buyNode(s, 'ultSlot')).toBe('ok');
    expect(buyNode(s, 'ult_atkArea')).toBe('ok');
    expect(s.equippedUltimates).toEqual(['atkArea']);
    expect(buyNode(s, 'ult_atkArea')).toBe('max');
  });

  test('궁극기 장착은 최대 3종', () => {
    const s = newSave();
    s.nodes = { ultSlot: 1, ult_atkArea: 1, ult_atkSingle: 1, ult_defSlow: 1, ult_healHero: 1 };
    expect(toggleUltimate(s, 'atkArea')).toBe(true);
    expect(toggleUltimate(s, 'atkSingle')).toBe(true);
    expect(toggleUltimate(s, 'defSlow')).toBe(true);
    expect(toggleUltimate(s, 'healHero')).toBe(false);
    expect(toggleUltimate(s, 'healCamp')).toBe(false); // 미해금
  });
});
