import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT, normalizeKills, type Enemy } from '../src/sim/battle';
import { buildLoadout, newSave } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { ENEMIES } from '../src/data/enemies';
import { CHAPTER_1, MAIN_CHAPTER_COUNT, proposedChapterScaling, stageAt } from '../src/data/chapters';
import { botChoose, botInput } from './bot';

/**
 * 11차 확정 방향(횡스크롤 뱀서류): 일반 구간은 처치 목표가 아니라 활성 전투 시간으로 끝난다.
 * Ch 1 웨이브당 180초(총 540초)는 사용자 동의 첫 테스트 기준. 스폰표·경험치·체력 수치는 TEMP.
 */

const DT = 1 / 60;
const fresh = (seed = 3) => new Battle({ runId: 1, seed, loadout: buildLoadout(newSave()) });
function inWave(seed = 3) {
  const b = fresh(seed);
  while (b.mode !== 'wave') b.update(DT, NO_INPUT);
  return b;
}
/** 처치·피격 없이 시간만 흐르게(적·호냥이·캠프 무적) */
function stall(b: Battle, secs: number) {
  for (let t = 0; t < secs; t += DT) {
    for (const e of b.enemies) e.hp = 9999;
    b.player.hp = b.player.maxHp;
    b.camp.mental = b.camp.maxMental;
    if (b.paused) { botChoose(b); continue; }
    b.update(DT, NO_INPUT);
  }
}

describe('Ch 1 시간표(사용자 동의 첫 테스트 기준)', () => {
  test('웨이브당 일반 구간 활성 180초, 합 540초, 엘리트1 → 엘리트2 → 보스 순서', () => {
    expect(CHAPTER_1.waves.map((w) => w.normal.duration)).toEqual([180, 180, 180]);
    expect(CHAPTER_1.waves.reduce((s, w) => s + w.normal.duration, 0)).toBe(540);
    expect(CHAPTER_1.waves.map((w) => w.finale)).toEqual(['rollingRat', 'kingDustSlime', 'stompSole']);
    expect(CHAPTER_1.waves.map((w) => ENEMIES[w.finale].rank)).toEqual(['elite', 'elite', 'boss']);
  });

  test('웨이브 안에서 초반 소수 → 중반 증가 → 후반 무리, 뒤 웨이브일수록 더 큰 무리', () => {
    for (const w of CHAPTER_1.waves) {
      const st = w.normal.stages;
      expect(st[0].from).toBe(0);
      for (let i = 1; i < st.length; i++) {
        expect(st[i].from).toBeGreaterThan(st[i - 1].from);
        expect(st[i].maxAlive).toBeGreaterThan(st[i - 1].maxAlive);
        expect(st[i].group[1]).toBeGreaterThanOrEqual(st[i - 1].group[1]);
      }
      expect(stageAt(w.normal, 0)).toBe(st[0]);
      expect(stageAt(w.normal, 179)).toBe(st[st.length - 1]);
    }
    const peak = CHAPTER_1.waves.map((w) => w.normal.stages[w.normal.stages.length - 1]);
    for (let i = 1; i < peak.length; i++) {
      expect(peak[i].maxAlive).toBeGreaterThan(peak[i - 1].maxAlive);
      expect(peak[i].hpMul).toBeGreaterThanOrEqual(peak[i - 1].hpMul);
    }
  });
});

