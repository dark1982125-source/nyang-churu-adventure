import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { heroOffers, type RunSkills } from '../src/sim/choices';
import { GLOVE, PASSIVES, type PassiveId } from '../src/data/skills';
import { buildLoadout, newSave } from '../src/meta/save';
import { settleRun } from '../src/meta/settlement';
import { TUNING } from '../src/config/tuning';
import { Rng } from '../src/sim/rng';

const DT = 1 / 60;
const fresh = (seed = 3) => new Battle({ runId: 1, seed, loadout: buildLoadout(newSave()) });
const empty = (): RunSkills => ({ basicLevel: 1, exclusives: [], passives: {}, camp: {} });
const ALL = Object.keys(PASSIVES) as PassiveId[];

describe('공통 패시브 14종 · 최대 5종 · 각 Lv.5', () => {
  test('패시브는 정확히 14종', () => {
    expect(ALL).toHaveLength(14);
  });

  test('5종을 보유하면 새 패시브는 후보에서 제외되고 보유 5종만 레벨업 후보로 나온다', () => {
    const s = empty();
    const owned: PassiveId[] = ['attack', 'maxHp', 'evasion', 'luck', 'cooldown'];
    for (const id of owned) s.passives[id] = 1;
    const rng = new Rng(5);
    for (let i = 0; i < 300; i++) {
      for (const o of heroOffers(s, GLOVE, 0, rng)) {
        if (o.kind === 'passive') expect(owned).toContain(o.id);
      }
    }
  });

  test('Lv.5에 도달한 패시브는 후보에서 제외된다(등급 진화 없음)', () => {
    const s = empty();
    s.passives.attack = TUNING.growth.passiveMaxLevel;
    const rng = new Rng(9);
    for (let i = 0; i < 300; i++) {
      for (const o of heroOffers(s, GLOVE, 0, rng)) {
        if (o.kind === 'passive') expect(o.id).not.toBe('attack');
      }
    }
  });

  test('모든 후보가 최대가 되면 대체 보상으로 채운다', () => {
    const s = empty();
    s.basicLevel = TUNING.basicAttack.maxLevel;
    s.exclusives = ['udada', 'uppercut', 'straight'].map((id) => ({ id: id as any, grade: 'legend' as const, level: 1 }));
    for (const id of ALL.slice(0, 5)) s.passives[id] = 5;
    const offers = heroOffers(s, GLOVE, 0, new Rng(1));
    expect(offers.every((o) => o.kind === 'filler')).toBe(true);
    expect(new Set(offers.map((o) => (o.kind === 'filler' ? o.id : ''))).size).toBe(3);
  });

  test('판 안 패시브는 다음 판으로 이어지지 않는다', () => {
    const save = newSave();
    const b1 = new Battle({ runId: 1, seed: 1, loadout: buildLoadout(save) });
    b1.skills.passives.attack = 3;
    settleRun(save, b1.result());
    const b2 = new Battle({ runId: 2, seed: 1, loadout: buildLoadout(save) });
    expect(b2.skills.passives).toEqual({});
  });
});

describe('HP·기력 회복과 최대치', () => {
  test('체력 회복력 패시브가 없으면 HP는 자연 회복하지 않는다', () => {
    const b = fresh();
    b.player.hp = 50;
    for (let i = 0; i < 120; i++) b.update(DT, NO_INPUT);
    expect(b.player.hp).toBe(50);
  });

  test('패시브 습득 후에는 피격 직후에도 대기 없이 바로 회복한다', () => {
    const b = fresh();
    b.skills.passives.hpRegen = 1;
    b.player.hp = 50;
    b.damagePlayer(10);
    const afterHit = b.player.hp;
    b.update(DT, NO_INPUT);
    expect(b.player.hp).toBeGreaterThan(afterHit);
  });

  test('냥기력은 패시브 없이도 자연 회복하고, 패시브로 더 빨라진다', () => {
    const a = fresh();
    a.player.energy = 0;
    for (let i = 0; i < 60; i++) a.update(DT, NO_INPUT);
    const base = a.player.energy;
    expect(base).toBeGreaterThan(0);
    const b = fresh();
    b.skills.passives.energyRegen = 3;
    b.player.energy = 0;
    for (let i = 0; i < 60; i++) b.update(DT, NO_INPUT);
    expect(b.player.energy).toBeGreaterThan(base);
  });

  test('최대 HP·최대 냥기력 패시브는 증가분만큼 현재치도 올린다(완전 회복 아님)', () => {
    const b = fresh();
    b.player.hp = 40;
    b.player.energy = 30;
    const maxHp = b.player.maxHp;
    const maxEn = b.player.maxEnergy;
    (b as any).applyOffer({ kind: 'passive', id: 'maxHp', nextLevel: 1 });
    (b as any).applyOffer({ kind: 'passive', id: 'maxEnergy', nextLevel: 1 });
    expect(b.player.maxHp).toBe(maxHp + TUNING.passives.maxHp);
    expect(b.player.hp).toBe(40 + TUNING.passives.maxHp);
    expect(b.player.maxEnergy).toBe(maxEn + TUNING.passives.maxEnergy);
    expect(b.player.energy).toBe(30 + TUNING.passives.maxEnergy);
  });
});

