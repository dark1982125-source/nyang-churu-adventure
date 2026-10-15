import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { buildLoadout, newSave } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { runBot, botInput, botChoose } from './bot';

const DT = 1 / 60;
function fresh(seed = 3, mutate?: (s: ReturnType<typeof newSave>) => void) {
  const save = newSave();
  mutate?.(save);
  return new Battle({ runId: 1, seed, loadout: buildLoadout(save) });
}
function step(b: Battle, secs: number, input = NO_INPUT) {
  for (let t = 0; t < secs; t += DT) {
    if (b.paused) botChoose(b);
    b.update(DT, input);
  }
}

describe('이동 제한', () => {
  test('입력이 없으면 정지, 전진 입력 시 오른쪽으로만 이동(임시 hold 모드)', () => {
    const b = fresh();
    const x0 = b.player.x;
    step(b, 1);
    expect(b.player.x).toBe(x0);
    step(b, 1, { forward: true, jump: false, ult: null });
    expect(b.player.x).toBeGreaterThan(x0);
  });

  test('한 판 내내 x가 줄어드는 일이 없다', () => {
    for (const seed of [1, 2, 3]) expect(runBot({ seed }).minXViolation).toBe(false);
  });

  test('웨이브 중에는 전방 전투 구역 끝을 넘을 수 없다', () => {
    const b = fresh();
    const wave1 = b.chapter.waves[0];
    step(b, 8, { forward: true, jump: false, ult: null });
    expect(b.mode).toBe('wave');
    expect(b.player.x).toBeLessThanOrEqual(wave1.triggerX + TUNING.waves.arenaLength);
  });

  test('대시 관련 입력·기술·선택지가 존재하지 않는다', () => {
    const b = runBot({ seed: 2 }).battle;
    const offersText = JSON.stringify(b.weapon) + JSON.stringify(b.skills);
    expect(offersText.toLowerCase()).not.toContain('dash');
    expect(offersText).not.toContain('대시');
  });
});

describe('처치 카운트·웨이브 진행', () => {
  test('목표 처치 수를 채우기 전에는 다음 웨이브로 넘어가지 않는다', () => {
    const b = fresh();
    const go = { forward: true, jump: false, ult: null };
    step(b, 6, go);
    expect(b.mode).toBe('wave');
    while (b.enemies.length === 0) step(b, 0.2, go);
    const triggerNext = b.chapter.waves[1].triggerX;
    expect(b.rightLimit).toBeLessThan(triggerNext);
    expect(b.waveIndex).toBe(0);
    expect(b.waveRemaining(0)).toBeGreaterThan(0);
  });

  test('일반 구간 목표 처치 수를 채운 뒤에야 엘리트가 등장한다', () => {
    const { battle: b } = runBot({ seed: 1 });
    const firstElite = b.log.findIndex((l) => l.type === 'eliteSpawn');
    const killsBefore = b.log.slice(0, firstElite).filter((l) => l.type === 'kill').length;
    expect(killsBefore).toBeGreaterThanOrEqual(b.chapter.waves[0].normal.killTarget);
    expect(b.waves[0].normalKills).toBe(b.chapter.waves[0].normal.killTarget);
  });

  test('3웨이브를 순서대로 지나 보스 처치 후 클리어, 지정 처치 대상 전부 처치', () => {
    const { battle: b } = runBot({ seed: 1 });
    expect(b.mode).toBe('victory');
    expect(b.killsRequired).toBe(b.requiredTotal);
    const order = b.log.filter((l) => ['waveStart', 'waveClear'].includes(l.type)).map((l) => `${l.type}${l.detail}`);
    expect(order).toEqual(['waveStart1', 'waveClear1', 'waveStart2', 'waveClear2', 'waveStart3', 'waveClear3']);
  });

  test('왕먼지 슬라임 분열 자식까지 추적하고, 자식이 남으면 웨이브가 끝나지 않는다', () => {
    const { battle: b } = runBot({ seed: 3 });
    const split = b.log.find((l) => l.type === 'split')!;
    expect(split.value).toBe(3);
    expect(b.childrenSpawned).toBe(3);
    expect(b.childrenKilled).toBe(3);
    const splitIdx = b.log.indexOf(split);
    const clear2 = b.log.findIndex((l) => l.type === 'waveClear' && l.detail === '2');
    const childKills = b.log.slice(splitIdx, clear2).filter((l) => l.type === 'kill' && l.value === 0).length;
    expect(childKills).toBe(3);
  });

  test('분열 자식은 다시 분열하지 않는다(세대 상한)', () => {
    const b = fresh();
    b.mode = 'wave';
    const king = (b as any).spawnEnemy('kingDustSlime', 1, true, b.player.x + 60);
    (b as any).hitEnemy(king, 9999, 0);
    const kids = b.enemies.filter((e) => e.parentId === king.id);
    expect(kids).toHaveLength(3);
    for (const k of kids) (b as any).hitEnemy(k, 9999, 0);
    expect(b.enemies).toHaveLength(0);
  });
});

