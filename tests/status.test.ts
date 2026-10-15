import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT, type Enemy, type InputState } from '../src/sim/battle';
import { buildLoadout, buyNode, canBuyNode, newSave, type SaveData } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { MEDICINES } from '../src/data/medicines';
import { CHAPTER_1 } from '../src/data/chapters';
import { prescriptionOrder, StatusSet } from '../src/sim/status';

const fresh = (seed = 3, edit?: (s: SaveData) => void) => {
  const save = newSave();
  edit?.(save);
  return new Battle({ runId: 1, seed, loadout: buildLoadout(save) });
};
const step = (b: Battle, sec: number, input: InputState = NO_INPUT) => {
  for (let t = 0; t < sec; t += 1 / 60) { if (b.paused) b.choose(0); b.update(1 / 60, input); }
};
const noEvade = (b: Battle) => { (b as any).rng.chance = () => false; };

describe('호냥이 방어력 — 직접 피해 × 100/(100+방어력)', () => {
  test.each([[0, 100], [25, 80], [50, 100 * 100 / 150], [100, 50]])('방어력 %i에서 원래 피해 100은 %f', (def, expected) => {
    const b = fresh();
    noEvade(b);
    (b.loadout as any).defense = def;
    b.player.hp = b.player.maxHp = 1000;
    b.damagePlayer(100, 'direct');
    expect(1000 - b.player.hp).toBeCloseTo(expected, 5);
  });

  test('최종 방어력 = 영구(노드) + 장비 + 판 임시(패시브·보너스)', () => {
    const b = fresh(3, (s) => { s.nodes.def = 2; });
    expect(b.loadout.defense).toBe(2 * TUNING.defense.perNodeLevel);
    b.skills.passives.defense = 3;
    b.runDefenseBonus = 4;
    expect(b.totalDefense()).toBe(2 * TUNING.defense.perNodeLevel + 3 * TUNING.passives.defense + 4);
    expect(b.stats().damageTaken).toBeCloseTo(100 / (100 + b.totalDefense()));
  });

  test('독·화상·출혈 DOT와 지형 지속 피해에는 방어력·회피·피격 무적이 적용되지 않는다', () => {
    const b = fresh();
    (b.loadout as any).defense = 100;
    b.skills.passives.evasion = 5;
    (b as any).rng.chance = () => true; // 회피 100%여도
    b.player.invuln = 5;
    const hp0 = b.player.hp;
    b.damagePlayer(10, 'dot');
    b.damagePlayer(5, 'terrain');
    expect(hp0 - b.player.hp).toBeCloseTo(15);
  });

  test('회피 성공 시 피해와 그 공격의 상태이상 모두 무효', () => {
    const b = fresh();
    b.skills.passives.evasion = 5;
    (b as any).rng.chance = () => true;
    const hp0 = b.player.hp;
    b.damagePlayer(20, 'direct', { tag: 'poison', source: '시험', intensity: 3, duration: 4 });
    expect(b.player.hp).toBe(hp0);
    expect(b.heroStatus.has('poison')).toBe(false);
  });

  test('명중하면 동반 상태이상이 걸린다', () => {
    const b = fresh();
    noEvade(b);
    b.damagePlayer(5, 'direct', { tag: 'burn', source: '시험', intensity: 4, duration: 3 });
    expect(b.heroStatus.get('burn')).toMatchObject({ tag: 'burn', source: '시험', intensity: 4, origin: 'enemySkill' });
  });
});

