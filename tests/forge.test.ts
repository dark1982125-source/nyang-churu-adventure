import { describe, expect, test } from 'vitest';
import { newSave, buildLoadout, type SaveData } from '../src/meta/save';
import {
  canCraft, craftWeapon, enhanceInfo, enhanceWeapon, equipWeapon, equippedWeaponAttackMul,
  forgeUnlocked, specialClearRewards, visitForge,
} from '../src/meta/forge';
import { settleRun } from '../src/meta/settlement';
import { ENHANCE_TABLE, WEAPON_DEFS, enhanceAttackBonus, weaponGrade } from '../src/data/weapons';
import type { RunResult } from '../src/sim/battle';

const withKangkang = (): SaveData => {
  const s = newSave();
  s.rescued.push('kosyot', 'kangkang');
  return s;
};
const always = () => 0;
const never = () => 0.9999;

describe('대장간 해금·설계도', () => {
  test('깡깡이 구출 전에는 대장간이 닫혀 있고 설계도도 받지 않는다', () => {
    const s = newSave();
    s.rescued.push('kosyot');
    expect(forgeUnlocked(s)).toBe(false);
    expect(visitForge(s)).toEqual([]);
    expect(s.blueprints).toEqual([]);
    expect(canCraft(s, 'jellyGlove')).toBe('forgeLocked');
  });

  test('첫 방문에 장갑·검 설계도를 함께 1회만 받는다', () => {
    const s = withKangkang();
    expect(visitForge(s).sort()).toEqual(['fishboneSword', 'jellyGlove']);
    expect(visitForge(s)).toEqual([]);
    expect(s.blueprints.sort()).toEqual(['fishboneSword', 'jellyGlove']);
  });

  test('나머지 설계도는 해당 챕터 일반 최초 클리어에서 1회 등록', () => {
    const s = withKangkang();
    const r = (runId: number, chapterId: number): RunResult => ({
      runId, chapterId, outcome: 'victory', defeatCause: null, rescued: null, loot: {}, heroLevel: 1, time: 1, kills: 1,
    } as unknown as RunResult);
    expect(settleRun(s, r(1, 3)).blueprints).toEqual(['catnipRod']);
    expect(settleRun(s, r(2, 3)).blueprints).toEqual([]);
    expect(settleRun(s, r(3, 4)).blueprints).toEqual(['churuLauncher']);
    expect(s.blueprints).toContain('catnipRod');
  });
});

describe('제작', () => {
  test('설계도와 재료가 있어야 하고, 제작 시 재료를 소모한다(냥젤리 비용 없음)', () => {
    const s = withKangkang();
    visitForge(s);
    expect(canCraft(s, 'jellyGlove')).toBe('materials');
    s.materials = { softJelly: 10, wornLeather: 5, oldYarn: 3 };
    s.currencies.nyangJelly = 0;
    expect(craftWeapon(s, 'jellyGlove')).toBe('ok');
    expect(s.materials).toEqual({ softJelly: 0, wornLeather: 0, oldYarn: 0 });
    expect(s.weapons.jellyGlove).toEqual({ level: 0, fails: {} });
    expect(craftWeapon(s, 'jellyGlove')).toBe('owned');
  });

  test('일반 무기 제작은 10/5/3, 런처만 4종 10/5/5/3', () => {
    for (const id of ['jellyGlove', 'fishboneSword', 'catnipRod', 'pawHammer', 'skewerSpear'] as const) {
      expect(WEAPON_DEFS[id].craft.map((m) => m.count)).toEqual([10, 5, 3]);
    }
    expect(WEAPON_DEFS.churuLauncher.craft.map((m) => m.count)).toEqual([10, 5, 5, 3]);
  });

  test('생선뼈 검: 생선가시조각 10·작은 돌조각 5·낡은 털실뭉치 3, 강화 매끈한 돌조각', () => {
    const d = WEAPON_DEFS.fishboneSword;
    expect(d.craft).toEqual([{ id: 'fishboneShard', count: 10 }, { id: 'smallStone', count: 5 }, { id: 'oldYarn', count: 3 }]);
    expect(d.enhanceMaterial).toBe('smoothStone');
  });

  test('전투 동작이 없는 무기는 제작해도 장착되지 않는다', () => {
    const s = withKangkang();
    visitForge(s);
    s.materials = { fishboneShard: 10, smallStone: 5, oldYarn: 3 };
    expect(craftWeapon(s, 'fishboneSword')).toBe('ok');
    expect(equipWeapon(s, 'fishboneSword')).toBe('notCombatReady');
    expect(s.equipment.weapon).toBe('starterGlove');
  });
});