describe('적 통과 감지', () => {
  test('비교안(jumpPass): 점프로 적을 넘으면 통과가 기록되고, 레이저가 처리해 진행 불가가 생기지 않는다', () => {
    const b = fresh(3, (s) => { s.settings.passPolicy = 'jumpPass'; });
    b.mode = 'wave';
    const e = (b as any).spawnEnemy('dustSlime', 0, true, b.player.x + 40);
    e.hp = 80; // 기본 공격으로 먼저 죽지 않게
    for (let t = 0; t < 1.2; t += DT) { b.player.y = 200; b.player.vy = 0; b.update(DT, NO_INPUT); } // 공중에 머무는 동안

    expect(e.passed).toBe(true);
    expect(b.log.some((l) => l.type === 'pass')).toBe(true);
    step(b, 15);
    expect(b.enemies.includes(e)).toBe(false);
  });

  test('기본안(frontBlock): 호냥이가 공중에 있어도 적은 앞면에서 멈추고 뒤로 넘어가지 않는다', () => {
    const b = fresh();
    expect(b.passPolicy).toBe('frontBlock');
    b.mode = 'wave';
    const e = (b as any).spawnEnemy('meteorRat', 0, true, b.player.x + 60);
    e.hp = 9999;
    for (let t = 0; t < 2; t += DT) { b.player.y = 200; b.player.vy = 0; b.update(DT, NO_INPUT); }
    expect(e.passed).toBe(false);
    expect(e.x).toBeGreaterThan(b.player.x);
    expect(b.log.some((l) => l.type === 'pass')).toBe(false);
    // 착지해도 적 위에 겹치지 않는다(앞면 접촉 거리 유지)
    b.player.y = 0;
    b.update(DT, NO_INPUT);
    expect(e.x - b.player.x).toBeGreaterThanOrEqual((TUNING.player.width + e.def.width) / 2 - 2);
  });

  test('기본안(frontBlock): 여러 시드 한 판 동안 통과가 한 번도 일어나지 않는다', () => {
    for (const seed of [2, 4, 5]) {
      const { battle: b } = runBot({ seed });
      expect(b.log.filter((l) => l.type === 'pass')).toHaveLength(0);
      expect(b.enemies.every((e) => e.x >= b.player.x)).toBe(true);
    }
  });
});

describe('보스 돌 투척(원안: 캠프를 향한 큰 돌, 공중 펀치 파괴)', () => {
  function bossFight() {
    const b = fresh();
    b.mode = 'wave';
    const boss = (b as any).spawnEnemy('stompSole', 2, true, b.player.x + 400);
    boss.hp = 99999;
    boss.cdA = 999; // 충격파 패턴은 끈다
    boss.cdB = 0;
    return { b, boss };
  }

  test('큰 돌은 캠프로 날아가 캠프(배리어 포함)에 피해를 준다(호냥이가 가만히 있을 때)', () => {
    const { b } = bossFight();
    // 호냥이는 제자리(지상). 돌은 펀치 높이 위로 지나간다
    let saw = false;
    let before = 0;
    let after = 0;
    for (let t = 0; t < 8 && !b.log.some((l) => l.type === 'rockHitCamp'); t += DT) {
      before = b.camp.mental + b.camp.shield;
      b.update(DT, NO_INPUT);
      after = b.camp.mental + b.camp.shield;
      if (b.hazards.some((h) => h.kind === 'bigRock')) saw = true;
    }
    expect(saw).toBe(true);
    expect(b.log.some((l) => l.type === 'rockHitCamp')).toBe(true);
    expect(after).toBeLessThan(before);
  });

  test('점프한 호냥이의 기본 공격(공중 펀치)으로 큰 돌을 부술 수 있다', () => {
    const { b, boss } = bossFight();
    b.player.x = boss.x - 170; // 보스 가까이에서는 막 던진 돌이 낮게 지나간다
    let broken = false;
    for (let t = 0; t < 10 && !broken; t += DT) {
      const rock = b.hazards.find((h) => h.kind === 'bigRock');
      const jump = !!rock && rock.x > b.player.x && rock.x - b.player.x < 110 && rock.y > 85;
      b.update(DT, { forward: false, jump, ult: null });
      broken = b.log.some((l) => l.type === 'rockBroken');
    }
    expect(broken).toBe(true);
    expect(b.log.some((l) => l.type === 'rockHitCamp')).toBe(false);
  });
});

