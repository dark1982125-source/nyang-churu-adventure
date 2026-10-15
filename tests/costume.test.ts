import { describe, expect, test } from 'vitest';
import { Battle } from '../src/sim/battle';
import { buildLoadout, loadSave, memoryStorage, newSave, writeSave, type SaveData } from '../src/meta/save';
import { beginRun, settleRun } from '../src/meta/settlement';
import {
  canCraftCostume, costumeState, craftCostume, equipCostume, syncCostumeUnlocks, talkToNabi,
} from '../src/meta/costume';
import { COSTUME_DEFS, COSTUME_IDS, COSTUME_MATERIAL_SOURCES, FINAL_CHAPTER, STAR_THREAD_FIRST_CLEAR, type CostumeId } from '../src/data/costumes';
import { MATERIAL_NAMES } from '../src/data/items';
import { ENEMIES } from '../src/data/enemies';
import { runBot } from './bot';
import type { RunResult } from '../src/sim/battle';

const names = (id: CostumeId) => COSTUME_DEFS[id].craft.map((m) => `${MATERIAL_NAMES[m.id]} ${m.count}`);
const win = (save: SaveData, chapterId: number, rescued: RunResult['rescued'] = null, runId = save.nextRunId++): RunResult => ({
  runId, chapterId, outcome: 'victory', defeatCause: null, loot: {}, rescued, time: 100, kills: { required: 0, requiredTotal: 0, children: 0 }, heroLevel: 3,
});
const materialsFor = (s: SaveData, id: CostumeId) => { for (const m of COSTUME_DEFS[id].craft) s.materials[m.id] = (s.materials[m.id] ?? 0) + m.count; };
const nabiSave = (): SaveData => { const s = newSave(); s.rescued.push('kosyot', 'kangkang', 'nabi'); syncCostumeUnlocks(s); return s; };

describe('코스튬 5벌 데이터(확정표 그대로)', () => {
  test('이름·제작 재료·파자마 무료', () => {
    expect(COSTUME_IDS.map((id) => COSTUME_DEFS[id].name)).toEqual(['새싹 구조대 세트', '꼬마 요리사 세트', '포근 파자마 세트', '씩씩 탐험가 세트', '별빛 영웅 세트']);
    expect(names('sprout')).toEqual(['낡은 천조각 12', '낡은 털실뭉치 5', '싱그러운 새싹 3']);
    expect(names('chef')).toEqual(['낡은 천조각 15', '리본조각 5', '깨끗한 앞치마 1']);
    expect(names('pajamas')).toEqual([]);
    expect(names('explorer')).toEqual(['헤진 가죽조각 12', '낡은 털실뭉치 5', '탐험가의 천조각 3']);
    expect(names('starlight')).toEqual(['낡은 천조각 15', '리본조각 8', '별빛 자수실 3']);
  });

  test('새싹 모자는 정수리 두잎 새싹, 시안 원본 파일 이름 기록', () => {
    expect(COSTUME_DEFS.sprout.lookText).toContain('두잎 새싹');
    expect(COSTUME_DEFS.sprout.look.hat).toBe('sproutCap');
    expect(COSTUME_IDS.map((id) => COSTUME_DEFS[id].concept)).toEqual([
      'honyangi-sprout-rescue-v1.png', 'honyangi-chef-v1.png', 'honyangi-pajamas-v1.png', 'honyangi-explorer-v1.png', 'honyangi-starlight-hero-v1.png',
    ]);
  });

  test('신규 재료 획득처: 기존 문서 적 이름 또는 계열 표시만, Ch 1 구현분은 실제 드롭에 있다', () => {
    for (const [id, list] of Object.entries(COSTUME_MATERIAL_SOURCES)) {
      expect(new Set(list!.map((x) => x.chapter)).size).toBe(list!.length); // 한 챕터에 몰지 않음
      for (const src of list!.filter((x) => x.implemented)) {
        expect(src.chapter).toBe(1);
        expect(Object.values(ENEMIES).some((e) => e.name === src.enemy && e.loot.some((l) => l.id === id))).toBe(true);
      }
    }
    // 별빛 자수실은 최종 챕터 최초 클리어 지급뿐(드롭 없음)
    expect(COSTUME_MATERIAL_SOURCES.starEmbroideryThread).toBeUndefined();
    expect(Object.values(ENEMIES).some((e) => e.loot.some((l) => l.id === 'starEmbroideryThread'))).toBe(false);
  });
});