describe('상태이상 중첩·해제', () => {
  test('같은 DOT는 피해 중첩 없이 강한 효과 유지, 지속 시간 갱신', () => {
    const s = new StatusSet();
    s.apply({ tag: 'poison', source: 'A', intensity: 3, duration: 4 });
    s.tick(2);
    expect(s.apply({ tag: 'poison', source: 'B', intensity: 5, duration: 3 })).toBe('stronger');
    expect(s.effects).toHaveLength(1);
    expect(s.get('poison')).toMatchObject({ intensity: 5, source: 'B', remaining: 3 });
    // 약한 효과 재적용: 강도는 그대로, 시간만 갱신(연장 방식은 미정·TEMP)
    expect(s.apply({ tag: 'poison', source: 'C', intensity: 1, duration: 6 })).toBe('refreshed');
    expect(s.get('poison')).toMatchObject({ intensity: 5, source: 'B', remaining: 6 });
    // 1초 DOT = 강한 효과 하나의 초당 피해
    expect(s.tick(1)).toBeCloseTo(5);
  });

  test('서로 다른 종류는 동시에 걸리고, 각 DOT 피해가 따로 들어간다', () => {
    const s = new StatusSet();
    s.apply({ tag: 'poison', source: 'A', intensity: 3, duration: 4 });
    s.apply({ tag: 'burn', source: 'B', intensity: 4, duration: 4 });
    s.apply({ tag: 'bleed', source: 'C', intensity: 2, duration: 4 });
    s.apply({ tag: 'slow', source: 'D', intensity: 0.4, duration: 4 });
    expect(s.effects.map((e) => e.tag).sort()).toEqual(['bleed', 'burn', 'poison', 'slow']);
    expect(s.tick(1)).toBeCloseTo(9);
  });

  test('같은 감속은 강도 중첩 없이 시간 갱신', () => {
    const s = new StatusSet();
    s.apply({ tag: 'slow', source: 'A', intensity: 0.4, duration: 2 });
    s.apply({ tag: 'slow', source: 'A', intensity: 0.4, duration: 3 });
    expect(s.effects).toHaveLength(1);
    expect(s.moveMul).toBeCloseTo(0.6);
    expect(s.get('slow')!.remaining).toBe(3);
  });

  test('빙결은 최대 시간 제한이 있고, 해제 뒤 짧은 재빙결 면역', () => {
    const s = new StatusSet();
    s.apply({ tag: 'freeze', source: 'A', intensity: 1, duration: 2 });
    s.tick(1.5);
    // 끝나기 전에 다시 걸어도 처음부터 최대 시간을 넘지 않는다
    s.apply({ tag: 'freeze', source: 'A', intensity: 1, duration: 9 });
    expect(s.get('freeze')!.remaining).toBeCloseTo(TUNING.status.freezeMaxDuration - 1.5);
    s.tick(5);
    expect(s.frozen).toBe(false);
    expect(s.refreezeImmune).toBeGreaterThan(0);
    expect(s.apply({ tag: 'freeze', source: 'A', intensity: 1, duration: 1 })).toBe('immune');
    s.tick(TUNING.status.refreezeImmunity + 0.01);
    expect(s.apply({ tag: 'freeze', source: 'A', intensity: 1, duration: 1 })).toBe('applied');
    // 약으로 풀어도 면역
    s.cure(['freeze']);
    expect(s.apply({ tag: 'freeze', source: 'A', intensity: 1, duration: 1 })).toBe('immune');
  });

  test('빙결 중 호냥이는 전진·점프·공격 정지, 감속 중 이동 속도 감소', () => {
    const b = fresh();
    b.applyHeroStatus({ tag: 'freeze', source: '시험', intensity: 1, duration: 1 });
    const x0 = b.player.x;
    step(b, 0.5, { jump: true, ult: null });
    expect(b.player.x).toBe(x0);
    expect(b.player.y).toBe(0);
    step(b, 1, { jump: false, ult: null }); // 풀린 뒤에는 다시 전진
    expect(b.player.x).toBeGreaterThan(x0);

    const fast = fresh();
    const slow = fresh();
    slow.applyHeroStatus({ tag: 'slow', source: '시험', intensity: 0.5, duration: 5 });
    step(fast, 1, { jump: false, ult: null });
    step(slow, 1, { jump: false, ult: null });
    expect(slow.player.x - 160).toBeCloseTo((fast.player.x - 160) * 0.5, 0);
  });

  test('독 DOT가 실제로 HP를 깎는다(방어력 무관)', () => {
    const b = fresh();
    (b.loadout as any).defense = 100;
    const hp0 = b.player.hp;
    b.applyHeroStatus({ tag: 'poison', source: '시험', intensity: 4, duration: 2 });
    step(b, 3);
    expect(hp0 - b.player.hp).toBeCloseTo(8, 0);
    expect(b.heroStatus.has('poison')).toBe(false);
  });
});