describe('일반 구간 시간 판정', () => {
  test('처치가 하나도 없어도 활성 180초가 지나면 엘리트/보스 구간으로 넘어간다', () => {
    const b = inWave();
    stall(b, 179);
    expect(b.waves[0].phase).toBe('normal');
    expect(b.waves[0].normalKills).toBe(0);
    stall(b, 1.5);
    expect(b.waves[0].phase).toBe('finale');
    expect(b.waves[0].normalTime).toBe(180);
  });

  test('처치 수를 아무리 채워도 시간 전에는 넘어가지 않는다(50/80/100 종료 조건 폐기)', () => {
    const b = inWave();
    b.waves[0].normalKills = 999;
    stall(b, 30);
    expect(b.waves[0].phase).toBe('normal');
  });

  test('시간 내내 스폰이 이어지고, 단계별 동시 상한을 넘지 않는다', () => {
    const b = inWave();
    const seen = new Set<number>();
    let checked = 0;
    for (let t = 0; t < 178; t += DT) {
      for (const e of b.enemies) e.hp = 9999;
      b.player.hp = b.player.maxHp;
      b.camp.mental = b.camp.maxMental;
      if (b.paused) { botChoose(b); continue; }
      // 일정 간격으로 앞쪽 몇 마리를 처치해 자리를 비운다(계속 생성되는지 확인)
      if (Math.floor(t * 60) % 300 === 0) for (const e of b.enemies.slice(0, 2)) (b as any).hitEnemy(e, 99999, 0);
      b.update(DT, NO_INPUT);
      for (const e of b.enemies) seen.add(e.id);
      const st = stageAt(b.chapter.waves[0].normal, b.waves[0].normalTime);
      expect(b.enemies.filter((e) => e.role === 'normal').length).toBeLessThanOrEqual(st.maxAlive);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(seen.size).toBeGreaterThan(b.chapter.waves[0].normal.stages[2].maxAlive);
    expect(b.waves[0].phase).toBe('normal');
  });

  test('선택창·등장 연출·엘리트/보스 구간·이동 구간에서는 일반 구간 타이머가 멈춘다', () => {
    const b = inWave(2);
    // 선택창(레벨업 대기)
    while (!b.paused) { b.update(DT, botInput(b)); if (b.finished) throw new Error('끝남'); }
    const n0 = b.waves[b.waveIndex].normalTime;
    for (let i = 0; i < 600; i++) b.update(DT, NO_INPUT);
    expect(b.waves[b.waveIndex].normalTime).toBe(n0);
    // 등장 연출
    while (!(b.introTimer > 0)) { if (b.paused) botChoose(b); else b.update(DT, botInput(b)); }
    expect(b.waves[0].normalTime).toBe(180);
    for (let i = 0; i < 30 && b.introTimer > 0; i++) b.update(DT, NO_INPUT);
    // 엘리트 구간·이동 구간: 1웨이브 값은 180에 고정, 2웨이브는 시작 전 0
    while (b.waveIndex === 0 && !b.finished) { if (b.paused) botChoose(b); else b.update(DT, botInput(b)); }
    expect(b.waves[0].normalTime).toBe(180);
    expect(b.mode).toBe('travel');
    expect(b.waves[1].normalTime).toBe(0);
    while (b.mode === 'travel') { if (b.paused) botChoose(b); else b.update(DT, botInput(b)); }
    expect(b.waves[1].normalTime).toBeLessThan(0.1);
  });

  test('전환: 잔여 잡몹은 처치·보상 없이 정리, 필드 드롭은 자동 회수(기존 규칙 유지)', () => {
    const b = inWave();
    stall(b, 179.5);
    const leftovers = b.enemies.filter((e) => e.role === 'normal').length;
    expect(leftovers).toBeGreaterThan(1);
    const killLogs = b.log.filter((l) => l.type === 'kill').length;
    const kills0 = b.waves[0].normalKills;
    const stone = (b as any).dropPickup('loot', b.player.x + 2000, 2);
    stone.lootId = 'smallStone';
    const xpDrop = (b as any).dropPickup('catnip', b.player.x + 2000, 5);
    expect(xpDrop).toBeTruthy();
    for (let i = 0; i < 60 && b.waves[0].phase === 'normal'; i++) {
      for (const e of b.enemies) e.hp = 9999;
      b.player.hp = b.player.maxHp;
      b.update(DT, NO_INPUT);
    }
    expect(b.waves[0].phase).toBe('finale');
    expect(b.enemies.some((e) => e.role === 'normal')).toBe(false);
    expect(b.log.find((l) => l.type === 'cleanup')?.value).toBe(leftovers);
    expect(b.log.filter((l) => l.type === 'kill').length).toBe(killLogs);
    expect(b.waves[0].normalKills).toBe(kills0);
    expect(b.pickups).toHaveLength(0);
    expect(b.loot.smallStone).toBe(2);
  });
});

describe('경험치·성장(11차)', () => {
  test('적 종류별 경험치가 다르고, 처치마다 확정 지급(드롭 운 없음)', () => {
    expect(ENEMIES.meteorRat.xp).toBeGreaterThan(ENEMIES.dustSlime.xp);
    expect(ENEMIES.rollingRat.xp).toBeGreaterThan(ENEMIES.meteorRat.xp);
    for (const kind of ['dustSlime', 'spikyBug', 'meteorRat'] as const) {
      const b = inWave();
      b.enemies = [];
      b.pickups = [];
      const e: Enemy = (b as any).spawnEnemy(kind, 0, true, b.player.x + 300);
      (b as any).hitEnemy(e, 99999, 0);
      const xp = b.pickups.filter((p) => p.kind === 'catnip');
      expect(xp).toHaveLength(1);
      expect(xp[0].value).toBe(ENEMIES[kind].xp);
    }
  });

  test('캠프 기어는 처치 기대값을 누적해 지급(확률 운 없음)', () => {
    const b = inWave();
    b.enemies = [];
    b.pickups = [];
    for (let i = 0; i < 20; i++) {
      const e: Enemy = (b as any).spawnEnemy('dustSlime', 0, true, b.player.x + 300);
      (b as any).hitEnemy(e, 99999, 0);
    }
    const gear = b.pickups.filter((p) => p.kind === 'gear').reduce((s, p) => s + p.value, 0);
    expect(gear).toBe(Math.floor(20 * ENEMIES.dustSlime.gearChance + 1e-9));
  });

  test('레벨업 요구량은 누적 레벨이 오를수록 커지고, 증가 폭도 커진다', () => {
    const c = TUNING.growth.heroXpCurve;
    for (let l = 1; l < 40; l++) {
      expect(c(l + 1)).toBeGreaterThan(c(l));
      expect(c(l + 2) - c(l + 1)).toBeGreaterThan(c(l + 1) - c(l) - 1e-9);
    }
  });

  test('웨이브 사이 경험치 유지: 웨이브가 바뀌어도 레벨·남은 경험치를 초기화하지 않는다', () => {
    const b = fresh(1);
    let lv0 = -1;
    let xp0 = -1;
    while (!b.finished && b.waveIndex < 1) {
      if (b.paused) { botChoose(b); continue; }
      b.update(DT, botInput(b));
      if (b.waveIndex === 0 && b.waves[0].phase === 'finale') { lv0 = b.heroLevel; xp0 = b.heroXp; }
    }
    expect(lv0).toBeGreaterThan(1);
    expect(b.heroLevel).toBeGreaterThanOrEqual(lv0);
    if (b.heroLevel === lv0) expect(b.heroXp).toBeGreaterThanOrEqual(xp0);
  });

  test('선택을 오래 고민해도 유리/불리 없음: 선택창에서 시간을 보낸 판과 바로 고른 판의 결과가 같다', () => {
    const run = (dawdle: number) => {
      const b = fresh(4);
      while (!b.finished && b.t < 260) {
        if (b.paused) {
          for (let i = 0; i < dawdle; i++) b.update(DT, { jump: true, ult: 0 });
          botChoose(b);
          continue;
        }
        b.update(DT, botInput(b));
      }
      return JSON.stringify({ t: b.t, x: b.player.x, hp: b.player.hp, lv: b.heroLevel, xp: b.heroXp, k: b.result().kills, w: b.waves.map((w) => w.normalTime), e: b.enemies.map((e) => [e.x, e.hp]) });
    };
    expect(run(600)).toBe(run(0));
  });
});

describe('저장 호환·챕터 제안', () => {
  test('이전 처치 목표 형식 기록(required/requiredTotal)을 새 처치 기록으로 바꿔 읽는다', () => {
    expect(normalizeKills({ required: 230, requiredTotal: 233, children: 3 })).toEqual({ normal: 230, finale: 0, children: 3 });
    expect(normalizeKills({ normal: 500, finale: 3, children: 6 })).toEqual({ normal: 500, finale: 3, children: 6 });
    expect(normalizeKills(undefined)).toEqual({ normal: 0, finale: 0, children: 0 });
    expect(normalizeKills({ required: 'x', children: -2 })).toEqual({ normal: 0, finale: 0, children: 0 });
  });

  test('뒤 챕터 시간 기반 제안(TEMP): 처치 목표표 없음, 미구현 챕터는 구현으로 표시하지 않는다', () => {
    const p1 = proposedChapterScaling(1);
    expect(p1).toMatchObject({ normalSeconds: 180, groupMul: 1, maxAliveMul: 1, hpMul: 1, implemented: true });
    let prev = p1;
    for (let ch = 2; ch <= MAIN_CHAPTER_COUNT; ch++) {
      const p = proposedChapterScaling(ch);
      expect(p.implemented).toBe(false);
      expect(p.hpMul).toBeGreaterThan(prev.hpMul);
      expect(p.groupMul).toBeGreaterThan(prev.groupMul);
      prev = p;
    }
  });
});

describe('교전 경계 떨림 완화와 실제 타격 가능성', () => {
  const front = (b: Battle) => b.player.x + TUNING.player.width / 2;
  function isolated() {
    const b = fresh(3);
    (b as any).updateWaves = () => undefined;
    (b as any).updateSupports = () => undefined;
    b.mode = 'wave';
    b.waves[0].started = true;
    b.rightLimit = Infinity;
    return b;
  }

  test('재개 직후에는 사거리 - 여유까지 더 다가가 멈추고, 그 거리에서도 기본 공격이 실제로 맞는다', () => {
    const b = isolated();
    (b as any).sinceResume = 0; // 막 재개한 상태
    const e: Enemy = (b as any).spawnEnemy('dustSlime', 0, true, 0);
    e.x = front(b) + TUNING.basicAttack.range - 10 + e.def.width / 2; // 사거리 안, 여유 밖
    e.hp = 9999;
    const x0 = b.player.x;
    b.update(DT, NO_INPUT);
    expect(b.player.x).toBeGreaterThan(x0); // 바로 멈추지 않고 조금 더 걷는다
    for (let i = 0; i < 90; i++) b.update(DT, NO_INPUT);
    expect(b.engaged).toBe(true);
    expect(e.x - e.def.width / 2 - front(b)).toBeLessThanOrEqual(TUNING.basicAttack.range);
    expect(e.hp).toBeLessThan(9999);
  });

  test('재개 여유 구간(사거리 밖)에 머무는 적 앞에서는 오래 서 있지 않고 다시 다가가 친다', () => {
    const b = isolated();
    const e: Enemy = (b as any).spawnEnemy('dustSlime', 0, true, 0);
    e.hp = 9999;
    (b as any).updateEnemies = () => undefined; // 적이 다가오지 않는 상황
    b.engaged = true;
    (b as any).sinceResume = 99;
    e.x = front(b) + TUNING.basicAttack.range + TUNING.advance.resumeMargin / 2 + e.def.width / 2;
    const x0 = b.player.x;
    for (let t = 0; t < TUNING.advance.marginHold + 0.3; t += DT) b.update(DT, NO_INPUT);
    expect(b.player.x).toBeGreaterThan(x0);
    for (let i = 0; i < 60; i++) b.update(DT, NO_INPUT);
    expect(e.hp).toBeLessThan(9999);
  });
});
