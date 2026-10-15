import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { buildLoadout, loadSave, memoryStorage, newSave, writeSave, type SaveData } from '../src/meta/save';
import {
  accessoryEnhanceInfo, armorEnhanceInfo, canCraftAccessory, craftAccessory, enhanceAccessory, equipAccessory,
  equippedAccessoryStats, specialClearRewards, unequipAccessory, visitForge, workshopUnlocked,
} from '../src/meta/forge';
import {
  ACCESSORY_DEFS, ACCESSORY_IDS, ACCESSORY_MATERIAL_SOURCES, ACCESSORY_SLOTS, ACCESSORY_SPECIAL_REWARDS, accessoryValueAt, type AccessoryId,
} from '../src/data/accessories';
import { ARMOR_SPECIAL_REWARDS } from '../src/data/armor';
import { MATERIAL_NAMES } from '../src/data/items';
import { ENEMIES } from '../src/data/enemies';
import { ENHANCE_TABLE, SPECIAL_REWARDS, enhanceAttackBonus } from '../src/data/weapons';
import { TUNING } from '../src/config/tuning';

const always = () => 0;
const never = () => 0.9999;
const nabiSave = (): SaveData => {
  const s = newSave();
  s.rescued.push('kosyot', 'kangkang', 'nabi');
  s.accessoryBlueprints = [...ACCESSORY_IDS]; // 설계도 시점 미정 → 테스트 우회
  return s;
};
const own = (s: SaveData, id: AccessoryId, level = 0) => { s.accessories[id] = { level, fails: {} }; };
const battle = (s: SaveData) => new Battle({ runId: 1, seed: 3, loadout: buildLoadout(s) });
const names = (id: AccessoryId, key: 'craft' | 'special5' | 'special10') => ACCESSORY_DEFS[id][key].map((m) => `${MATERIAL_NAMES[m.id]} ${m.count}`);

