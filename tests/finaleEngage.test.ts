import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT, type Enemy } from '../src/sim/battle';
import { buildLoadout, newSave } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { CHAPTER_1, MAIN_CHAPTER_COUNT, proposedKillTargets, requiredKillCount } from '../src/data/chapters';
import { botChoose, botInput } from './bot';
import { measureRun } from './metrics';

/**
 * 10차: 엘리트/보스 등장 뒤 호냥이가 공격이 닿지 않는 자리에서 서 있던 문제.
 * 원인: 일반 구간이 끝나면 그 자리에 정차 지점(rightLimit)을 고정했고, 엘리트/보스는 380 앞에서 등장해
 * 스스로 걸어올 때까지(보스 속도 30, 패턴 중엔 멈춤) 호냥이가 칠 수 없었다.
 * 수정: 고정을 없애고, 기본 공격이 실제로 닿을 때까지 캠프와 함께 다가가 닿는 거리에서 함께 멈춘다.
 */

const DT = 1 / 60;
const front = (b: Battle) => b.player.x + TUNING.player.width / 2;
const gapTo = (b: Battle, e: Enemy) => e.x - e.def.width / 2 - front(b);

/** 웨이브·지원 없이 엘리트/보스 구간만 재현(웨이브 1 엘리트 구간) */
function finaleOnly(seed = 3) {
  const b = new Battle({ runId: 1, seed, loadout: buildLoadout(newSave()) });
  (b as any).updateWaves = () => undefined;
  (b as any).updateSupports = () => undefined;
  b.mode = 'wave';
  b.waves[0].started = true;
  b.waves[0].phase = 'finale';
  b.waves[0].finaleSpawned = true;
  b.rightLimit = Infinity;
  for (let t = 0; t < 0.5; t += DT) b.update(DT, NO_INPUT);
  return b;
}
function addFinale(b: Battle, kind: Enemy['def']['kind'], dx: number): Enemy {
  const e = (b as any).spawnEnemy(kind, 0, true, b.player.x + dx) as Enemy;
  e.role = 'finale';
  return e;
}
const hold = (e: Enemy) => { e.hp = 1e6; e.cc = 1e6; e.ccKind = 'stun'; e.cdA = 1e6; e.cdB = 1e6; };

describe('엘리트/보스: 함께 접근 → 유효 거리에서 함께 정차 → 첫 유효 공격', () => {
  for (const kind of ['rollingRat', 'kingDustSlime', 'stompSole'] as const) {
    test(`${kind}: 멀리 서 있어도 캠프와 함께 다가가 기본 공격이 닿는 거리에서 멈추고 바로 때린다`, () => {
      const b = finaleOnly();
      const e = addFinale(b, kind, 600);
      hold(e);
      const gap0 = b.player.x - b.camp.x;
      let stopT = -1;
      for (let t = 0; t < 8 && stopT < 0; t += DT) {
        const x = b.player.x;
        b.update(DT, NO_INPUT);
        expect(b.player.x - b.camp.x).toBeCloseTo(gap0); // 함께 이동
        if (b.player.x === x) stopT = t;
      }
      expect(stopT).toBeGreaterThan(0);
      const g = gapTo(b, e);
      expect(g).toBeLessThanOrEqual(TUNING.basicAttack.range + 1e-6); // 닿는 거리
      expect(g).toBeGreaterThan(TUNING.basicAttack.range - TUNING.player.moveSpeed * DT - 1e-6); // 필요 이상 붙지 않음
      const hp = e.hp;
      const x = b.player.x;
      for (let t = 0; t < 0.6; t += DT) b.update(DT, NO_INPUT);
      expect(e.hp).toBeLessThan(hp);
      expect(b.player.x).toBe(x);
    });
  }

  test('적이 밀려나 사거리 밖으로 가면 다시 다가가 때린다(재접근)', () => {
    const b = finaleOnly();
    const e = addFinale(b, 'rollingRat', 300);
    hold(e);
    for (let t = 0; t < 3; t += DT) b.update(DT, NO_INPUT);
    expect(b.engaged).toBe(true);
    e.x += 250; // 기술 밀쳐내기·구르기 반동처럼 멀어짐
    const x = b.player.x;
    const cx = b.camp.x;
    for (let t = 0; t < 0.3; t += DT) b.update(DT, NO_INPUT);
    expect(b.player.x).toBeGreaterThan(x);
    expect(b.camp.x).toBeGreaterThan(cx);
    for (let t = 0; t < 3; t += DT) b.update(DT, NO_INPUT);
    expect(gapTo(b, e)).toBeLessThanOrEqual(TUNING.basicAttack.range + 1e-6);
    const hp = e.hp;
    for (let t = 0; t < 0.6; t += DT) b.update(DT, NO_INPUT);
    expect(e.hp).toBeLessThan(hp);
  });

  test('호냥이가 밀려도 캠프 제자리 → 호위 위치 복귀 → 그 뒤 함께 다시 다가간다', () => {
    const b = finaleOnly();
    const e = addFinale(b, 'stompSole', 300);
    hold(e);
    for (let t = 0; t < 3; t += DT) b.update(DT, NO_INPUT);
    const stopX = b.player.x;
    const cx = b.camp.x;
    b.knockbackHero(80);
    expect(b.player.x).toBeLessThan(stopX);
    while (b.player.x < b.camp.x + TUNING.camp.followGap - 0.5) { b.update(DT, NO_INPUT); expect(b.camp.x).toBe(cx); }
    for (let t = 0; t < 2; t += DT) b.update(DT, NO_INPUT);
    expect(b.player.x).toBeCloseTo(stopX, 0);
    expect(gapTo(b, e)).toBeLessThanOrEqual(TUNING.basicAttack.range + 1e-6);
  });

  test('공중 엘리트/보스(시험): 높이 떠 있어도 밑으로 지나치지 않고 가로로 닿는 거리에서 멈춰 점프 펀치로 친다', () => {
    const b = finaleOnly();
    const e = addFinale(b, 'dustBat', 400);
    hold(e);
    e.y = 125;
    for (let t = 0; t < 4; t += DT) b.update(DT, NO_INPUT);
    expect(b.engaged).toBe(true);
    expect(b.player.x).toBeLessThan(e.x);
    expect(gapTo(b, e)).toBeLessThanOrEqual(TUNING.basicAttack.range + 1e-6);
    const hp = e.hp;
    for (let t = 0; t < 1.5; t += DT) b.update(DT, { ...NO_INPUT, jump: b.grounded });
    expect(e.hp).toBeLessThan(hp);
    expect(e.passed).toBe(false);
  });

  test('일반 구간의 높이 뜬 잡몹은 기존대로 전진을 멈추게 하지 않는다', () => {
    const b = finaleOnly();
    b.waves[0].phase = 'normal';
    const e = (b as any).spawnEnemy('dustBat', 0, true, b.player.x + 60) as Enemy;
    hold(e);
    e.y = 125;
    b.update(DT, NO_INPUT);
    expect(b.engaged).toBe(false);
  });

  test('실제 판(봇 10판): 엘리트/보스 구간에서 칠 적 없이 서 있는 시간 0, 등장 뒤 첫 유효 공격 3초 안', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const m = measureRun(seed, newSave(), 1500);
      for (const w of m.waves) {
        if (w.firstHit < 0) continue; // 그 웨이브 전에 끝난 판
        expect(w.idle).toBeLessThanOrEqual(0.2);
        expect(w.firstHit).toBeLessThan(3);
      }
    }
  });
});