describe('구출', () => {
  test('보스 처치 → 열쇠 → 감옥 개방 → 구출 공개 → 클리어 순서', () => {
    const { battle: b } = runBot({ seed: 1 });
    const idx = (t: string) => b.log.findIndex((l) => l.type === t);
    const bossKill = b.log.findIndex((l) => l.type === 'kill' && l.detail === '쿵쿵 돌발바닥');
    expect(bossKill).toBeGreaterThan(-1);
    expect(idx('key')).toBeGreaterThan(bossKill);
    expect(idx('jailOpen')).toBeGreaterThan(idx('key'));
    expect(idx('victory')).toBeGreaterThan(idx('jailOpen'));
    expect(b.result().rescued).toBe('kosyot');
  });

  test('패배하면 구출이 확정되지 않는다', () => {
    const b = fresh();
    b.player.hp = 1;
    b.damagePlayer(5);
    step(b, 0.1);
    expect(b.mode).toBe('defeat');
    expect(b.result().rescued).toBeNull();
  });

  test('코숏 지원은 구출 전에는 없고, 구출 후 출격부터 캠프 선택지(캡슐·증상별 처방)와 캡슐이 생긴다', () => {
    const before = fresh();
    step(before, 20, { forward: true, jump: false, ult: null });
    expect(before.log.length).toBeGreaterThan(0);
    expect((before as any).availableCampSkills()).not.toContain('capsule');
    const after = fresh(3, (s) => s.rescued.push('kosyot'));
    expect((after as any).availableCampSkills()).toContain('capsule');
    expect((after as any).availableCampSkills()).toContain('prescription');
    step(after, 6.1);
    expect(after.pickups.some((p) => p.kind === 'capsule')).toBe(true);
    // 투하 위치는 호냥이 앞쪽
    const cap = after.pickups.find((p) => p.kind === 'capsule')!;
    expect(cap.x).toBeGreaterThan(after.player.x);
  });
});

describe('다시냥 방울', () => {
  test('HP 0에서 자동 소모, 최대 HP 50%, 3초 무적, 판당 1회', () => {
    const b = fresh();
    b.hasBell = true;
    b.player.hp = 5;
    b.damagePlayer(50);
    expect(b.player.hp).toBe(0);
    b.update(DT, NO_INPUT); // HP 0 판정은 틱 끝(캠프 판정 뒤)
    expect(b.player.hp).toBe(b.player.maxHp * 0.5);
    expect(b.player.invuln).toBeCloseTo(3, 1);
    expect(b.hasBell).toBe(false);
    expect(b.damagePlayer(10)).toBe(false); // 무적 중
    b.player.invuln = 0;
    b.hasBell = true; // 두 번째 방울이 있어도 판당 1회
    b.player.hp = 1;
    b.damagePlayer(10);
    step(b, 0.05);
    expect(b.mode).toBe('defeat');
  });

  test('캠프 파괴에는 적용되지 않는다', () => {
    const b = fresh();
    b.hasBell = true;
    b.damageCamp(9999);
    step(b, 0.05);
    expect(b.mode).toBe('defeat');
    expect(b.defeatCause).toBe('camp');
  });

  test('엘리트 드롭으로 얻고 실제 판에서 부활이 동작한다', () => {
    const { battle: b } = runBot({ seed: 1, forceBell: true, input: (bb) => ({ ...botInput(bb), jump: false }) });
    expect(b.log.some((l) => l.type === 'bell')).toBe(true);
  });
});

