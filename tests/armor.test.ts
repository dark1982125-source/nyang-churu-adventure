import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { buildLoadout, loadSave, memoryStorage, newSave, writeSave, type SaveData } from '../src/meta/save';
import {
  armorEnhanceInfo, canCraftArmor, combineResist, craftArmor, craftWeapon, canCraft, enhanceArmor, enhanceInfo,
  equipArmor, equippedArmorStats, unequipArmor, visitForge,
} from '../src/meta/forge';
import { settleRun } from '../src/meta/settlement';
import { ARMOR_DEFS, ARMOR_IDS, ARMOR_MATERIAL_SOURCES, ARMOR_SPECIAL_REWARDS, armorStatsAt, type ArmorId } from '../src/data/armor';
import { MATERIAL_NAMES } from '../src/data/items';
import { ENEMIES } from '../src/data/enemies';
import { SPECIAL_REWARDS, WEAPON_DEFS } from '../src/data/weapons';
import { TUNING } from '../src/config/tuning';
import { enemyCritDamage, heroKnockback, resistedDuration } from '../src/sim/armorRules';
import type { RunResult } from '../src/sim/battle';

const always = () => 0;
const never = () => 0.9999;
const forgeSave = (): SaveData => {
  const s = newSave();
  s.rescued.push('kosyot', 'kangkang');
  visitForge(s);
  return s;
};
/** 보호구를 바로 보유·강화 단계로 만든다(제작 경로는 따로 검증) */
const own = (s: SaveData, id: ArmorId, level = 0) => { s.armor[id] = { level, fails: {} }; };
const battle = (s: SaveData, seed = 3) => new Battle({ runId: 1, seed, loadout: buildLoadout(s) });
const victory = (runId: number, chapterId: number): RunResult => ({
  runId, chapterId, outcome: 'victory', defeatCause: null, rescued: null, loot: {}, heroLevel: 1, time: 1,
  kills: { required: 0, requiredTotal: 0, children: 0 },
});

