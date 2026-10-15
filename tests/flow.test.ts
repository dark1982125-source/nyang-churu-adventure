import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { campOffers, heroOffers, type RunSkills } from '../src/sim/choices';
import { GLOVE } from '../src/data/skills';
import { MATERIAL_NAMES } from '../src/data/items';
import { WEAPON_DEFS } from '../src/data/weapons';
import { buildLoadout, loadSave, memoryStorage, newSave, writeSave } from '../src/meta/save';
import { beginRun, recordRunLoot, recoverInterruptedRun, settleRun } from '../src/meta/settlement';
import { TUNING } from '../src/config/tuning';
import { Rng } from '../src/sim/rng';
import { botChoose } from './bot';

const DT = 1 / 60;
const GO = { jump: false, ult: null };
const fresh = (seed = 3, mutate?: (s: ReturnType<typeof newSave>) => void) => {
  const save = newSave();
  mutate?.(save);
  return new Battle({ runId: 1, seed, loadout: buildLoadout(save) });
};
const step = (b: Battle, secs: number, input = NO_INPUT) => {
  for (let t = 0; t < secs; t += DT) { if (b.paused) botChoose(b); b.update(DT, input); }
};
const empty = (): RunSkills => ({ basicLevel: 1, exclusives: [], passives: {}, camp: {} });

describe('이동: 자동 전진, 캠프와 함께 전진·정차', () => {
  test('입력 없이 호냥이와 캠프가 함께 전진하며 간격을 유지한다', () => {
    const b = fresh();
    const gap0 = b.player.x - b.camp.x;
    step(b, 1, GO);
    expect(b.player.x - b.camp.x).toBeCloseTo(gap0);
    expect(b.camp.moving).toBe(true);
  });

  test('점프 중에도 호냥이가 적을 뛰어넘어 적을 뒤에 남기지 않는다', () => {
    const b = fresh();
    b.mode = 'travel';
    const e = (b as any).spawnEnemy('dustSlime', 0, true, b.player.x + 60);
    e.hp = 9999;
    for (let i = 0; i < 90; i++) { b.player.y = 150; b.player.vy = 0; b.update(DT, GO); }
    expect(b.player.x).toBeLessThan(e.x);
    expect(e.passed).toBe(false);
  });
});

describe('웨이브: 일반 구간(시간제, 11차) → 잔여 정리 → 엘리트/보스 (자세한 시간 판정은 timedWaves.test)', () => {
  function inWave() {
    const b = fresh();
    while (b.mode !== 'wave') b.update(DT, GO);
    return b;
  }

  test('엘리트 본체와 분열체를 전부 처치해야 다음 웨이브', () => {
    const b = fresh();
    b.mode = 'wave';
    b.waveIndex = 1;
    b.waves[1].phase = 'finale';
    b.waves[1].finaleSpawned = true;
    const king = (b as any).spawnEnemy('kingDustSlime', 1, true, b.player.x + 80);
    king.role = 'finale';
    (b as any).hitEnemy(king, 99999, 0);
    const kids = b.enemies.filter((e) => e.role === 'minion');
    expect(kids).toHaveLength(3);
    expect(b.childrenAlive).toBe(3);
    for (const k of kids.slice(0, 2)) (b as any).hitEnemy(k, 99999, 0);
    b.update(DT, NO_INPUT);
    expect(b.waveIndex).toBe(1);
    (b as any).hitEnemy(kids[2], 99999, 0);
    b.update(DT, NO_INPUT);
    expect(b.waveIndex).toBe(2);
  });

  test('일반 구간 시간·처치 수와 부하 잔여 수를 따로 센다(처치 수는 진행 조건 아님)', () => {
    const b = inWave();
    expect(b.normalClock()).toMatchObject({ kills: 0, duration: 180 });
    expect(b.childrenAlive).toBe(0);
  });
});