describe('코숏 치료품 6종·증상별 처방', () => {
  const rescued = (edit?: (s: SaveData) => void) => fresh(3, (s) => { s.rescued.push('kosyot'); edit?.(s); });

  test('치료품 이름과 해제 대상(만능 개다래 정화약 폐기 → 독만)', () => {
    expect(MEDICINES.antidote).toMatchObject({ name: '개다래 정화약', cures: ['poison'] });
    expect(MEDICINES.bandage).toMatchObject({ name: '보송보송 붕대', cures: ['bleed'] });
    expect(MEDICINES.mintOintment).toMatchObject({ name: '시원 민트연고', cures: ['burn'] });
    expect(MEDICINES.hotPack).toMatchObject({ name: '캡사이신 핫팩', cures: ['freeze'] });
    expect(MEDICINES.nyangCas).toMatchObject({ name: '사뿐 냥카스', cures: ['slow'] });
    expect(MEDICINES.panacea.cures.sort()).toEqual(['bleed', 'burn', 'freeze', 'poison', 'slow']);
  });

  test('처방 순서: 빙결 → 감속 → 초당 피해가 가장 큰 DOT', () => {
    const s = new StatusSet();
    s.apply({ tag: 'poison', source: 'a', intensity: 2, duration: 5 });
    s.apply({ tag: 'bleed', source: 'b', intensity: 6, duration: 5 });
    s.apply({ tag: 'burn', source: 'c', intensity: 4, duration: 5 });
    expect(prescriptionOrder(s)).toEqual(['bleed', 'burn', 'poison']);
    s.apply({ tag: 'slow', source: 'd', intensity: 0.3, duration: 5 });
    s.apply({ tag: 'freeze', source: 'e', intensity: 1, duration: 1 });
    expect(prescriptionOrder(s)).toEqual(['freeze', 'slow', 'bleed', 'burn', 'poison']);
    // 지형 둔화는 처방 대상이 아니다
    const t = new StatusSet();
    t.apply({ tag: 'slow', source: '진흙', origin: 'terrain', intensity: 0.3, duration: 5 });
    expect(prescriptionOrder(t)).toEqual([]);
  });

  test('한 번에 한 개, 같은 약이 바닥·비행 중이면 다음 증상 약(TEMP 정책)', () => {
    const b = rescued();
    b.applyHeroStatus({ tag: 'poison', source: 'a', intensity: 3, duration: 20 });
    b.applyHeroStatus({ tag: 'burn', source: 'b', intensity: 5, duration: 20 });
    expect(b.choosePrescription()).toBe('mintOintment');
    (b as any).dropPickup('medicine', b.player.x + 900, 0).medId = 'mintOintment';
    expect(b.choosePrescription()).toBe('antidote');
    (TUNING.supports as any).prescriptionOnDuplicate = 'wait';
    try { expect(b.choosePrescription()).toBeNull(); } finally { (TUNING.supports as any).prescriptionOnDuplicate = 'nextSymptom'; }
  });

  test('증상이 없으면 처방하지 않는다. 처방 약은 호냥이 앞에 하나씩 떨어진다', () => {
    const b = rescued();
    step(b, 3);
    expect(b.pickups.some((p) => p.kind === 'medicine')).toBe(false);
    b.applyHeroStatus({ tag: 'bleed', source: 'a', intensity: 3, duration: 30 });
    step(b, 0.6);
    const meds = b.pickups.filter((p) => p.kind === 'medicine');
    expect(meds).toHaveLength(1);
    expect(meds[0].medId).toBe('bandage');
    expect(meds[0].x).toBeGreaterThan(b.player.x);
  });

  test('빙결로 못 움직여도 반경 안 약이 흡인되어 도착 즉시 사용된다', () => {
    const b = rescued();
    b.applyHeroStatus({ tag: 'freeze', source: 'a', intensity: 1, duration: 9 });
    (b as any).supportTimers.prescription = 0;
    step(b, 1.5); // 빙결 최대 시간(2.5초)보다 먼저 약으로 풀린다
    expect(b.heroStatus.frozen).toBe(false);
    expect(b.log.some((l) => l.type === 'cure' && l.detail === 'hotPack' && l.value === 1)).toBe(true);
  });

  test('필요 없어도 도착하면 소모(보관 없음), 해당 증상만 푼다', () => {
    const b = fresh();
    b.applyHeroStatus({ tag: 'poison', source: 'a', intensity: 3, duration: 20 });
    const pk = (b as any).dropPickup('medicine', b.player.x, 0);
    pk.medId = 'bandage';
    step(b, 0.5);
    expect(b.pickups).toHaveLength(0);
    expect(b.heroStatus.has('poison')).toBe(true);
    expect(b.log.some((l) => l.type === 'cure' && l.detail === 'bandage' && l.value === 0)).toBe(true);
  });

  test('만능 처방약: 골골기어 진화(코숏 구출 필요)로 해금, 다섯 종류 동시 해제, HP·지형 둔화 제외', () => {
    const s = newSave();
    s.currencies.golgolGear = 50;
    expect(canBuyNode(s, 'panacea')).toBe('locked');
    s.rescued.push('kosyot');
    expect(buyNode(s, 'panacea')).toBe('ok');
    const b = new Battle({ runId: 1, seed: 1, loadout: buildLoadout(s) });
    expect(b.loadout.panacea).toBe(true);
    for (const tag of ['poison', 'burn', 'bleed', 'slow'] as const) b.applyHeroStatus({ tag, source: 'x', intensity: tag === 'slow' ? 0.3 : 2, duration: 30 });
    b.heroStatus.apply({ tag: 'slow', source: '진흙', origin: 'terrain', intensity: 0.2, duration: 30 });
    // TEMP 병행 정책: 치료 가능한 증상 2개 이상이면 만능약
    expect(b.choosePrescription()).toBe('panacea');
    b.player.hp = 50;
    const pk = (b as any).dropPickup('medicine', b.player.x, 0);
    pk.medId = 'panacea';
    step(b, 0.3);
    expect(b.heroStatus.effects.map((e) => `${e.tag}:${e.origin}`)).toEqual(['slow:terrain']);
    expect(b.player.hp).toBeLessThanOrEqual(50);
  });

  test('만능약 없이 증상 1개면 개별 약(병행), replace 정책이면 만능약만', () => {
    const b = rescued((s) => { s.nodes.panacea = 1; });
    b.applyHeroStatus({ tag: 'poison', source: 'a', intensity: 3, duration: 20 });
    expect(b.choosePrescription()).toBe('antidote');
    (TUNING.supports.panacea as any).policy = 'replace';
    try { expect(b.choosePrescription()).toBe('panacea'); } finally { (TUNING.supports.panacea as any).policy = 'coexist'; }
  });
});

