import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT, type Enemy } from '../src/sim/battle';
import { buildLoadout, loadSave, memoryStorage, newSave } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { heroCampMinGap } from '../src/sim/armorRules';
import { runBot, botChoose } from './bot';
import { measureRun, summarize } from './metrics';

/** 자동전진-교전-후속확정(8차): 자동 전진, 유효 사거리 교전 정차, 밀쳐내기 복귀, 호냥이 대상 공격 전가 없음 */

const DT = 1 / 60;
const fresh = (seed = 3) => new Battle({ runId: 1, seed, loadout: buildLoadout(newSave()) });
const step = (b: Battle, sec: number, jump = false) => {
  for (let t = 0; t < sec; t += DT) { if (b.paused) botChoose(b); b.update(DT, { ...NO_INPUT, jump }); }
};
/** 웨이브·지원 없이 이동 규칙만 본다 */
const isolated = (seed = 3) => {
  const b = fresh(seed);
  (b as any).updateWaves = () => undefined;
  (b as any).updateSupports = () => undefined;
  b.rightLimit = Infinity;
  return b;
};
const spawn = (b: Battle, kind: Enemy['def']['kind'], dx: number) => (b as any).spawnEnemy(kind, 0, true, b.player.x + dx) as Enemy;
const front = (b: Battle) => b.player.x + TUNING.player.width / 2;

describe('자동 전진', () => {
  test('입력 없이 전진하고 캠프가 같은 간격으로 따라온다', () => {
    const b = isolated();
    const gap = b.player.x - b.camp.x;
    step(b, 2);
    expect(b.player.x).toBeGreaterThan(160 + TUNING.player.moveSpeed * 1.9);
    expect(b.player.x - b.camp.x).toBeCloseTo(gap);
  });

  test('정차 거리 = 기본 공격 실제 사거리: 멈춘 그 자리에서 기본 공격이 맞는다', () => {
    const b = isolated();
    const e = spawn(b, 'dustSlime', 500);
    e.hp = 9999;
    e.cc = 999; e.ccKind = 'stun'; // 제자리에 세워 둔다
    let stopX = -1;
    for (let t = 0; t < 6 && stopX < 0; t += DT) {
      const x = b.player.x;
      b.update(DT, NO_INPUT);
      if (b.player.x === x && b.engaged) stopX = x;
    }
    expect(stopX).toBeGreaterThan(0);
    const gap = e.x - e.def.width / 2 - front(b);
    expect(gap).toBeLessThanOrEqual(TUNING.basicAttack.range + 1e-6);
    expect(gap).toBeGreaterThan(TUNING.basicAttack.range - TUNING.player.moveSpeed * DT - 1e-6);
    const hp = e.hp;
    step(b, 0.6);
    expect(e.hp).toBeLessThan(hp); // 멈춘 채로 실제로 때린다
    expect(b.player.x).toBe(stopX);
  });

  test('가까운 적을 정리하면 바로 전진을 재개한다', () => {
    const b = isolated();
    const e = spawn(b, 'dustSlime', 200);
    step(b, 0.2);
    while (b.enemies.includes(e)) step(b, 0.05);
    const x = b.player.x;
    step(b, 0.3);
    expect(b.player.x).toBeGreaterThan(x);
  });

  test('경계 떨림 없음: 재개 판정 여유 안에서 적이 조금 밀려나도 정차를 유지한다', () => {
    const b = isolated();
    const e = spawn(b, 'dustSlime', 300);
    e.hp = 9999; e.cc = 999; e.ccKind = 'stun';
    step(b, 3);
    expect(b.engaged).toBe(true);
    const x = b.player.x;
    e.x += TUNING.advance.resumeMargin * 0.8;
    step(b, 0.5);
    expect(b.player.x).toBe(x);
    // 여유 밖으로 밀려나면 다시 전진해 사거리로 붙는다
    e.x += TUNING.advance.resumeMargin * 3;
    step(b, 1);
    expect(b.player.x).toBeGreaterThan(x);
    expect(b.engaged).toBe(true);
  });

  test('사거리 밖 공중 적(지상 펀치 높이 위) 때문에 멈춰 서지 않는다', () => {
    const b = isolated();
    const bat = spawn(b, 'dustBat', 120);
    bat.hp = 9999;
    const x = b.player.x;
    step(b, 3);
    expect(bat.y).toBeGreaterThan(TUNING.player.height + TUNING.player.punchReachUp);
    expect(b.player.x - x).toBeGreaterThan(TUNING.player.moveSpeed * 2.5);
    expect(bat.passed).toBe(false); // 뒤로 넘어가지도 않는다
    // 점프하면 칠 수 있다(공중 펀치)
    const hp = bat.hp;
    for (let t = 0; t < 1.5; t += DT) b.update(DT, { ...NO_INPUT, jump: b.grounded });
    expect(bat.hp).toBeLessThan(hp);
  });

  test('원거리 적(캠프 조준) 앞에서 사거리 밖에 서 있지 않고 다가가 교전한다', () => {
    const b = isolated();
    const r = spawn(b, 'pebbleRat', 450);
    r.hp = 9999;
    step(b, 5);
    expect(b.engaged).toBe(true);
    expect(r.x - r.def.width / 2 - front(b)).toBeLessThanOrEqual(TUNING.basicAttack.range + TUNING.advance.resumeMargin);
  });

  test('한 판 내내 적이 호냥이 뒤로 넘어가지 않고, 일반 구간에서 사거리 밖 장시간 정차가 거의 없다', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { battle: b, minXViolation } = runBot({ seed });
      expect(minXViolation).toBe(false);
      expect(b.log.some((l) => l.type === 'pass')).toBe(false);
    }
    const m = summarize([1, 2, 3, 4, 5, 6].map((s) => measureRun(s)));
    expect(m.longWaits).toBeLessThan(0.5);
    expect(m.firstAttackDelay).toBeLessThan(6);
  });

  test('다음 웨이브는 앞 웨이브를 정리한 지점 + 이동 거리, 감옥은 보스 처치 지점 + 거리', () => {
    const b = fresh(1);
    let clearX = -1;
    while (!b.finished && b.t < 600) {
      if (b.paused) { botChoose(b); continue; }
      const wi = b.waveIndex;
      b.update(DT, NO_INPUT);
      if (b.waveIndex === 1 && wi === 0) clearX = Math.max(b.player.x, b.camp.x + TUNING.camp.followGap);
      if (b.waveIndex === 1 && clearX > 0) break;
    }
    expect(b.waveX[1]).toBeCloseTo(clearX + TUNING.advance.travelGap);
    expect(b.rightLimit).toBe(b.waveX[1]);
  });
});