describe('보호구 6종 데이터(확정표 그대로)', () => {
  const names = (id: ArmorId, key: 'craft' | 'special5' | 'special10') => ARMOR_DEFS[id][key].map((m) => `${MATERIAL_NAMES[m.id]} ${m.count}`);

  test('이름·부위: 머리·몸통·발 각 2종', () => {
    expect(ARMOR_IDS.map((id) => `${ARMOR_DEFS[id].slot}:${ARMOR_DEFS[id].name}`)).toEqual([
      'head:폭신폭신 누빔모자', 'head:든든탐험헬멧', 'body:폭신누빔조끼', 'body:튼튼 방탄갑옷', 'feet:폭신말캉 스니커', 'feet:튼튼 탐험부츠',
    ]);
  });

  test('제작 재료·수량, 기본 강화 재료, +5/+10 특별 재료', () => {
    expect(names('quiltHat', 'craft')).toEqual(['낡은 천조각 10', '폭신 마시멜로 8', '낡은 털실뭉치 3']);
    expect(names('explorerHelmet', 'craft')).toEqual(['빵꾸난 헬멧 10', '폭신 마시멜로 8', '녹슨 볼트 3']);
    expect(names('quiltVest', 'craft')).toEqual(['낡은 스웨터 15', '폭신 마시멜로 12', '낡은 털실뭉치 5']);
    expect(names('bulletArmor', 'craft')).toEqual(['찢어진 방탄조끼 15', '녹슨 철판 12', '녹슨 볼트 5']);
    expect(names('squishySneaker', 'craft')).toEqual(['헤진 가죽조각 10', '폭신 마시멜로 8', '낡은 털실뭉치 3']);
    expect(names('explorerBoots', 'craft')).toEqual(['해진 군화 10', '찢어진 고무조각 8', '끈끈 슬라임풀 3']);
    expect(ARMOR_IDS.map((id) => MATERIAL_NAMES[ARMOR_DEFS[id].enhanceMaterial])).toEqual(['구름 솜사탕', '강화볼트', '구름 솜사탕', '강화볼트', '구름 솜사탕', '단단젤리']);
    expect(ARMOR_IDS.map((id) => names(id, 'special5'))).toEqual([
      ['포근한 담요조각 1'], ['매끈한 헬멧 1'], ['앙고라 스웨터 1'], ['튼튼한 방탄섬유 1'], ['탄력고무패드 1'], ['질긴 가죽군화 1'],
    ]);
    expect(ARMOR_IDS.map((id) => names(id, 'special10'))).toEqual([
      ['황금빛 털뭉치 1', '환상의 털모자 1'], ['대장의 헬멧 1', '위장깃털 1'], ['조개단추 1', '할머니 스웨터 1'],
      ['대장의 방탄조끼 1', '불꽃도마뱀 비늘 1'], ['구름가죽 1', '눈꽃깔창 1'], ['대장의 군화 1', '강철거미줄 1'],
    ]);
  });

  test('무기와 같은 재료 창고: 낡은 털실뭉치·녹슨 볼트·강화볼트 등은 같은 id', () => {
    expect(ARMOR_DEFS.quiltHat.craft.find((m) => m.id === 'oldYarn')).toBeTruthy();
    expect(WEAPON_DEFS.jellyGlove.craft.find((m) => m.id === 'oldYarn')).toBeTruthy();
    expect(ARMOR_DEFS.explorerHelmet.enhanceMaterial).toBe(WEAPON_DEFS.pawHammer.enhanceMaterial);
    expect(ARMOR_DEFS.explorerBoots.enhanceMaterial).toBe(WEAPON_DEFS.jellyGlove.enhanceMaterial);
  });

  test('특별 재료 반복 클리어 배치(위임 배치) — 황금빛 털뭉치는 장갑과 공용이라 한 번만', () => {
    const all = [...SPECIAL_REWARDS, ...ARMOR_SPECIAL_REWARDS].map((r) => r.material);
    expect(new Set(all).size).toBe(all.length);
    const r = (m: string) => ARMOR_SPECIAL_REWARDS.find((x) => x.material === m)!;
    expect([r('cozyBlanketPiece').difficulty, r('cozyBlanketPiece').chapters]).toEqual(['normal', [3, 8, 10]]);
    expect([r('fireLizardScale').difficulty, r('fireLizardScale').chapters]).toEqual(['hard', [9, 11, 14]]);
    expect(ARMOR_SPECIAL_REWARDS.filter((x) => x.difficulty === 'hard').every((x) => x.requiresCh8)).toBe(true);
  });
});