describe('적 등급별 제어 저항', () => {
  const spawn = (b: Battle, kind: Enemy['def']['kind']) => (b as any).spawnEnemy(kind, 0, true, b.player.x + 300) as Enemy;

  test('기절·빙결·수면: 일반 그대로, 엘리트 단축, 보스는 행동정지 대신 짧은 감속', () => {
    const b = fresh();
    const n = spawn(b, 'dustSlime');
    const el = spawn(b, 'rollingRat');
    const boss = spawn(b, 'stompSole');
    for (const kind of ['stun', 'freeze', 'sleep'] as const) {
      for (const e of [n, el, boss]) { e.cc = 0; e.slow = 0; b.applyEnemyCc(e, kind, 2); }
      expect(n.cc).toBe(2);
      expect(n.ccKind).toBe(kind);
      expect(el.cc).toBeCloseTo(2 * TUNING.enemyCc.eliteDurationMul);
      expect(boss.cc).toBe(0);
      expect(boss.slow).toBe(TUNING.enemyCc.bossSlowDuration);
      expect(boss.slowMul).toBe(TUNING.enemyCc.bossSlowMul);
    }
  });

  test('보스는 기절 기술에 맞아도 패턴이 끊기지 않는다(감속만)', () => {
    const b = fresh();
    b.mode = 'wave';
    const boss = spawn(b, 'stompSole');
    boss.x = b.player.x + 200;
    boss.cdB = 99;
    boss.cdA = 0;
    step(b, 0.05);
    expect(boss.state).toBe('stomp');
    (b as any).hitEnemy(boss, 1, 3);
    step(b, BOSSWAIT);
    expect(b.hazards.some((h) => h.kind === 'shockwave')).toBe(true);
  });

  test('수면은 직접 피격에 깨고, DOT로는 깨지 않는다', () => {
    const b = fresh();
    const e = spawn(b, 'meteorRat');
    e.hp = 999;
    b.applyEnemyCc(e, 'sleep', 5);
    b.applyEnemyDot(e, 'burn', 2, 3, '시험');
    step(b, 1);
    expect(e.ccKind).toBe('sleep');
    expect(e.hp).toBeLessThan(999);
    (b as any).hitEnemy(e, 1, 0);
    expect(e.cc).toBe(0);
    expect(e.ccKind).toBeNull();
  });

  test('밀쳐내기: 일반 그대로, 엘리트 감소, 보스 면역', () => {
    const b = fresh();
    const n = spawn(b, 'dustSlime');
    const el = spawn(b, 'kingDustSlime');
    const boss = spawn(b, 'stompSole');
    const x = [n.x, el.x, boss.x];
    for (const e of [n, el, boss]) b.knockback(e, 100);
    expect(n.x - x[0]).toBe(100);
    expect(el.x - x[1]).toBeCloseTo(100 * TUNING.enemyCc.eliteKnockbackMul);
    expect(boss.x).toBe(x[2]);
  });

  test('DOT는 보스에게도 들어가고, 같은 종류는 강한 쪽 유지', () => {
    const b = fresh();
    // 자동 전진·레이저가 닿지 않는 먼 곳(지속 피해만 재기 위해)
    const boss = (b as any).spawnEnemy('stompSole', 0, true, b.player.x + 1200) as Enemy;
    b.applyEnemyDot(boss, 'bleed', 3, 4, 'a');
    b.applyEnemyDot(boss, 'bleed', 1, 6, 'b');
    expect(boss.dots).toEqual([{ tag: 'bleed', dps: 3, remaining: 6, source: 'a' }]);
    const hp0 = boss.hp;
    step(b, 1);
    expect(hp0 - boss.hp).toBeCloseTo(3, 0);
  });
});
const BOSSWAIT = 1;