describe('액세서리 10종 데이터(확정표 그대로)', () => {
  test('두 시리즈 × 다섯 종류, 이름·대표 효과', () => {
    expect(ACCESSORY_IDS.map((id) => `${ACCESSORY_DEFS[id].name}:${ACCESSORY_DEFS[id].stat}`)).toEqual([
      '햇살 방울 목걸이:attack', '햇살 방울 반지:critChance', '햇살 방울 팔찌:attackSpeed', '햇살 방울 브로치:regenInterval', '햇살 방울 부적:luck',
      '달빛 캣닢 목걸이:maxHp', '달빛 캣닢 반지:critDamage', '달빛 캣닢 팔찌:cooldown', '달빛 캣닢 브로치:defense', '달빛 캣닢 부적:energyRegen',
    ]);
  });

  test('제작 재료: 시리즈 공통 핵심 + 형태 + 결속(부적은 낡은 털실뭉치)', () => {
    expect(names('sunNecklace', 'craft')).toEqual(['빛바랜 방울 5', '리본조각 8', '작은 연결고리 3']);
    expect(names('moonNecklace', 'craft')).toEqual(['향긋한 캣닢 5', '리본조각 8', '작은 연결고리 3']);
    expect(names('sunRing', 'craft')).toEqual(['빛바랜 방울 2', '낡은 은반지 3', '끈끈 슬라임풀 1']);
    expect(names('moonBracelet', 'craft')).toEqual(['향긋한 캣닢 6', '빛바랜 구슬 8', '탄력고무밴드 3']);
    expect(names('sunBrooch', 'craft')).toEqual(['빛바랜 방울 4', '구부러진 브로치핀 3', '끈끈 슬라임풀 2']);
    expect(names('moonCharm', 'craft')).toEqual(['향긋한 캣닢 3', '오래된 부적조각 5', '낡은 털실뭉치 2']);
  });

  test('강화 재료와 +5/+10 특별 재료', () => {
    expect(ACCESSORY_IDS.map((id) => MATERIAL_NAMES[ACCESSORY_DEFS[id].enhanceMaterial])).toEqual([
      ...Array(5).fill('마법의 햇살가루'), ...Array(5).fill('달빛이슬'),
    ]);
    expect(ACCESSORY_IDS.map((id) => [...names(id, 'special5'), ...names(id, 'special10')].join('/'))).toEqual([
      '향기로운 꽃매듭 1/요정의 리본 1/태양빛보석 1',
      '오로라 진주 1/순백 은반지 1/루비의심장 1',
      '오색 유리구슬 1/무지개 구슬 1/무지개 수정 1',
      '빛나는 황금나비 1/태양브로치 1/태양결정조각 1',
      '신령한 부적 1/태양의부적 1/별똥별 파편 1',
      '부드러운 비단매듭 1/요정의 리본 1/달빛보석 1',
      '오로라 진주 1/순백 은반지 1/사파이어의심장 1',
      '오색 유리구슬 1/무지개 구슬 1/별빛 수정 1',
      '빛나는 은빛나비 1/초승달브로치 1/달빛결정조각 1',
      '신령한 부적 1/달의부적 1/별똥별 파편 1',
    ]);
  });

  test('공통 재료는 같은 id 하나(시리즈별 중복 생성 없음), 리본조각은 떨어진 리본과 별도', () => {
    const ids = Object.keys(MATERIAL_NAMES);
    const vals = Object.values(MATERIAL_NAMES);
    expect(new Set(vals).size).toBe(vals.length);
    expect(ACCESSORY_DEFS.sunNecklace.special10[0].id).toBe('fairyRibbon'); // 낚싯봉과 같은 요정의 리본
    expect(ACCESSORY_DEFS.sunRing.special5[0].id).toBe(ACCESSORY_DEFS.moonRing.special5[0].id);
    expect(ids).toContain('ribbonPiece');
    expect(MATERIAL_NAMES.ribbonPiece).not.toBe(MATERIAL_NAMES.fallenRibbon);
  });

  test('특별 재료 반복 클리어 배치: 중복 지급 없음, 전설용은 고난도·Ch 8 이후, 한 챕터에 몰지 않음', () => {
    const all = [...SPECIAL_REWARDS, ...ARMOR_SPECIAL_REWARDS, ...ACCESSORY_SPECIAL_REWARDS].map((r) => r.material);
    expect(new Set(all).size).toBe(all.length);
    for (const id of ACCESSORY_IDS) for (const sp of ACCESSORY_DEFS[id].special10) {
      const r = [...SPECIAL_REWARDS, ...ACCESSORY_SPECIAL_REWARDS].find((x) => x.material === sp.id)!;
      expect([r.difficulty, r.requiresCh8]).toEqual(['hard', true]);
    }
    for (const r of ACCESSORY_SPECIAL_REWARDS) expect(new Set(r.chapters).size).toBe(3);
    expect(specialClearRewards(1, 'normal', false)).toEqual([]); // Ch 1에는 특별 재료 없음
  });

  test('재료 획득처: 재료마다 대체 챕터 2곳 이상, 미매핑은 계열 표시', () => {
    for (const [mat, rows] of Object.entries(ACCESSORY_MATERIAL_SOURCES)) {
      expect(new Set(rows!.map((r) => r.chapter)).size, mat).toBeGreaterThanOrEqual(2);
      for (const r of rows!) if (r.enemy.includes('미매핑')) expect(r.family).toBe(true);
    }
    expect(ENEMIES.spikyBug.loot.map((l) => l.id)).toContain('fadedBell');
    expect(ENEMIES.dustSlime.loot.map((l) => l.id)).toContain('fadedBead');
    expect(ENEMIES.rollingRat.loot.map((l) => l.id)).toContain('sunDust');
    expect(ENEMIES.meteorRat.loot.map((l) => l.id)).toContain('wornLeather'); // 헤진 가죽조각: 일반 운석 쥐
  });
});