describe('등급별 효과(효과 종류 확정, 수치 TEMP) — 무기 공격력표를 복사하지 않음', () => {
  test('모자 2종 문서 초기 테스트 수치: +0 20/10%, +4 28, +5 35/20%, +9 47, +10 60/30%', () => {
    const hp = [0, 4, 5, 9, 10].map((lv) => armorStatsAt('quiltHat', lv).maxHp);
    expect(hp).toEqual([20, 28, 35, 47, 60]);
    expect([0, 5, 10].map((lv) => armorStatsAt('quiltHat', lv).bleed)).toEqual([0.1, 0.2, 0.3]);
    expect([0, 5, 10].map((lv) => armorStatsAt('explorerHelmet', lv).stun)).toEqual([0.1, 0.2, 0.3]);
    expect(armorStatsAt('explorerHelmet', 10).maxHp).toBe(60);
  });

  test('추가 효과는 해당 등급부터만 붙는다', () => {
    expect(armorStatsAt('quiltVest', 4).knockback).toBe(0);
    expect(armorStatsAt('quiltVest', 5).knockback).toBeGreaterThan(0);
    expect(armorStatsAt('quiltVest', 9).critDamage).toBe(0);
    expect(armorStatsAt('quiltVest', 10).critDamage).toBeGreaterThan(0);
    expect(armorStatsAt('bulletArmor', 4).burn).toBe(0);
    expect(armorStatsAt('bulletArmor', 5).burn).toBeGreaterThan(0);
    expect(armorStatsAt('bulletArmor', 9).maxHp).toBe(0);
    expect(armorStatsAt('bulletArmor', 10).maxHp).toBeGreaterThan(0);
    expect(armorStatsAt('squishySneaker', 4).slow).toBe(0);
    expect(armorStatsAt('squishySneaker', 5).slow).toBeGreaterThan(0);
    expect(armorStatsAt('squishySneaker', 10).freeze).toBeGreaterThan(0);
    expect(armorStatsAt('explorerBoots', 5).knockback).toBeGreaterThan(0);
    expect(armorStatsAt('explorerBoots', 9).slow).toBe(0);
    expect(armorStatsAt('explorerBoots', 10).slow).toBeGreaterThan(0);
  });

  test('방탄갑옷 방어력은 모든 단계에서 누빔조끼보다 높다(확정 관계), 기본 효과는 단계마다 강해진다', () => {
    for (let lv = 0; lv <= 10; lv++) {
      expect(armorStatsAt('bulletArmor', lv).defense).toBeGreaterThan(armorStatsAt('quiltVest', lv).defense);
      if (lv > 0) for (const id of ARMOR_IDS) {
        const key = id === 'squishySneaker' ? 'evasion' : ARMOR_DEFS[id].slot === 'head' ? 'maxHp' : 'defense';
        expect(armorStatsAt(id, lv)[key]).toBeGreaterThan(armorStatsAt(id, lv - 1)[key]);
      }
    }
  });

  test('이동속도·대시·공격력 효과 없음', () => {
    for (const id of ARMOR_IDS) for (let lv = 0; lv <= 10; lv++) {
      const st = armorStatsAt(id, lv) as Record<string, number>;
      expect(Object.keys(st).some((k) => /speed|dash|attack/i.test(k))).toBe(false);
    }
  });
});