describe('클리어 자동 회수', () => {
  test('성공 시 필드·뒤에 남은 재화·재료를 판 획득물로 회수, 경험치는 선택창 없이 기록만', () => {
    const b = fresh();
    const loot = (b as any).dropPickup('loot', b.player.x + 2000, 3);
    loot.lootId = 'smallStone';
    (b as any).dropPickup('catnip', b.player.x + 2000, 1);
    const behind = (b as any).dropPickup('loot', b.player.x - 1000, 2);
    behind.lootId = 'oldYarn';
    step(b, 0.2);
    expect(b.behindDrops).toHaveLength(1);
    const lvl = b.heroLevel;
    (b as any).finish('victory');
    expect(b.loot.smallStone).toBe(3);
    expect(b.loot.oldYarn).toBe(2);
    expect(b.autoCollectedXp.hero).toBe(1);
    expect(b.heroLevel).toBe(lvl);
    expect(b.pending).toHaveLength(0);
    expect(b.pickups).toHaveLength(0);
  });

  test('실패·중도 종료는 주운 것만 보존(필드 드롭 미회수)', () => {
    const b = fresh();
    const loot = (b as any).dropPickup('loot', b.player.x + 2000, 3);
    loot.lootId = 'smallStone';
    b.quit();
    expect(b.loot.smallStone).toBeUndefined();
  });
});