describe('패배·중도 종료', () => {
  test('캠프 멘탈 0이면 방울이 있어도 즉시 패배', () => {
    const b = fresh();
    b.hasBell = true;
    b.damageCamp(9999);
    expect(b.mode).toBe('defeat');
    expect(b.defeatCause).toBe('camp');
    expect(b.log.some((l) => l.type === 'revive')).toBe(false);
  });

  test('같은 순간 호냥이 HP 0·캠프 0이면 캠프 우선, 방울 미발동', () => {
    const b = fresh();
    b.hasBell = true;
    b.player.hp = 1;
    b.damagePlayer(50);
    b.damageCamp(9999);
    b.update(DT, NO_INPUT);
    expect(b.defeatCause).toBe('camp');
    expect(b.revivesUsed).toBe(0);
  });

  test('나가기: 주운 재화·재료만 보존, 구출·클리어 보상 없음, 다음 판은 처음부터', () => {
    const save = newSave();
    const runId = beginRun(save, 1);
    const b = new Battle({ runId, seed: 1, loadout: buildLoadout(save) });
    b.loot = { nyangJelly: 7, softJelly: 3 };
    b.skills.passives.attack = 3;
    b.hasBell = true;
    b.quit();
    expect(b.mode).toBe('defeat');
    const r = b.result();
    expect(r.defeatCause).toBe('quit');
    expect(r.rescued).toBeNull();
    const sum = settleRun(save, r);
    expect(sum.applied).toBe(true);
    expect(save.currencies.nyangJelly).toBe(7);
    expect(save.materials.softJelly).toBe(3);
    expect(save.rescued).toEqual([]);
    expect(save.clearedChapters).toEqual([]);
    expect(save.stats.quits).toBe(1);
    expect(save.activeRun).toBeNull();
    const next = new Battle({ runId: beginRun(save, 1), seed: 1, loadout: buildLoadout(save) });
    expect(next.waveIndex).toBe(0);
    expect(next.skills.passives).toEqual({});
    expect(next.hasBell).toBe(false);
  });

  test('앱이 갑자기 꺼져도 저널로 주운 것만 한 번 정산된다', () => {
    const storage = memoryStorage();
    const save = loadSave(storage);
    const runId = beginRun(save, 1);
    writeSave(storage, save);
    recordRunLoot(save, runId, { nyangJelly: 4, oldYarn: 2 });
    writeSave(storage, save);
    // 여기서 앱 종료(정산 없음) → 재실행
    const reopened = loadSave(storage);
    expect(reopened.activeRun?.runId).toBe(runId);
    const sum = recoverInterruptedRun(reopened);
    expect(sum?.applied).toBe(true);
    expect(reopened.currencies.nyangJelly).toBe(4);
    expect(reopened.materials.oldYarn).toBe(2);
    expect(reopened.activeRun).toBeNull();
    writeSave(storage, reopened);
    // 다시 켜도 두 번 지급되지 않는다
    const again = loadSave(storage);
    expect(recoverInterruptedRun(again)).toBeNull();
    expect(again.currencies.nyangJelly).toBe(4);
  });

  test('정상 정산 직후 꺼져도(저널이 남았더라도) 중복 지급 없음', () => {
    const save = newSave();
    const runId = beginRun(save, 1);
    recordRunLoot(save, runId, { nyangJelly: 5 });
    const b = new Battle({ runId, seed: 1, loadout: buildLoadout(save) });
    b.loot = { nyangJelly: 5 };
    b.quit();
    settleRun(save, b.result());
    // 저장 쓰기 직전 저널을 강제로 되살린 최악의 경우
    save.activeRun = { runId, chapterId: 1, loot: { nyangJelly: 5 } };
    const again = recoverInterruptedRun(save);
    expect(again?.duplicate).toBe(true);
    expect(save.currencies.nyangJelly).toBe(5);
    expect(save.activeRun).toBeNull();
  });

  test('판 저널은 출격 즉시 생기고 클리어 정산에서 지워진다', () => {
    const save = newSave();
    const runId = beginRun(save, 1);
    expect(save.activeRun).toEqual({ runId, chapterId: 1, loot: {} });
    const b = new Battle({ runId, seed: 1, loadout: buildLoadout(save) });
    b.mode = 'victory';
    settleRun(save, b.result());
    expect(save.activeRun).toBeNull();
  });
});