describe('일반 구간 처치 목표(Ch 1 확정 50/80/100)', () => {
  test('Ch 1 목표와 지정 처치 합계', () => {
    expect(CHAPTER_1.waves.map((w) => w.normal.killTarget)).toEqual([50, 80, 100]);
    expect(requiredKillCount(CHAPTER_1)).toBe(233); // 230 + 엘리트 2 + 보스 1
    expect(CHAPTER_1.waves.map((w) => w.finale)).toEqual(['rollingRat', 'kingDustSlime', 'stompSole']);
  });

  test('목표 달성 전까지 계속 생성, 달성 순간 남은 잡몹은 보상 없이 정리되고 엘리트가 나온다', () => {
    const b = new Battle({ runId: 1, seed: 2, loadout: buildLoadout(newSave()) });
    while (!(b.waves[0].phase === 'finale')) {
      if (b.paused) { botChoose(b); continue; }
      b.update(DT, botInput(b));
      expect(b.enemies.filter((e) => e.wave === 0 && e.role === 'normal').length).toBeLessThanOrEqual(CHAPTER_1.waves[0].normal.maxAlive);
      if (b.finished) throw new Error('엘리트 전에 끝남');
    }
    expect(b.waves[0].normalKills).toBe(50);
    expect(b.enemies.some((e) => e.role === 'normal' && e.wave === 0)).toBe(false);
    while (!b.waves[0].finaleSpawned) { if (b.paused) botChoose(b); else b.update(DT, NO_INPUT); }
    expect(b.enemies.find((e) => e.role === 'finale')?.def.kind).toBe('rollingRat');
    expect(b.waves[0].normalKills).toBe(50); // 정리된 잡몹은 처치로 세지 않음
    expect(b.killsRequired).toBe(50);
  });

  test('챕터별 증가 제안표(TEMP): Ch 1은 확정값, 뒤 챕터일수록 증가, 미구현 챕터는 구현으로 표시하지 않는다', () => {
    expect(proposedKillTargets(1)).toEqual({ targets: [50, 80, 100], implemented: true });
    let prev = 230;
    for (let ch = 2; ch <= MAIN_CHAPTER_COUNT; ch++) {
      const p = proposedKillTargets(ch);
      const sum = p.targets.reduce((a, c) => a + c, 0);
      expect(sum).toBeGreaterThanOrEqual(prev);
      expect(p.implemented).toBe(false);
      prev = sum;
    }
  });
});

describe('선택창·일시정지 중 전투 타이머 정지', () => {
  test('레벨업 선택 대기 중에는 전투 시간·쿨타임·적·웨이브 생성 타이머가 흐르지 않는다', () => {
    const b = new Battle({ runId: 1, seed: 2, loadout: buildLoadout(newSave()) });
    while (!b.paused) { b.update(DT, botInput(b)); if (b.finished) throw new Error('선택창 전에 끝남'); }
    const snap = () => JSON.stringify({
      t: b.t, x: b.player.x, basic: b.player.basicTimer, energy: b.player.energy, sup: (b as any).supportTimers,
      spawn: b.waves.map((w) => w.spawnTimer), en: b.enemies.map((e) => [e.x, e.hp, e.cdA, e.cdB]), hz: b.hazards.map((h) => [h.x, h.progress]), status: b.heroStatus.effects.map((e) => e.remaining),
    });
    const before = snap();
    for (let i = 0; i < 300; i++) b.update(DT, { jump: true, ult: 0 });
    expect(snap()).toBe(before);
  });

  test('엘리트/보스 등장 연출 중에도 전투 시간이 흐르지 않는다', () => {
    const b = new Battle({ runId: 1, seed: 2, loadout: buildLoadout(newSave()) });
    while (!(b.introTimer > 0)) { if (b.paused) botChoose(b); else b.update(DT, botInput(b)); }
    const t = b.t;
    const x = b.player.x;
    b.update(DT, NO_INPUT);
    expect(b.t).toBe(t);
    expect(b.player.x).toBe(x);
  });
});