describe('적용 범위', () => {
  test('공격속도는 기본 공격 주기만, 쿨타임 감소는 전용 스킬 쿨타임만 바꾼다', () => {
    const b = fresh();
    const s0 = b.stats();
    b.skills.passives.attackSpeed = 3;
    const s1 = b.stats();
    expect(s1.basicInterval).toBeLessThan(s0.basicInterval);
    expect(s1.cooldownMul).toBe(s0.cooldownMul);
    b.skills.passives = { cooldown: 3 };
    const s2 = b.stats();
    expect(s2.cooldownMul).toBeLessThan(1);
    expect(s2.basicInterval).toBe(s0.basicInterval);
  });

  test('스킬 피해량 증가는 전용 스킬에만, 공격력 증가는 기본 공격과 스킬 모두에 적용', () => {
    const b = fresh();
    b.skills.passives.skillDamage = 5;
    const st = b.stats();
    const rb = (b as any).rollDamage.bind(b);
    const noCrit = { ...st, critChance: 0 };
    expect(rb(10, 'basic', noCrit).dmg).toBeCloseTo(10 * st.attackMul);
    expect(rb(10, 'skill', noCrit).dmg).toBeCloseTo(10 * st.attackMul * st.skillDamageMul);
    b.skills.passives = { attack: 2 };
    const st2 = { ...b.stats(), critChance: 0 };
    expect(rb(10, 'basic', st2).dmg).toBeGreaterThan(10 * st.attackMul);
  });

  test('회피는 적의 직접 공격만 무효화하고, 지속 피해에는 적용되지 않는다', () => {
    const b = fresh();
    b.skills.passives.evasion = 5;
    (b as any).stats = () => ({ ...Battle.prototype.stats.call(b), evasion: 1 }); // 회피 100%로 고정해 범위만 검사
    expect(b.damagePlayer(10, 'direct')).toBe(false);
    expect(b.log.some((l) => l.type === 'evade')).toBe(true);
    expect(b.damagePlayer(10, 'dot')).toBe(true);
  });

  test('회피·치명타 확률에는 상한이 있다', () => {
    const b = fresh();
    b.skills.passives = { evasion: 50, critChance: 50 };
    const st = b.stats();
    expect(st.evasion).toBe(TUNING.passives.caps.evasion);
    expect(st.critChance).toBe(TUNING.passives.caps.critChance);
  });

  test('수집 범위 패시브는 흡인 반경을 넓힌다', () => {
    const b = fresh();
    const r0 = b.stats().pickupRadius;
    b.skills.passives.pickupRadius = 2;
    expect(b.stats().pickupRadius).toBeGreaterThan(r0);
  });
});

describe('드롭 수집과 정산', () => {
  test('재화·재료는 드롭으로 떨어지고 호냥이에게 닿아야 판 획득물이 된다', () => {
    const b = fresh();
    b.mode = 'wave';
    const e = (b as any).spawnEnemy('dustSlime', 0, true, b.player.x + 50);
    e.def = { ...e.def, loot: [{ id: 'softJelly', chance: 1, min: 2, max: 2 }] };
    (b as any).hitEnemy(e, 9999, 0);
    const drop = b.pickups.find((p) => p.kind === 'loot');
    expect(drop?.lootId).toBe('softJelly');
    expect(b.loot.softJelly ?? 0).toBe(0); // 즉시 지급 아님
    for (let i = 0; i < 120 && !b.loot.softJelly; i++) b.update(DT, NO_INPUT);
    expect(b.loot.softJelly).toBe(2);
  });

  test('수집 반경 밖에서 뒤에 남겨진 드롭은 놓친 것으로 기록되고 지급되지 않는다', () => {
    const b = fresh();
    const pk = (b as any).dropPickup('loot', b.player.x - 1000, 3);
    pk.lootId = 'oldYarn';
    b.update(DT, NO_INPUT);
    expect(b.pickups.includes(pk)).toBe(false);
    expect(b.loot.oldYarn ?? 0).toBe(0);
    expect(b.log.some((l) => l.type === 'missedPickup' && l.detail === 'oldYarn')).toBe(true);
  });

  test('같은 판 결과를 두 번 정산해도 한 번만 반영된다', () => {
    const save = newSave();
    const b = fresh();
    b.loot = { nyangJelly: 5, softJelly: 2 };
    const r = b.result();
    settleRun(save, r);
    settleRun(save, r);
    expect(save.currencies.nyangJelly).toBe(5);
    expect(save.materials.softJelly).toBe(2);
  });
});