describe('성장 후보·대체 보상', () => {
  test('기본 공격은 Lv.5에서 후보 제외', () => {
    const s = empty();
    s.basicLevel = 5;
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) expect(heroOffers(s, GLOVE, 0, rng).some((o) => o.kind === 'basic')).toBe(false);
    s.basicLevel = 4;
    let saw = false;
    for (let i = 0; i < 200; i++) saw ||= heroOffers(s, GLOVE, 0, rng).some((o) => o.kind === 'basic' && o.nextLevel === 5);
    expect(saw).toBe(true);
  });

  test('성장 후보가 충분하면 대체 보상은 나오지 않는다', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) expect(heroOffers(empty(), GLOVE, 0, rng).some((o) => o.kind === 'filler')).toBe(false);
  });

  test('캠프: 합류한 지원 동료 전부 후보(슬롯 제한 없음), Lv.5에서 제외, 빈칸은 골골기어·캠프 멘탈만', () => {
    const s = empty();
    const rng = new Rng(3);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) for (const o of campOffers(s, ['barrier', 'laser', 'capsule'], rng)) if (o.kind === 'camp') ids.add(o.id);
    expect([...ids].sort()).toEqual(['barrier', 'capsule', 'laser']);
    s.camp = { barrier: 5, laser: 5, capsule: 4 };
    for (let i = 0; i < 100; i++) {
      const offers = campOffers(s, ['barrier', 'laser', 'capsule'], rng);
      expect(offers.filter((o) => o.kind === 'camp').map((o) => o.kind === 'camp' && o.id)).toEqual(['capsule']);
      for (const o of offers) if (o.kind === 'filler') expect(['gear', 'mental']).toContain(o.id);
    }
  });

  test('구출 전 동료와 전투 지원이 없는 동료는 캠프 후보에 없다', () => {
    const b = fresh(3, (s) => { s.rescued = ['kosyot', 'kangkang']; });
    expect((b as any).availableCampSkills().sort()).toEqual(['barrier', 'capsule', 'laser', 'prescription']);
    expect((fresh() as any).availableCampSkills().sort()).toEqual(['barrier', 'laser']);
  });

  test('대체 보상은 슬롯 없이 즉시 적용되고 상한을 넘지 않는다', () => {
    const b = fresh();
    b.player.hp = b.player.maxHp - 5;
    b.player.energy = 10;
    (b as any).applyOffer({ kind: 'filler', id: 'heal' });
    (b as any).applyOffer({ kind: 'filler', id: 'energy' });
    (b as any).applyOffer({ kind: 'filler', id: 'jelly' });
    (b as any).applyOffer({ kind: 'filler', id: 'gear' });
    b.camp.mental = b.camp.maxMental - 3;
    (b as any).applyOffer({ kind: 'filler', id: 'mental' });
    expect(b.player.hp).toBe(b.player.maxHp);
    expect(b.player.energy).toBe(10 + TUNING.fillers.heroEnergy);
    expect(b.loot.nyangJelly).toBe(TUNING.fillers.heroJelly);
    expect(b.loot.golgolGear).toBe(TUNING.fillers.campGear);
    expect(b.camp.mental).toBe(b.camp.maxMental);
    expect(b.skills.passives).toEqual({});
    expect(b.skills.camp).toEqual({});
  });
});