describe('엘리트/보스 정차와 밀쳐내기(호냥이만, 캠프 제자리)', () => {
  test('밀쳐내기: 캠프는 제자리, 겹침 없음, 경직 뒤 호위 위치로 복귀하고 나서 함께 전진', () => {
    const b = isolated();
    step(b, 1);
    const cx = b.camp.x;
    const escort = cx + TUNING.camp.followGap;
    b.knockbackHero(1000);
    expect(b.player.x).toBe(cx + heroCampMinGap());
    expect(b.player.stagger).toBeGreaterThan(0);
    const x = b.player.x;
    step(b, TUNING.heroKnockback.stagger - 0.05);
    expect(b.player.x).toBe(x); // 경직 중 정지
    expect(b.camp.x).toBe(cx);
    // 복귀하는 동안 캠프는 그대로
    while (b.player.x < escort - 0.5) { b.update(DT, NO_INPUT); expect(b.camp.x).toBe(cx); }
    step(b, 0.5);
    expect(b.camp.x).toBeGreaterThan(cx);
    expect(b.player.x - b.camp.x).toBeCloseTo(TUNING.camp.followGap);
  });

  test('보스전: 밀려도 복귀 후에는 다시 정차', () => {
    const b = fresh(1);
    while (!(b.waveIndex === 2 && b.waves[2].phase === 'finale' && b.waves[2].finaleSpawned)) {
      if (b.paused) { botChoose(b); continue; }
      b.update(DT, NO_INPUT);
      if (b.finished) throw new Error('보스 전에 끝남');
    }
    const stopX = b.player.x;
    const cx = b.camp.x;
    b.knockbackHero(80);
    expect(b.player.x).toBeLessThan(stopX);
    for (let t = 0; t < 3; t += DT) { if (b.paused) botChoose(b); else b.update(DT, NO_INPUT); if (b.finished) break; }
    expect(b.player.x).toBeCloseTo(stopX);
    expect(b.camp.x).toBe(cx);
  });

  test('밀쳐내기 저항은 밀리는 거리만 줄인다', () => {
    const s = newSave();
    s.rescued.push('kosyot', 'kangkang');
    s.armor.explorerBoots = { level: 5, fails: {} };
    s.armorBlueprints.push('explorerBoots');
    s.equipment.feet = 'explorerBoots';
    const b = new Battle({ runId: 1, seed: 1, loadout: buildLoadout(s) });
    (b as any).updateWaves = () => undefined;
    step(b, 2);
    const moved = b.knockbackHero(60);
    expect(b.loadout.armor.resist.knockback).toBeGreaterThan(0);
    expect(moved).toBeCloseTo(60 * (1 - b.loadout.armor.resist.knockback));
  });
});