describe('효과 수치(TEMP) — 대표 효과 하나만, 무기 공격력표 아님', () => {
  test('일반 점진, +5·+10에서 크게 상승', () => {
    for (const id of ACCESSORY_IDS) {
      const v = Array.from({ length: 11 }, (_, lv) => accessoryValueAt(id, lv));
      for (let lv = 1; lv <= 10; lv++) expect(v[lv]).toBeGreaterThan(v[lv - 1]);
      expect(v[5] - v[4]).toBeGreaterThan(v[4] - v[3]);
      expect(v[10] - v[9]).toBeGreaterThan(v[9] - v[8]);
    }
  });

  test('햇살 목걸이 공격력은 무기 강화표(+5 35%, +10 80%)를 복사하지 않음', () => {
    expect(accessoryValueAt('sunNecklace', 5)).not.toBeCloseTo(enhanceAttackBonus(5));
    expect(accessoryValueAt('sunNecklace', 10)).not.toBeCloseTo(enhanceAttackBonus(10));
  });

  test('하나만 끼면 그 효과만 바뀌고 추가 능력 없음', () => {
    const s = nabiSave();
    own(s, 'sunRing', 10);
    equipAccessory(s, 'sunRing', 0);
    const st = equippedAccessoryStats(s);
    expect(Object.entries(st).filter(([, v]) => v !== 0).map(([k]) => k)).toEqual(['critChance']);
  });
});

describe('나비 공방·제작·강화(공통 규칙)', () => {
  test('나비 구출 전에는 공방이 잠김(대장간과 별개), 설계도 시점 미정이라 정상 진행에서는 설계도 없음', () => {
    const s = newSave();
    s.rescued.push('kosyot', 'kangkang');
    visitForge(s);
    expect(workshopUnlocked(s)).toBe(false);
    expect(canCraftAccessory(s, 'sunRing')).toBe('forgeLocked');
    s.rescued.push('nabi');
    expect(canCraftAccessory(s, 'sunRing')).toBe('noBlueprint');
    expect(ACCESSORY_IDS.every((id) => ACCESSORY_DEFS[id].blueprint.kind === 'undecided')).toBe(true);
  });

  test('제작: 공통 창고에서 확정 수량 소모, 끈끈 슬라임풀·털실은 다른 장비와 경쟁, 같은 아이템 하나만', () => {
    const s = nabiSave();
    s.materials = { fadedBell: 2, oldSilverRing: 3, stickySlimeGlue: 1, fragrantCatnip: 3, oldCharmPiece: 5, oldYarn: 2 };
    expect(craftAccessory(s, 'sunRing')).toBe('ok');
    expect(s.materials).toMatchObject({ fadedBell: 0, oldSilverRing: 0, stickySlimeGlue: 0 });
    expect(canCraftAccessory(s, 'sunRing')).toBe('owned');
    expect(craftAccessory(s, 'moonCharm')).toBe('ok');
    expect(s.materials.oldYarn).toBe(0);
  });

  test('강화: 성공률·소모량·실패 +5%p는 장비 공통, 실패 시 단계·특별 재료 보존, 성공 시 특별 재료 각 1개', () => {
    const s = nabiSave();
    s.rescued = ['nabi']; // 깡깡이 없어도 공방 강화 가능
    own(s, 'sunNecklace', 4);
    s.materials = { sunDust: 100, flowerKnot: 1 };
    const info = accessoryEnhanceInfo(s, 'sunNecklace');
    expect([info.baseRate, info.material!.count]).toEqual([ENHANCE_TABLE[4].rate, ENHANCE_TABLE[4].material]);
    expect(enhanceAccessory(s, 'sunNecklace', never).success).toBe(false);
    expect([s.accessories.sunNecklace!.level, s.materials.sunDust, s.materials.flowerKnot]).toEqual([4, 85, 1]);
    expect(accessoryEnhanceInfo(s, 'sunNecklace').rate).toBeCloseTo(0.75);
    expect(enhanceAccessory(s, 'sunNecklace', always).success).toBe(true);
    expect([s.accessories.sunNecklace!.level, s.materials.flowerKnot]).toEqual([5, 0]);
  });

  test('+10: 특별 재료 2종 모두 필요, 9회 실패 뒤 확정, 성공 시 각 1개 소모', () => {
    const s = nabiSave();
    own(s, 'moonRing', 9);
    s.materials = { moonDew: 1000, whiteSilverRing: 1 };
    expect(accessoryEnhanceInfo(s, 'moonRing').blocker).toBe('special');
    s.materials.sapphireHeart = 1;
    for (let i = 0; i < 9; i++) enhanceAccessory(s, 'moonRing', never);
    expect(s.materials).toMatchObject({ whiteSilverRing: 1, sapphireHeart: 1 });
    expect(enhanceAccessory(s, 'moonRing', never).success).toBe(true);
    expect(s.materials).toMatchObject({ whiteSilverRing: 0, sapphireHeart: 0, moonDew: 1000 - 35 * 10 });
  });

  test('공방이 열려도 대장간(깡깡이) 잠금은 그대로', () => {
    const s = newSave();
    s.rescued.push('nabi');
    s.armor.quiltHat = { level: 0, fails: {} };
    s.materials.cloudCottonCandy = 99;
    expect(armorEnhanceInfo(s, 'quiltHat').blocker).toBe('forgeLocked');
  });
});