describe('도안 해금(나비 이전에도 기록)', () => {
  test('Ch 1 최초 클리어(코숏 구출)로 새싹 도안이 나비 없이 기록된다', () => {
    const s = newSave();
    const r = settleRun(s, win(s, 1, 'kosyot'));
    expect(r.costumeBlueprints).toEqual(['sprout']);
    expect(s.costumeBlueprints).toEqual(['sprout']);
    expect(canCraftCostume(s, 'sprout')).toBe('workshopLocked'); // 제작은 나비 구출 후
    materialsFor(s, 'sprout');
    expect(craftCostume(s, 'sprout')).toBe('workshopLocked');
    expect(s.costumes).toEqual([]);
    expect(s.materials.freshSprout).toBe(3); // 소모 없음
  });

  test('삼색이·얼룩이 구출, 최종 챕터 최초 클리어 조건', () => {
    const s = newSave();
    settleRun(s, win(s, 3, 'samsaek'));
    expect(s.costumeBlueprints).toContain('chef');
    settleRun(s, win(s, 8, 'eolluk'));
    expect(s.costumeBlueprints).toContain('explorer');
    expect(s.costumeBlueprints).not.toContain('starlight');
    settleRun(s, win(s, FINAL_CHAPTER));
    expect(s.costumeBlueprints).toContain('starlight');
    expect(s.costumeBlueprints).not.toContain('pajamas'); // 나비 첫 대화 전
  });

  test('패배·중도 종료로는 해금되지 않는다', () => {
    const s = newSave();
    settleRun(s, { ...win(s, 1, 'kosyot'), outcome: 'defeat', defeatCause: 'hero' });
    expect(s.costumeBlueprints).toEqual([]);
  });

  test('코스튬 추가 전 저장: 진행을 지우지 않고 이미 채운 조건의 도안만 받는다', () => {
    const st = memoryStorage();
    const old = newSave() as unknown as Record<string, unknown> & SaveData;
    old.clearedChapters = [1]; old.rescued = ['kosyot']; old.currencies.nyangJelly = 77; old.materials = { oldCloth: 4 };
    delete (old as Partial<SaveData>).costumeBlueprints; delete (old as Partial<SaveData>).costumes;
    old.flags = { forgeVisited: false } as SaveData['flags'];
    (old.equipment as { costume: unknown }).costume = 'unknownLegacy';
    st.store(JSON.stringify(old));
    const s = loadSave(st);
    expect(s.currencies.nyangJelly).toBe(77);
    expect(s.materials.oldCloth).toBe(4);
    expect(s.costumeBlueprints).toEqual(['sprout']);
    expect(s.costumes).toEqual([]);
    expect(s.equipment.costume).toBeNull();
    expect(s.flags).toMatchObject({ nabiFirstTalk: false, pajamaFreeCraftUsed: false, starThreadGranted: false });
  });
});