describe('강화', () => {
  const ready = () => {
    const s = withKangkang();
    visitForge(s);
    s.materials = { softJelly: 10, wornLeather: 5, oldYarn: 3, hardJelly: 9999 };
    craftWeapon(s, 'jellyGlove');
    return s;
  };

  test('강화표: 성공률·재료 수량', () => {
    expect(ENHANCE_TABLE.map((r) => Math.round(r.rate * 100))).toEqual([100, 100, 90, 80, 70, 60, 50, 40, 25, 10]);
    expect(ENHANCE_TABLE.map((r) => r.material)).toEqual([5, 5, 8, 8, 15, 17, 20, 23, 27, 35]);
  });

  test('+5 누적 35%, +10 누적 80%, +5 유니크·+10 전설', () => {
    expect(enhanceAttackBonus(5)).toBeCloseTo(0.35);
    expect(enhanceAttackBonus(10)).toBeCloseTo(0.8);
    expect(weaponGrade(4)).toBe('일반');
    expect(weaponGrade(5)).toBe('유니크');
    expect(weaponGrade(10)).toBe('전설');
  });

  test('실패 시 기본 재료만 소모, 단계 유지, 다음 시도 +5%p', () => {
    const s = ready();
    s.weapons.jellyGlove!.level = 2;
    const before = s.materials.hardJelly!;
    const r = enhanceWeapon(s, 'jellyGlove', never);
    expect(r.success).toBe(false);
    expect(s.weapons.jellyGlove!.level).toBe(2);
    expect(s.materials.hardJelly).toBe(before - 8);
    expect(enhanceInfo(s, 'jellyGlove').rate).toBeCloseTo(0.95);
  });

  test('9회 연속 실패 후 10번째는 확정 성공, 성공하면 그 단계 실패 기록 초기화', () => {
    const s = ready();
    s.weapons.jellyGlove!.level = 9; // 목표 +10, 10%
    s.materials.goldenFurball = 1;
    for (let i = 0; i < 9; i++) expect(enhanceWeapon(s, 'jellyGlove', never).success).toBe(false);
    expect(s.materials.goldenFurball).toBe(1);
    expect(enhanceInfo(s, 'jellyGlove').rate).toBe(1);
    expect(enhanceInfo(s, 'jellyGlove').pityLeft).toBe(0);
    expect(enhanceWeapon(s, 'jellyGlove', never).success).toBe(true);
    expect(s.weapons.jellyGlove!.level).toBe(10);
    expect(s.weapons.jellyGlove!.fails[10]).toBeUndefined();
  });

  test('실패 기록은 저장 데이터에 남는다(재접속 후에도 유지)', () => {
    const s = ready();
    s.weapons.jellyGlove!.level = 8;
    enhanceWeapon(s, 'jellyGlove', never);
    const copy = JSON.parse(JSON.stringify(s)) as SaveData;
    expect(enhanceInfo(copy, 'jellyGlove').fails).toBe(1);
  });

  test('+5·+10은 특별 재료를 보유해야 시도할 수 있고, 실패하면 특별 재료는 보존된다', () => {
    const s = ready();
    s.weapons.jellyGlove!.level = 4;
    expect(enhanceInfo(s, 'jellyGlove').blocker).toBe('special');
    expect(enhanceWeapon(s, 'jellyGlove', always).attempted).toBe(false);
    s.materials.glossyLeather = 1;
    expect(enhanceWeapon(s, 'jellyGlove', never).success).toBe(false);
    expect(s.materials.glossyLeather).toBe(1);
    expect(enhanceWeapon(s, 'jellyGlove', always).success).toBe(true);
    expect(s.materials.glossyLeather).toBe(0);
  });

  test('행운은 강화 확률에 적용하지 않는다', () => {
    const s = ready();
    s.nodes.luck = 5;
    s.weapons.jellyGlove!.level = 2;
    expect(enhanceInfo(s, 'jellyGlove').rate).toBeCloseTo(0.9);
  });

  test('장착 무기의 강화 보너스가 출격 공격력에 반영된다', () => {
    const s = ready();
    s.weapons.jellyGlove!.level = 5;
    expect(equipWeapon(s, 'jellyGlove')).toBe('ok');
    expect(equippedWeaponAttackMul(s)).toBeCloseTo(1.35);
    expect(buildLoadout(s).weaponAttackMul).toBeCloseTo(1.35);
  });
});

describe('특별 재료 보상', () => {
  test('일반 난도 지정 챕터 클리어마다 1개', () => {
    expect(specialClearRewards(2, 'normal', false)).toEqual(['hardFishbone']);
    expect(specialClearRewards(3, 'normal', false).sort()).toEqual(['glossyLeather', 'magicCatnipBall']);
  });

  test('고난도 전설 재료는 본편 Ch 8 일반 클리어 이후에만', () => {
    expect(specialClearRewards(3, 'hard', false)).toEqual([]);
    expect(specialClearRewards(3, 'hard', true).sort()).toEqual(['fairyRibbon', 'goldenCatnipBranch', 'goldenFurball']);
  });
});