describe('착용 2칸 — 동일품 중복 금지(등급 무관), 같은 종류 다른 품·시리즈 혼합 허용, 세트 보너스 없음', () => {
  test('같은 아이템은 다른 칸에 낄 수 없다', () => {
    const s = nabiSave();
    own(s, 'sunRing', 7);
    expect(equipAccessory(s, 'sunRing', 0)).toBe('ok');
    expect(equipAccessory(s, 'sunRing', 1)).toBe('duplicate');
    expect(s.equipment.accessories).toEqual(['sunRing', null]);
    expect(equipAccessory(s, 'sunRing', 0)).toBe('ok'); // 같은 칸 재장착은 그대로
    expect(equipAccessory(s, 'moonRing', 1)).toBe('notOwned');
    expect(equipAccessory(s, 'sunRing', 2)).toBe('badSlot');
    expect(ACCESSORY_SLOTS).toBe(2);
  });

  test('같은 종류의 다른 아이템(햇살 반지 + 달빛 반지)·시리즈 혼합 가능', () => {
    const s = nabiSave();
    own(s, 'sunRing');
    own(s, 'moonRing');
    expect(equipAccessory(s, 'sunRing', 0)).toBe('ok');
    expect(equipAccessory(s, 'moonRing', 1)).toBe('ok');
    const st = equippedAccessoryStats(s);
    expect(st.critChance).toBeCloseTo(accessoryValueAt('sunRing', 0));
    expect(st.critDamage).toBeCloseTo(accessoryValueAt('moonRing', 0));
  });

  test('같은 시리즈 두 개를 껴도 세트 보너스 없음(두 효과의 단순 합)', () => {
    const s = nabiSave();
    own(s, 'sunNecklace', 3);
    own(s, 'sunRing', 3);
    equipAccessory(s, 'sunNecklace', 0);
    equipAccessory(s, 'sunRing', 1);
    const st = equippedAccessoryStats(s);
    expect(st).toEqual({ ...equippedAccessoryStats(newSave()), attack: accessoryValueAt('sunNecklace', 3), critChance: accessoryValueAt('sunRing', 3) });
  });

  test('저장을 고쳐 같은 아이템을 두 칸에 넣어도 한 번만 계산하고, 불러올 때 두 번째 칸을 비운다', () => {
    const s = nabiSave();
    own(s, 'moonNecklace', 10);
    s.equipment.accessories = ['moonNecklace', 'moonNecklace'];
    expect(equippedAccessoryStats(s).maxHp).toBe(accessoryValueAt('moonNecklace', 10));
    const storage = memoryStorage();
    writeSave(storage, s);
    expect(loadSave(storage).equipment.accessories).toEqual(['moonNecklace', null]);
  });

  test('이전 저장(accessory 1칸 문자열)·보유하지 않은 아이템은 불러올 때 비운다', () => {
    const storage = memoryStorage();
    const old = newSave() as any;
    old.equipment = { weapon: 'starterGlove', head: null, body: null, feet: null, accessory: '튼튼 하트 브로치', costume: null };
    delete old.accessories;
    delete old.accessoryBlueprints;
    storage.store(JSON.stringify(old));
    const s = loadSave(storage);
    expect(s.equipment.accessories).toEqual([null, null]);
    expect((s.equipment as any).accessory).toBeUndefined();
    expect(s.accessories).toEqual({});
    old.equipment = { weapon: 'starterGlove', head: null, body: null, feet: null, accessories: ['sunRing', 'nope'], costume: null };
    storage.store(JSON.stringify(old));
    expect(loadSave(storage).equipment.accessories).toEqual([null, null]);
  });
});