describe('설계도·제작·강화(무기 공통 강화 규칙)', () => {
  test('대장간 전에는 없음, 깡깡이 대장간에서 누빔모자·누빔조끼, 헬멧은 일반 Ch 4 최초 클리어, 나머지는 미정이라 지급 경로 없음', () => {
    const before = newSave();
    before.rescued.push('kosyot');
    visitForge(before);
    expect(before.armorBlueprints).toEqual([]);
    expect(canCraftArmor(before, 'quiltHat')).toBe('forgeLocked');

    const s = forgeSave();
    expect(s.armorBlueprints.sort()).toEqual(['quiltHat', 'quiltVest']);
    for (let ch = 1; ch <= 15; ch++) settleRun(s, victory(100 + ch, ch));
    expect(s.armorBlueprints.sort()).toEqual(['explorerHelmet', 'quiltHat', 'quiltVest']);
    for (const id of ['bulletArmor', 'squishySneaker', 'explorerBoots'] as ArmorId[]) {
      expect(ARMOR_DEFS[id].blueprint.kind).toBe('undecided');
      expect(canCraftArmor(s, id)).toBe('noBlueprint');
    }
  });

  test('보호구 추가 전에 대장간을 이미 방문한 저장도 다음 방문에 보호구 설계도만 받는다', () => {
    const s = newSave();
    s.rescued.push('kosyot', 'kangkang');
    s.flags.forgeVisited = true;
    s.blueprints = ['jellyGlove', 'fishboneSword'];
    expect(visitForge(s).sort()).toEqual(['quiltHat', 'quiltVest']);
    expect(s.blueprints).toEqual(['jellyGlove', 'fishboneSword']);
    expect(visitForge(s)).toEqual([]);
  });

  test('제작: 확정 수량을 무기와 같은 재료 창고에서 소모, 털실은 장갑과 경쟁', () => {
    const s = forgeSave();
    s.materials = { oldCloth: 10, fluffyMarshmallow: 8, oldYarn: 5, softJelly: 10, wornLeather: 5 };
    expect(craftArmor(s, 'quiltHat')).toBe('ok');
    expect(s.materials).toMatchObject({ oldCloth: 0, fluffyMarshmallow: 0, oldYarn: 2 });
    expect(s.armor.quiltHat).toEqual({ level: 0, fails: {} });
    expect(canCraftArmor(s, 'quiltHat')).toBe('owned');
    expect(canCraft(s, 'jellyGlove')).toBe('materials'); // 털실 2개 남음(장갑은 3개 필요)
    expect(craftWeapon(s, 'jellyGlove')).toBe('materials');
  });

  test('강화: 무기 공통 성공률·소모량, 실패 시 단계 유지·기본 재료만, 특별 재료는 성공 시에만', () => {
    const s = forgeSave();
    own(s, 'quiltHat', 4);
    s.materials = { cloudCottonCandy: 100, cozyBlanketPiece: 1 };
    s.weapons.jellyGlove = { level: 4, fails: {} };
    s.materials.hardJelly = 100;
    s.materials.glossyLeather = 1;
    const a = armorEnhanceInfo(s, 'quiltHat');
    const w = enhanceInfo(s, 'jellyGlove');
    expect([a.baseRate, a.material!.count]).toEqual([w.baseRate, w.material!.count]); // +5: 70%, 15개
    const fail = enhanceArmor(s, 'quiltHat', never);
    expect(fail.success).toBe(false);
    expect(s.armor.quiltHat!.level).toBe(4);
    expect(s.materials.cloudCottonCandy).toBe(85);
    expect(s.materials.cozyBlanketPiece).toBe(1);
    expect(armorEnhanceInfo(s, 'quiltHat').rate).toBeCloseTo(0.75); // 실패당 +5%p
    const ok = enhanceArmor(s, 'quiltHat', always);
    expect(ok.success).toBe(true);
    expect(s.armor.quiltHat!.level).toBe(5);
    expect(s.materials.cozyBlanketPiece).toBe(0);
    expect(s.armor.quiltHat!.fails[5]).toBeUndefined();
  });

  test('9회 연속 실패 뒤 10번째 확정, 특별 재료 없으면 시도 불가', () => {
    const s = forgeSave();
    own(s, 'quiltVest', 9);
    s.materials = { cloudCottonCandy: 1000, shellButton: 1 };
    expect(armorEnhanceInfo(s, 'quiltVest').blocker).toBe('special'); // 할머니 스웨터 없음
    s.materials.grandmaSweater = 1;
    for (let i = 0; i < 9; i++) expect(enhanceArmor(s, 'quiltVest', never).success).toBe(false);
    expect(armorEnhanceInfo(s, 'quiltVest').pityLeft).toBe(0);
    expect(enhanceArmor(s, 'quiltVest', never).success).toBe(true);
    expect(s.armor.quiltVest!.level).toBe(10);
    expect(armorEnhanceInfo(s, 'quiltVest').blocker).toBe('max');
  });
});