describe('선택창: 호냥이 → 캠프 순서, 선택마다 후보 갱신, 전투 시간 정지', () => {
  test('동시 레벨업은 호냥이부터, 초과 경험치 유지', () => {
    const b = fresh();
    (b as any).collect({ kind: 'gear', value: 10, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    (b as any).collect({ kind: 'catnip', value: 100, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    // 캠프가 먼저 들어왔어도 대기 중인 선택은 호냥이가 앞
    const order = b.pending.map((p) => p.track);
    expect(order[0]).toBe('camp'); // 이미 열린 첫 창은 유지
    expect(order.slice(1).indexOf('camp')).toBe(-1);
    const levels = b.heroLevel;
    expect(levels).toBeGreaterThan(2);
    expect(b.heroXp).toBeLessThan(b.heroXpNeeded);
    expect(b.pending.filter((p) => p.track === 'hero')).toHaveLength(levels - 1);
  });

  test('대기 중에는 호냥이 선택이 모두 끝난 뒤 캠프 선택', () => {
    const b = fresh();
    (b as any).collect({ kind: 'catnip', value: 30, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    (b as any).collect({ kind: 'gear', value: 30, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    const seq: string[] = [];
    while (b.paused) { seq.push(b.pending[0].track); b.choose(0); }
    const firstCamp = seq.indexOf('camp');
    expect(seq.slice(firstCamp).every((t) => t === 'camp')).toBe(true);
    expect(seq[0]).toBe('hero');
  });

  test('다음 선택 후보는 앞 선택을 반영해 만든다', () => {
    const b = fresh();
    b.skills.basicLevel = 4;
    (b as any).collect({ kind: 'catnip', value: 30, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    expect(b.pending.length).toBeGreaterThan(1);
    expect(b.pending[1].offers).toEqual([]); // 아직 만들지 않음
    const basicIdx = b.pending[0].offers.findIndex((o) => o.kind === 'basic');
    if (basicIdx >= 0) {
      b.choose(basicIdx);
      expect(b.skills.basicLevel).toBe(5);
      expect(b.pending[0].offers.some((o) => o.kind === 'basic')).toBe(false);
    }
  });

  test('선택 중에는 적·쿨타임·회복·게이지가 모두 멈춘다', () => {
    const b = fresh(3, (s) => { s.nodes.ultSlot = 1; });
    b.mode = 'wave';
    const e = (b as any).spawnEnemy('meteorRat', 0, true, b.player.x + 300);
    b.skills.passives.hpRegen = 3;
    b.player.hp = 50;
    b.player.energy = 10;
    b.skillCd.straight = 2;
    (b as any).collect({ kind: 'catnip', value: 30, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    const snap = JSON.stringify([e.x, b.player.hp, b.player.energy, b.skillCd, b.ultGauge, b.t]);
    for (let i = 0; i < 120; i++) b.update(DT, GO);
    expect(JSON.stringify([e.x, b.player.hp, b.player.energy, b.skillCd, b.ultGauge, b.t])).toBe(snap);
  });
});

describe('보급품', () => {
  test('캡슐은 HP가 가득해도 닿으면 소모되고 상한을 넘지 않으며 보관되지 않는다', () => {
    const b = fresh();
    const pk = (b as any).dropPickup('capsule', b.player.x, 30);
    pk.age = 1;
    b.update(DT, NO_INPUT);
    expect(b.pickups.includes(pk)).toBe(false);
    expect(b.player.hp).toBe(b.player.maxHp);
  });
});

describe('재료 이름·저장 ID', () => {
  test('검 재료는 정식명', () => {
    const names = WEAPON_DEFS.fishboneSword.craft.map((m) => MATERIAL_NAMES[m.id]);
    expect(names).toEqual(['생선가시조각', '작은 돌조각', '낡은 털실뭉치']);
    expect(MATERIAL_NAMES[WEAPON_DEFS.fishboneSword.enhanceMaterial!]).toBe('매끈한 돌조각');
  });

  test('재료 이름은 서로 겹치지 않는다', () => {
    const names = Object.values(MATERIAL_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  test('예전 저장 ID(fishSpine)는 불러올 때 fishboneShard로 옮겨진다', () => {
    const storage = memoryStorage();
    storage.store(JSON.stringify({ materials: { fishSpine: 4, fishboneShard: 1 } }));
    const s = loadSave(storage);
    expect(s.materials.fishboneShard).toBe(5);
    expect((s.materials as Record<string, number>).fishSpine).toBeUndefined();
  });
});