describe('냥기력·쿨타임·궁극기', () => {
  test('전용 기술은 냥기력과 쿨타임이 모두 준비될 때만 발동하고, 발동 시에만 차감된다', () => {
    const b = fresh();
    b.skills.exclusives.push({ id: 'straight', grade: 'normal', level: 1 });
    b.skillCd.straight = 0;
    b.mode = 'wave';
    (b as any).spawnEnemy('meteorRat', 0, true, b.player.x + 80).hp = 9999;
    b.player.energy = 5; // 부족
    b.update(DT, NO_INPUT);
    expect(b.log.some((l) => l.type === 'skill')).toBe(false);
    expect(b.player.energy).toBeGreaterThan(5);
    b.player.energy = 100;
    b.update(DT, NO_INPUT);
    expect(b.log.filter((l) => l.type === 'skill')).toHaveLength(1);
    const after = b.player.energy;
    expect(after).toBeLessThan(100 - 11);
    b.update(DT, NO_INPUT); // 쿨타임 중
    expect(b.log.filter((l) => l.type === 'skill')).toHaveLength(1);
  });

  test('궁극기 게이지는 기술 발동으로만 차고 시간으로 자동 충전되지 않는다', () => {
    const b = fresh(3, (s) => { s.nodes.ultSlot = 1; s.nodes.ult_healHero = 1; s.equippedUltimates = ['healHero']; });
    step(b, 5);
    expect(b.ultGauge).toBe(0);
    b.skills.exclusives.push({ id: 'straight', grade: 'normal', level: 1 });
    b.mode = 'wave';
    (b as any).spawnEnemy('meteorRat', 0, true, b.player.x + 80).hp = 9999;
    step(b, 0.1);
    expect(b.ultGauge).toBeGreaterThan(0);
  });

  test('궁극기 미해금이면 게이지가 차지 않고 발동되지 않는다', () => {
    const b = fresh();
    b.skills.exclusives.push({ id: 'straight', grade: 'normal', level: 1 });
    b.mode = 'wave';
    (b as any).spawnEnemy('meteorRat', 0, true, b.player.x + 80).hp = 9999;
    step(b, 0.1);
    expect(b.ultGauge).toBe(0);
    expect(b.useUltimate(0)).toBe(false);
  });

  test('가득 찬 게이지로 장착 궁극기 발동 후 0으로', () => {
    const b = fresh(3, (s) => { s.nodes.ultSlot = 1; s.nodes.ult_healHero = 1; s.equippedUltimates = ['healHero']; });
    b.ultGauge = 100;
    b.player.hp = 10;
    b.update(DT, { forward: false, jump: false, ult: 0 });
    expect(b.player.hp).toBe(b.player.maxHp);
    expect(b.ultGauge).toBe(0);
  });
});

describe('레벨업 선택창', () => {
  test('경험치가 차면 일시정지 후 3지선다, 선택하면 재개', () => {
    const b = fresh();
    (b as any).collect({ kind: 'catnip', value: 100, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    expect(b.paused).toBe(true);
    expect(b.pending[0].offers).toHaveLength(3);
    const t = b.t;
    b.update(DT, NO_INPUT);
    expect(b.t).toBe(t);
    while (b.paused) b.choose(0);
    b.update(DT, NO_INPUT);
    expect(b.t).toBeGreaterThan(t);
  });

  test('호냥이 경험치(작은 개다래)와 캠프 경험치(작은 톱니)는 별도 선택창', () => {
    const b = fresh();
    (b as any).collect({ kind: 'gear', value: 100, x: 0, y: 0, vy: 0, age: 0, lifetime: null, id: 0 });
    expect(b.pending.every((p) => p.track === 'camp')).toBe(true);
    expect(b.pending[0].offers.every((o) => o.kind === 'camp' || (o.kind === 'filler' && ['gear', 'mental'].includes(o.id)))).toBe(true);
  });
});

describe('밸런스 스모크(TEMP 수치)', () => {
  test('기본 봇이 첫 판에서 여러 시드 중 일부는 클리어한다', () => {
    const wins = [1, 2, 3, 4, 5, 6].filter((seed) => runBot({ seed }).battle.mode === 'victory').length;
    expect(wins).toBeGreaterThanOrEqual(2);
  });

  test('판이 무한히 끝나지 않는 일이 없다', () => {
    for (const seed of [11, 12, 13]) expect(runBot({ seed, maxTime: 400 }).battle.finished).toBe(true);
  });
});