describe('장착·저장 — 스탯 중복·체력 무한 회복 없음', () => {
  const baseHp = buildLoadout(newSave()).maxHp;

  test('부위당 1칸: 같은 머리 칸에 헬멧을 끼면 모자는 빠진다', () => {
    const s = forgeSave();
    own(s, 'quiltHat');
    own(s, 'explorerHelmet');
    equipArmor(s, 'quiltHat');
    equipArmor(s, 'explorerHelmet');
    expect(s.equipment.head).toBe('explorerHelmet');
    expect(buildLoadout(s).maxHp).toBe(baseHp + 20);
    expect(equipArmor(s, 'bulletArmor')).toBe('notOwned');
    expect(s.equipment.body).toBeNull();
  });

  test('장착·해제·출격 계산을 반복해도 값이 쌓이지 않고 저장도 바뀌지 않는다', () => {
    const s = forgeSave();
    own(s, 'quiltHat', 5);
    own(s, 'quiltVest', 5);
    for (let i = 0; i < 20; i++) { equipArmor(s, 'quiltHat'); equipArmor(s, 'quiltVest'); unequipArmor(s, 'head'); equipArmor(s, 'quiltHat'); }
    const snap = JSON.stringify(s);
    const l1 = buildLoadout(s);
    const l2 = buildLoadout(s);
    expect(JSON.stringify(s)).toBe(snap);
    expect(l1).toEqual(l2);
    expect(l1.maxHp).toBe(baseHp + 35);
    expect(l1.defense).toBe(buildLoadout(newSave()).defense + 15);
    unequipArmor(s, 'head');
    unequipArmor(s, 'body');
    expect(buildLoadout(s).maxHp).toBe(baseHp);
    expect(buildLoadout(s).defense).toBe(buildLoadout(newSave()).defense);
  });

  test('저장 → 불러오기 뒤에도 같은 출격 능력치(중복 합산 없음)', () => {
    const storage = memoryStorage();
    const s = forgeSave();
    own(s, 'quiltHat', 7);
    own(s, 'quiltVest', 10);
    equipArmor(s, 'quiltHat');
    equipArmor(s, 'quiltVest');
    writeSave(storage, s);
    const r1 = loadSave(storage);
    writeSave(storage, r1);
    const r2 = loadSave(storage);
    expect(buildLoadout(r2)).toEqual(buildLoadout(s));
    expect(r2.armor).toEqual(s.armor);
  });

  test('강화 단계가 바뀌면 그 단계 값으로 다시 계산(이전 단계 값이 남지 않음)', () => {
    const s = forgeSave();
    own(s, 'quiltHat', 4);
    equipArmor(s, 'quiltHat');
    expect(buildLoadout(s).maxHp).toBe(baseHp + 28);
    s.armor.quiltHat!.level = 5;
    expect(buildLoadout(s).maxHp).toBe(baseHp + 35);
    s.armor.quiltHat!.level = 10;
    expect(buildLoadout(s).maxHp).toBe(baseHp + 60);
  });

  test('이전 저장의 문자열 몸통·발 칸, 보유하지 않은 장비, 다른 부위 장비는 불러올 때 비운다', () => {
    const storage = memoryStorage();
    const old = newSave() as any;
    old.equipment = { weapon: 'starterGlove', body: '예전 조끼', feet: 'quiltVest', accessory: null, costume: null };
    delete old.armor;
    delete old.armorBlueprints;
    storage.store(JSON.stringify(old));
    const s = loadSave(storage);
    expect(s.equipment).toMatchObject({ head: null, body: null, feet: null });
    expect(s.armor).toEqual({});
    expect(s.armorBlueprints).toEqual([]);
    expect(buildLoadout(s).maxHp).toBe(baseHp);
  });

  test('전투: 출격 HP = 보호구 포함 최대 HP, 판 중 레벨업·시간 경과로 보호구 체력이 다시 더해지거나 넘치지 않는다', () => {
    const s = forgeSave();
    own(s, 'quiltHat', 10);
    equipArmor(s, 'quiltHat');
    const b = battle(s);
    expect(b.player.maxHp).toBe(baseHp + 60);
    expect(b.player.hp).toBe(b.player.maxHp);
    let maxSeen = 0;
    for (let i = 0; i < 60 * 40; i++) {
      if (b.paused) b.choose(0);
      b.update(1 / 60, { forward: true, jump: false, ult: null });
      expect(b.player.hp).toBeLessThanOrEqual(b.player.maxHp + 1e-9);
      maxSeen = Math.max(maxSeen, b.player.maxHp);
    }
    // 최대 HP 증가는 판 안 최대 체력 패시브(습득 시 1회)뿐
    expect(maxSeen - (baseHp + 60)).toBe(TUNING.passives.maxHp * (b.skills.passives.maxHp ?? 0));
  });

  test('누빔조끼 방어력이 직접 피해 공식에 들어간다(DOT는 제외)', () => {
    const s = forgeSave();
    own(s, 'quiltVest', 0);
    equipArmor(s, 'quiltVest');
    const b = battle(s);
    (b as any).rng.chance = () => false;
    b.player.hp = b.player.maxHp = 1000;
    b.damagePlayer(100, 'direct');
    expect(1000 - b.player.hp).toBeCloseTo(100 * 100 / 108, 5);
    b.player.hp = 1000;
    b.damagePlayer(10, 'dot');
    expect(1000 - b.player.hp).toBe(10);
  });

  test('스니커 회피가 판 회피에 더해진다(상한 TEMP)', () => {
    const s = forgeSave();
    own(s, 'squishySneaker', 10);
    equipArmor(s, 'squishySneaker');
    expect(battle(s).stats().evasion).toBeCloseTo(0.1);
  });
});