describe('나비 첫 대화·파자마 무료 제작 1회', () => {
  test('나비 구출 전 대화는 아무것도 주지 않는다', () => {
    const s = newSave();
    expect(talkToNabi(s).first).toBe(false);
    expect(s.costumeBlueprints).not.toContain('pajamas');
  });

  test('첫 대화에 도안, 무료 제작 1회, 두 번째 대화는 추가 지급 없음', () => {
    const s = nabiSave();
    expect(costumeState(s, 'pajamas')).toBe('미해금');
    expect(talkToNabi(s).first).toBe(true);
    expect(costumeState(s, 'pajamas')).toBe('제작가능');
    expect(talkToNabi(s).first).toBe(false);
    const before = JSON.stringify(s.materials);
    expect(craftCostume(s, 'pajamas')).toBe('ok');
    expect(JSON.stringify(s.materials)).toBe(before); // 재료 없음
    expect(s.currencies.nyangJelly).toBe(0); // 냥젤리 비용 없음
    expect(s.costumes).toEqual(['pajamas']);
    expect(craftCostume(s, 'pajamas')).toBe('owned');
    // 저장·재실행 뒤에도 무료 제작권이 되살아나지 않는다
    const st = memoryStorage(); writeSave(st, s);
    const s2 = loadSave(st);
    s2.costumes = []; // 가정: 보유 기록이 사라져도
    expect(canCraftCostume(s2, 'pajamas')).toBe('freeUsed');
    expect(talkToNabi(s2).first).toBe(false);
  });
});

describe('제작: 100% 성공, 재료 1회분만 소모, 영구 보유', () => {
  test('재료가 모자라면 재료부족, 갖추면 제작가능 → 제작 → 보유', () => {
    const s = nabiSave();
    expect(costumeState(s, 'sprout')).toBe('재료부족');
    expect(craftCostume(s, 'sprout')).toBe('materials');
    materialsFor(s, 'sprout');
    s.materials.oldCloth! += 2;
    s.currencies.nyangJelly = 50;
    expect(costumeState(s, 'sprout')).toBe('제작가능');
    for (let i = 0; i < 20; i++) {
      // 같은 상태에서 여러 번 눌러도 한 번만 소모·보유(실패 없음)
      craftCostume(s, 'sprout');
    }
    expect(s.costumes).toEqual(['sprout']);
    expect(s.materials).toMatchObject({ oldCloth: 2, oldYarn: 0, freshSprout: 0 });
    expect(s.currencies.nyangJelly).toBe(50);
    expect(costumeState(s, 'sprout')).toBe('보유');
  });

  test('도안 없는 코스튬은 재료가 있어도 만들 수 없다', () => {
    const s = nabiSave();
    materialsFor(s, 'chef');
    expect(costumeState(s, 'chef')).toBe('미해금');
    expect(craftCostume(s, 'chef')).toBe('noBlueprint');
  });
});

describe('별빛 자수실: 최종 챕터 최초 클리어 3개 1회', () => {
  test('반복 클리어·저장 재불러오기·다시 동기화로 중복 지급되지 않는다', () => {
    const s = newSave();
    const r1 = settleRun(s, win(s, FINAL_CHAPTER));
    expect(r1.starThread).toBe(STAR_THREAD_FIRST_CLEAR);
    expect(s.materials.starEmbroideryThread).toBe(3);
    const r2 = settleRun(s, win(s, FINAL_CHAPTER));
    expect(r2.starThread).toBe(0);
    syncCostumeUnlocks(s); syncCostumeUnlocks(s);
    const st = memoryStorage(); writeSave(st, s);
    const s2 = loadSave(st);
    expect(s2.materials.starEmbroideryThread).toBe(3);
    // 같은 판 중복 정산도 지급 없음
    const dup = win(s2, FINAL_CHAPTER, null, 1);
    s2.settledRunIds.push(1);
    expect(settleRun(s2, dup).duplicate).toBe(true);
    expect(s2.materials.starEmbroideryThread).toBe(3);
  });

  test('받은 3개로 바로 별빛 영웅 세트를 만들 수 있다(재전투 불필요), 쓴 뒤 다시 생기지 않는다', () => {
    const s = nabiSave();
    s.materials.oldCloth = 15; s.materials.ribbonPiece = 8;
    settleRun(s, win(s, FINAL_CHAPTER));
    expect(craftCostume(s, 'starlight')).toBe('ok');
    expect(s.materials.starEmbroideryThread).toBe(0);
    settleRun(s, win(s, FINAL_CHAPTER));
    const st = memoryStorage(); writeSave(st, s);
    expect(loadSave(st).materials.starEmbroideryThread).toBe(0);
  });
});