describe('캠프 위협 시험 적 A/B (TEMP)', () => {
  const setup = (kind: 'pebbleRat' | 'dustBat') => {
    const b = fresh();
    b.mode = 'wave';
    b.waves[0].phase = 'finale';
    b.waves[0].finaleSpawned = true;
    const e = (b as any).spawnEnemy(kind, 0, true, b.player.x + 260) as Enemy;
    if (kind === 'dustBat') e.x = b.player.x + e.def.campShot!.standoff;
    e.cdA = 0;
    e.hp = 999;
    b.camp.shield = 0;
    (b as any).supportTimers.barrier = 999; // 배리어 없이 측정
    return { b, e };
  };

  test('A 투척: 조준 예고 후 캠프로 투사체, 방치하면 캠프 멘탈 피해', () => {
    const { b } = setup('pebbleRat');
    step(b, 0.1);
    expect(b.effects.some((f) => f.kind === 'aim')).toBe(true);
    (b as any).rockInPunchReach = () => undefined; // 펀치 없이 방치
    step(b, 3);
    expect(b.log.some((l) => l.type === 'shotHitCamp')).toBe(true);
    expect(b.camp.mental).toBeLessThan(b.camp.maxMental);
  });

  test('A 투척: 점프하면 몸으로 요격되어 캠프 피해 없음', () => {
    const { b } = setup('pebbleRat');
    let jumped = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      const near = b.hazards.some((h) => h.kind === 'campShot' && h.x - b.player.x < 90 && h.x > b.player.x - 10 && h.y > 60);
      b.update(1 / 60, { jump: near && !jumped, ult: null });
      if (near) jumped = true;
    }
    expect(b.log.some((l) => l.type === 'shotBroken')).toBe(true);
    expect(b.log.some((l) => l.type === 'shotHitCamp')).toBe(false);
    expect(b.camp.mental).toBe(b.camp.maxMental);
  });

  test('B 공중: 낙하 예고, 지면 전진을 막지 않고, 지상 펀치는 닿지 않는다', () => {
    const { b, e } = setup('dustBat');
    expect(e.y).toBe(e.def.flying!.altitude);
    step(b, 0.1);
    expect(b.effects.some((f) => f.kind === 'dropMark')).toBe(true);
    e.x = b.player.x + 40;
    const hp = e.hp;
    b.player.basicTimer = 0;
    (b as any).updateCombat(1 / 60, b.stats());
    expect(e.hp).toBe(hp); // 지상에선 머리 위 공중 적에 펀치가 안 닿음
    b.player.y = 90;
    b.player.basicTimer = 0;
    (b as any).updateCombat(1 / 60, b.stats());
    expect(e.hp).toBeLessThan(hp); // 점프하면 닿는다
  });

  test('설정에서 끄면 시험 적이 일반 구간에 나오지 않는다', () => {
    const b = fresh(5, (s) => { s.settings.campThreatTest = false; });
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) kinds.add((b as any).pickNormal(CHAPTER_1.waves[2].normal.pool));
    expect(kinds.has('pebbleRat') || kinds.has('dustBat')).toBe(false);
    const on = fresh(5);
    const k2 = new Set<string>();
    for (let i = 0; i < 300; i++) k2.add((on as any).pickNormal(CHAPTER_1.waves[2].normal.pool));
    expect(k2.has('pebbleRat') && k2.has('dustBat')).toBe(true);
  });

  test('[시험] 적 상태이상은 기본 꺼짐, 켜면 접촉 공격에 붙는다', () => {
    const off = fresh();
    expect((off as any).testStatus({ tag: 'bleed', intensity: 3, duration: 4 }, 'x')).toBeUndefined();
    const on = fresh(3, (s) => { s.settings.statusTest = true; });
    expect((on as any).testStatus({ tag: 'bleed', intensity: 3, duration: 4 }, 'x')).toMatchObject({ tag: 'bleed', source: 'x' });
  });
});