describe('저항(지속시간 감소, 면역 아님)', () => {
  const zero = { bleed: 0, burn: 0, freeze: 0, slow: 0, stun: 0, knockback: 0, critDamage: 0 };

  test('누빔모자 출혈 10%: 4초 → 3.6초, 면역 아님', () => {
    const s = forgeSave();
    own(s, 'quiltHat');
    equipArmor(s, 'quiltHat');
    const b = battle(s);
    b.applyHeroStatus({ tag: 'bleed', source: '시험', intensity: 3, duration: 4 });
    expect(b.heroStatus.get('bleed')!.remaining).toBeCloseTo(3.6);
  });

  test('감속 저항은 적 스킬 감속에만, 지형 감속은 그대로', () => {
    const r = { ...zero, slow: 0.3 };
    expect(resistedDuration('slow', 'enemySkill', 5, r)).toBeCloseTo(3.5);
    expect(resistedDuration('slow', 'terrain', 5, r)).toBe(5);
    const s = forgeSave();
    own(s, 'squishySneaker', 5);
    equipArmor(s, 'squishySneaker');
    const b = battle(s);
    b.applyHeroStatus({ tag: 'slow', source: '적', intensity: 0.4, duration: 5 });
    b.applyHeroStatus({ tag: 'slow', source: '진흙', origin: 'terrain', intensity: 0.3, duration: 5 });
    expect(b.heroStatus.get('slow', 'enemySkill')!.remaining).toBeCloseTo(4);
    expect(b.heroStatus.get('slow', 'terrain')!.remaining).toBe(5);
  });

  test('[미정 옵션] 빙결 적용 순서: 저항 뒤 최대시간 제한 / 최대시간 제한 뒤 저항', () => {
    const r = { ...zero, freeze: 0.3 };
    const max = TUNING.status.freezeMaxDuration;
    expect(Math.min(max, resistedDuration('freeze', 'enemySkill', 4, r, 'resistThenCap'))).toBeCloseTo(Math.min(max, 2.8));
    expect(resistedDuration('freeze', 'enemySkill', 4, r, 'capThenResist')).toBeCloseTo(max * 0.7);
  });

  test('[미정 옵션] 같은 종류 저항 합산: 합산/곱연산, 상한', () => {
    expect(combineResist([0.2, 0.2], { stacking: 'additive', cap: 0.6 })).toBeCloseTo(0.4);
    expect(combineResist([0.2, 0.2], { stacking: 'multiplicative', cap: 0.6 })).toBeCloseTo(0.36);
    expect(combineResist([0.5, 0.5], { stacking: 'additive', cap: 0.6 })).toBe(0.6);
    // 실제 장비 조합: 조끼 +5 밀쳐내기 + 부츠 +5 밀쳐내기
    const s = forgeSave();
    own(s, 'quiltVest', 5);
    own(s, 'explorerBoots', 5);
    equipArmor(s, 'quiltVest');
    equipArmor(s, 'explorerBoots');
    const { total, resistParts } = equippedArmorStats(s);
    expect(resistParts.knockback).toEqual([0.2, 0.2]);
    expect(total.knockback).toBeCloseTo(combineResist([0.2, 0.2]));
  });

  test('헬멧 기절 저항은 값만 준비(호냥이 기절 상태·기절 거는 적은 아직 없음)', () => {
    const s = forgeSave();
    own(s, 'explorerHelmet', 5);
    equipArmor(s, 'explorerHelmet');
    expect(buildLoadout(s).armor.resist.stun).toBeCloseTo(0.2);
  });
});