describe('장착·해제·강화·불러오기 — 중복 스탯·회복 악용 없음', () => {
  const base = buildLoadout(newSave());

  test('착용·해제 반복, 출격 계산 반복, 저장·불러오기 뒤에도 같은 값', () => {
    const s = nabiSave();
    own(s, 'moonNecklace', 5);
    own(s, 'moonBrooch', 5);
    for (let i = 0; i < 20; i++) { equipAccessory(s, 'moonNecklace', 0); unequipAccessory(s, 0); equipAccessory(s, 'moonNecklace', 0); equipAccessory(s, 'moonBrooch', 1); }
    const snap = JSON.stringify(s);
    const l = buildLoadout(s);
    expect(buildLoadout(s)).toEqual(l);
    expect(JSON.stringify(s)).toBe(snap);
    expect(l.maxHp).toBe(base.maxHp + 30);
    expect(l.defense).toBe(base.defense + 12);
    const storage = memoryStorage();
    writeSave(storage, s);
    const r = loadSave(storage);
    writeSave(storage, r);
    expect(buildLoadout(loadSave(storage))).toEqual(l);
    unequipAccessory(s, 0);
    unequipAccessory(s, 1);
    expect(buildLoadout(s)).toEqual(buildLoadout(nabiSave()));
  });

  test('강화 단계가 바뀌면 그 단계 값으로만(이전 값 누적 없음)', () => {
    const s = nabiSave();
    own(s, 'moonNecklace', 4);
    equipAccessory(s, 'moonNecklace', 0);
    const at = (lv: number) => { s.accessories.moonNecklace!.level = lv; return buildLoadout(s).maxHp - base.maxHp; };
    expect([at(4), at(5), at(10), at(5)]).toEqual([23, 30, 50, 30]);
  });

  test('전투 반영: 공격력·치명·공격속도·쿨타임·기력·행운이 패시브와 합쳐지고 상한(TEMP) 적용', () => {
    const s = nabiSave();
    for (const id of ['sunNecklace', 'sunBracelet'] as AccessoryId[]) own(s, id, 10);
    equipAccessory(s, 'sunNecklace', 0);
    equipAccessory(s, 'sunBracelet', 1);
    const b = battle(s);
    const b0 = battle(newSave());
    expect(b.stats().attackMul / b0.stats().attackMul).toBeCloseTo(1 + accessoryValueAt('sunNecklace', 10));
    expect(b.stats().basicInterval / b0.stats().basicInterval).toBeCloseTo(1 - accessoryValueAt('sunBracelet', 10));
    b.skills.passives.attackSpeed = 5; // 패시브 40% + 팔찌 14% → 상한 50%(TEMP)
    expect(b.stats().basicInterval / b0.stats().basicInterval).toBeCloseTo(1 - TUNING.accessory.caps.attackSpeed);

    const t = nabiSave();
    for (const id of ['moonBracelet', 'sunCharm'] as AccessoryId[]) own(t, id, 10);
    equipAccessory(t, 'moonBracelet', 0);
    equipAccessory(t, 'sunCharm', 1);
    const c = battle(t);
    expect(c.stats().cooldownMul).toBeCloseTo(1 - accessoryValueAt('moonBracelet', 10));
    c.skills.passives.cooldown = 5; // 30% + 14% → 기존 상한 50% 안
    expect(c.stats().cooldownMul).toBeCloseTo(1 - 0.44);
    expect(c.stats().luck - b0.stats().luck).toBeCloseTo(accessoryValueAt('sunCharm', 10));
  });

  test('달빛 부적: 냥기력 회복 빨라짐', () => {
    const s = nabiSave();
    own(s, 'moonCharm', 10);
    equipAccessory(s, 'moonCharm', 0);
    expect(battle(s).stats().energyRegen / battle(newSave()).stats().energyRegen).toBeCloseTo(1 + accessoryValueAt('moonCharm', 10));
  });

  test('햇살 브로치(확정 8차): 단독으로 느린 회복, 회복 패시브가 있으면 간격이 더 짧아진다. 틱당 회복량은 그대로', () => {
    const s = nabiSave();
    own(s, 'sunBrooch', 10);
    equipAccessory(s, 'sunBrooch', 0);
    const b = battle(s);
    const v = accessoryValueAt('sunBrooch', 10);
    const solo = b.stats().regenInterval;
    expect(solo).toBeCloseTo(TUNING.regen.broochSoloInterval * (1 - v));
    b.player.hp = 50;
    b.update(1 / 60, NO_INPUT);
    expect(b.player.hp).toBe(50); // 장착·출격 즉시 회복 없음
    for (let t = 0; t < solo; t += 1 / 60) b.update(1 / 60, NO_INPUT);
    expect(b.player.hp).toBe(50 + TUNING.regen.tickHeal); // 한 틱 = 고정 회복량
    // 회복 패시브 추가: 간격 추가 단축(틱당 양은 그대로)
    b.skills.passives.hpRegen = 1;
    const both = b.stats().regenInterval;
    const plain = battle(newSave());
    plain.skills.passives.hpRegen = 1;
    expect(both).toBeLessThan(solo);
    expect(both).toBeLessThan(plain.stats().regenInterval);
    expect(both).toBeCloseTo(Math.min(plain.stats().regenInterval, TUNING.regen.broochSoloInterval) * (1 - v));
    // 브로치·패시브 둘 다 없으면 회복 없음
    expect(battle(newSave()).stats().regenInterval).toBe(Infinity);
  });

  test('회복 악용 방지: 최대 HP일 때 시간을 저축하지 않고, 회복 루프는 하나뿐(두 칸에 같은 브로치 불가)', () => {
    const s = nabiSave();
    own(s, 'sunBrooch', 10);
    equipAccessory(s, 'sunBrooch', 0);
    expect(equipAccessory(s, 'sunBrooch', 1)).toBe('duplicate');
    const b = battle(s);
    (b as any).updateWaves = () => undefined; // 적 없이 회복만 본다
    (b as any).updateSupports = () => undefined;
    const interval = b.stats().regenInterval;
    // 가득 찬 상태로 오래 있다가 맞아도 몰아서 회복하지 않는다
    for (let t = 0; t < 30; t += 1 / 60) b.update(1 / 60, NO_INPUT);
    b.player.hp = b.player.maxHp - 20;
    const hp = b.player.hp;
    for (let t = 0; t < interval - 0.1; t += 1 / 60) b.update(1 / 60, NO_INPUT);
    expect(b.player.hp).toBe(hp);
    // 긴 시간 동안 회복량 = 틱 수 × 틱당 양(중복 루프 없음)
    const c = battle(s);
    (c as any).updateWaves = () => undefined;
    (c as any).updateSupports = () => undefined; // 캡슐 회복 제외
    c.player.hp = 10;
    let healed = 0;
    for (let t = 0; t < 20; t += 1 / 60) { const h = c.player.hp; c.update(1 / 60, NO_INPUT); if (c.player.hp > h) healed += c.player.hp - h; }
    expect(healed).toBeLessThanOrEqual((Math.floor(20 / interval) + 1) * TUNING.regen.tickHeal);
  });

  test('판 안에서 최대 HP 이상 회복하지 않고, 최대 HP는 출격 때 한 번만 더해진다', () => {
    const s = nabiSave();
    own(s, 'moonNecklace', 10);
    own(s, 'sunBrooch', 10);
    equipAccessory(s, 'moonNecklace', 0);
    equipAccessory(s, 'sunBrooch', 1);
    const b = battle(s);
    expect(b.player.maxHp).toBe(base.maxHp + 50);
    expect(b.player.hp).toBe(b.player.maxHp);
    b.skills.passives.hpRegen = 5;
    b.player.hp = 1;
    for (let i = 0; i < 60 * 30; i++) {
      if (b.paused) b.choose(0);
      b.update(1 / 60, NO_INPUT);
      expect(b.player.hp).toBeLessThanOrEqual(b.player.maxHp + 1e-9);
    }
    expect(b.player.maxHp - (base.maxHp + 50)).toBe(TUNING.passives.maxHp * (b.skills.passives.maxHp ?? 0));
  });
});