describe('착용·해제: 캠프에서만, 영구 저장', () => {
  test('보유한 것만 착용, 기본 모습으로 해제, 재실행 뒤 유지', () => {
    const s = nabiSave();
    expect(equipCostume(s, 'sprout')).toBe('notOwned');
    s.costumes.push('sprout', 'chef');
    expect(equipCostume(s, 'sprout')).toBe('ok');
    expect(costumeState(s, 'sprout')).toBe('착용중');
    expect(equipCostume(s, 'chef')).toBe('ok'); // 한 벌 단위: 바꿔 입기
    const st = memoryStorage(); writeSave(st, s);
    const s2 = loadSave(st);
    expect(s2.equipment.costume).toBe('chef');
    expect(equipCostume(s2, null)).toBe('ok');
    writeSave(st, s2);
    expect(loadSave(st).equipment.costume).toBeNull();
  });

  test('판 진행 중(판 저널 있음)에는 바꿀 수 없다', () => {
    const s = nabiSave();
    s.costumes.push('sprout');
    beginRun(s, 1);
    expect(equipCostume(s, 'sprout')).toBe('notInCamp');
    expect(equipCostume(s, null)).toBe('notInCamp');
    expect(s.equipment.costume).toBeNull();
  });

  test('보유하지 않은 코스튬을 입은 저장은 기본 모습으로 불러온다', () => {
    const st = memoryStorage();
    const s = newSave();
    s.equipment.costume = 'starlight';
    writeSave(st, s);
    expect(loadSave(st).equipment.costume).toBeNull();
  });
});

describe('능력치 불변(외형 전용)', () => {
  const geared = (): SaveData => {
    const s = nabiSave();
    s.armor.quiltHat = { level: 3, fails: {} }; s.equipment.head = 'quiltHat';
    s.accessories.sunNecklace = { level: 2, fails: {} }; s.equipment.accessories = ['sunNecklace', null];
    s.nodes.hp = 2; s.nodes.def = 1;
    s.costumes = [...COSTUME_IDS];
    return s;
  };

  test('출격 능력치는 어떤 코스튬을 입어도 기본 모습과 같다(보호구·액세서리 능력 유지)', () => {
    const s = geared();
    const base = JSON.stringify(buildLoadout(s));
    for (const id of COSTUME_IDS) {
      equipCostume(s, id);
      expect(JSON.stringify(buildLoadout(s))).toBe(base);
    }
    expect(buildLoadout(s).armor.maxHp).toBeGreaterThan(0);
  });

  test('같은 시드 전투 결과도 코스튬과 무관하다', () => {
    const a = geared();
    const b = geared(); equipCostume(b, 'starlight');
    const ra = runBot({ save: a, seed: 4, maxTime: 120 });
    const rb = runBot({ save: b, seed: 4, maxTime: 120 });
    expect(rb.battle.result()).toEqual(ra.battle.result());
    const ba = new Battle({ runId: 1, seed: 3, loadout: buildLoadout(a) });
    const bb = new Battle({ runId: 1, seed: 3, loadout: buildLoadout(b) });
    expect(bb.stats()).toEqual(ba.stats());
    expect(bb.player.maxHp).toBe(ba.player.maxHp);
  });

  test('코스튬은 강화·등급 정보가 없다(보유 = id 목록)', () => {
    const s = geared();
    expect(Array.isArray(s.costumes)).toBe(true);
    for (const id of COSTUME_IDS) expect(Object.keys(COSTUME_DEFS[id])).not.toContain('enhanceMaterial');
  });
});