describe('[미정 옵션] 적 치명타·밀쳐내기와 캠프 동기 이동', () => {
  test('적 치명타는 기본 꺼짐: 피해 그대로, 난수도 쓰지 않음', () => {
    let calls = 0;
    expect(enemyCritDamage(10, () => { calls++; return 0; }, 0.2)).toEqual({ dmg: 10, crit: false });
    expect(calls).toBe(0);
    expect(TUNING.undecided.enemyCrit.enabled).toBe(false);
  });

  test('켜면 조끼 +10 받는 치명타 피해 감소: 추가분만 / 전체', () => {
    const on = { enabled: true, chance: 1, multiplier: 1.5 };
    expect(enemyCritDamage(10, () => 0, 0.2, { ...on, reduction: 'bonusOnly' }).dmg).toBeCloseTo(14);
    expect(enemyCritDamage(10, () => 0, 0.2, { ...on, reduction: 'wholeHit' }).dmg).toBeCloseTo(12);
    expect(enemyCritDamage(10, () => 0, 0, { ...on, reduction: 'bonusOnly' }).dmg).toBeCloseTo(15);
  });

  test('밀쳐내기: 캠프 제자리(최소 간격에서 멈춤, 후방 통과 없음) / 캠프도 밀림(간격 유지), 거리 감소 적용', () => {
    const a = heroKnockback(500, 300, 100, 0.2, { campSync: 'campStays', minGap: 60 });
    expect(a).toEqual({ heroX: 420, campX: 300, moved: 80 });
    const b = heroKnockback(380, 300, 100, 0, { campSync: 'campStays', minGap: 60 });
    expect(b.heroX).toBe(360);
    const c = heroKnockback(500, 300, 100, 0.2, { campSync: 'campPushed', minGap: 60 });
    expect(c).toEqual({ heroX: 420, campX: 220, moved: 80 });
  });

  test('전투 진입점: 지금 기본값(캠프 제자리)으로 호냥이만 밀리고 캠프 뒤로 넘어가지 않는다', () => {
    const s = forgeSave();
    own(s, 'explorerBoots', 5);
    equipArmor(s, 'explorerBoots');
    const b = battle(s);
    const cx = b.camp.x;
    const moved = b.knockbackHero(1000);
    expect(b.camp.x).toBe(cx);
    expect(b.player.x).toBeGreaterThanOrEqual(cx + TUNING.undecided.heroKnockback.minGap);
    expect(moved).toBeGreaterThan(0);
  });
});

describe('획득처(위임 배치)', () => {
  test('Ch 1 적에 보호구 기본 재료 드롭(확률 TEMP)', () => {
    const ids = (k: keyof typeof ENEMIES) => ENEMIES[k].loot.map((l) => l.id);
    expect(ids('meteorRat')).toEqual(expect.arrayContaining(['oldCloth', 'oldSweater']));
    expect(ids('dustSlime')).toEqual(expect.arrayContaining(['fluffyMarshmallow', 'stickySlimeGlue']));
    expect(ids('kingDustSlime')).toContain('cloudCottonCandy');
  });

  test('미구현 챕터 획득처는 데이터로만(구현 표시 없음), 계열 지정은 정식 이름이 아님', () => {
    const rows = Object.values(ARMOR_MATERIAL_SOURCES).flat();
    expect(rows.filter((r) => r!.implemented).every((r) => r!.chapter === 1)).toBe(true);
    expect(rows.filter((r) => r!.enemy.includes('기계병') || r!.enemy.includes('갑옷병')).every((r) => r!.family)).toBe(true);
  });

  test('Ch 1 몇 판이면 누빔모자·누빔조끼 기본 재료를 모을 수 있다(봇 10판 합계)', async () => {
    const { runBot } = await import('./bot');
    const total: Record<string, number> = {};
    for (let seed = 1; seed <= 10; seed++) {
      const { battle: b } = runBot({ seed });
      for (const [k, v] of Object.entries(b.loot)) total[k] = (total[k] ?? 0) + (v ?? 0);
    }
    expect(total.oldCloth ?? 0).toBeGreaterThanOrEqual(10);
    expect(total.fluffyMarshmallow ?? 0).toBeGreaterThanOrEqual(20);
    expect(total.oldSweater ?? 0).toBeGreaterThanOrEqual(15);
    expect(total.cloudCottonCandy ?? 0).toBeGreaterThan(0);
  });
});

void NO_INPUT;