describe('적 공격 대상: 호냥이 대상은 예고 위치에서 끝, 캠프 대상은 명확한 예고', () => {
  const bossFight = () => {
    const b = isolated();
    step(b, 0.5);
    (b as any).updateCombat = () => undefined; // 보스를 그대로 둔다
    b.rightLimit = b.player.x;
    const boss = spawn(b, 'stompSole', 200);
    boss.cdB = 999; // 돌 투척 없이 충격파만
    boss.cdA = 0;
    return { b, boss };
  };

  test('충격파: 예고한 호냥이 위치에서 사라지고, 점프로 피해도 캠프에 피해가 가지 않는다', () => {
    const { b } = bossFight();
    const mental = b.camp.mental;
    const hp = b.player.hp;
    let sawWave = false;
    let endedAt = Infinity;
    for (let t = 0; t < 3; t += DT) {
      const w = b.hazards.find((h) => h.kind === 'shockwave');
      if (w) { sawWave = true; endedAt = Math.min(endedAt, w.targetX); }
      const near = !!w && w.x - b.player.x < 90;
      b.update(DT, { ...NO_INPUT, jump: near && b.grounded });
    }
    expect(sawWave).toBe(true);
    expect(endedAt).toBeGreaterThan(b.camp.x + TUNING.camp.width / 2);
    expect(b.camp.mental).toBe(mental);
    expect(b.player.hp).toBe(hp);
    // 예고 표시도 호냥이 위치까지
    expect(b.log.some((l) => l.type === 'rockHitCamp')).toBe(false);
  });

  test('충격파를 맞아도 피해는 호냥이만, 캠프로 이어지지 않는다', () => {
    const { b } = bossFight();
    (b as any).rng.chance = () => false;
    const mental = b.camp.mental;
    const hp = b.player.hp;
    step(b, 3);
    expect(b.player.hp).toBeLessThan(hp);
    expect(b.camp.mental).toBe(mental);
  });

  test('보스 돌 투척(캠프 대상)은 캠프 조준 예고를 띄운다', () => {
    const { b, boss } = bossFight();
    boss.cdA = 999;
    boss.cdB = 0;
    let aimed = false;
    for (let t = 0; t < 1.5; t += DT) { b.update(DT, NO_INPUT); if (b.effects.some((f) => f.kind === 'aim' && f.text === '캠프 조준!')) aimed = true; }
    expect(aimed).toBe(true);
  });
});

describe('저장 호환', () => {
  test('예전 입력 유지 전진 설정이 든 저장도 진행은 그대로 불러오고 설정만 지운다', () => {
    const st = memoryStorage();
    const old = newSave() as any;
    old.settings.advanceMode = 'hold';
    old.currencies.nyangJelly = 77;
    old.rescued.push('kosyot');
    st.store(JSON.stringify(old));
    const s = loadSave(st) as any;
    expect(s.settings.advanceMode).toBeUndefined();
    expect(s.currencies.nyangJelly).toBe(77);
    expect(s.rescued).toContain('kosyot');
  });
});
