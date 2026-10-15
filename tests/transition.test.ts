import { describe, expect, test } from 'vitest';
import { Battle, NO_INPUT } from '../src/sim/battle';
import { campOffers, isAutoGrant, type RunSkills } from '../src/sim/choices';
import { buildLoadout, newSave, type SaveData } from '../src/meta/save';
import { TUNING } from '../src/config/tuning';
import { CHAPTER_1, type ChapterDef } from '../src/data/chapters';
import { Rng } from '../src/sim/rng';
import type { CampSkillId } from '../src/data/skills';

const DT = 1 / 60;
const fresh = (seed = 3, edit?: (s: SaveData) => void, chapter?: ChapterDef) => {
  const save = newSave();
  edit?.(save);
  return new Battle({ runId: 1, seed, loadout: buildLoadout(save), chapter });
};
const step = (b: Battle, sec: number) => { for (let t = 0; t < sec; t += DT) { if (b.paused) b.choose(0); b.update(DT, NO_INPUT); } };
const skills = (camp: Partial<Record<CampSkillId, number>> = {}): RunSkills => ({ basicLevel: 1, exclusives: [], passives: {}, camp });
const MAX = TUNING.growth.campSkillMaxLevel;

describe('캠프 레벨업 선택지 (§1)', () => {
  const all: CampSkillId[] = ['barrier', 'laser', 'capsule', 'prescription'];
  const shape = (offers: ReturnType<typeof campOffers>) => offers.map((o) => (o.kind === 'camp' ? 'skill' : o.id));

  test('강화 가능한 기술 3개 이상이면 기술 3장', () => {
    for (let s = 0; s < 20; s++) expect(shape(campOffers(skills(), all, new Rng(s)))).toEqual(['skill', 'skill', 'skill']);
  });

  test('기술 2개면 기술 2 + 대체 1, 1개면 기술 1 + 대체 2, 0개면 기어·회복 2장', () => {
    const two = campOffers(skills({ barrier: MAX }), ['barrier', 'laser', 'capsule'], new Rng(1));
    expect(shape(two).filter((k) => k === 'skill')).toHaveLength(2);
    expect(two).toHaveLength(3);
    const one = shape(campOffers(skills({ barrier: MAX }), ['barrier', 'laser'], new Rng(1)));
    expect(one.filter((k) => k === 'skill')).toHaveLength(1);
    expect(one.filter((k) => k !== 'skill').sort()).toEqual(['gear', 'mental']);
    const none = shape(campOffers(skills({ barrier: MAX, laser: MAX }), ['barrier', 'laser'], new Rng(1)));
    expect(none.sort()).toEqual(['gear', 'mental']);
  });

  test('캠프 체력 최대면 회복 제외 → 유효 2개면 2장, 중복·빈칸 없음', () => {
    for (let s = 0; s < 20; s++) {
      const o = shape(campOffers(skills({ barrier: MAX }), ['barrier', 'laser'], new Rng(s), true));
      expect(o.sort()).toEqual(['gear', 'skill']);
    }
  });

  test('기어만 남으면 선택창 없이 자동 지급', () => {
    const offers = campOffers(skills({ barrier: MAX, laser: MAX }), ['barrier', 'laser'], new Rng(1), true);
    expect(isAutoGrant(offers)).toBe(true);
    const b = fresh();
    b.skills.camp = { barrier: MAX, laser: MAX };
    b.camp.mental = b.camp.maxMental;
    (b as any).queueChoice('camp');
    expect(b.paused).toBe(false);
    expect(b.loot.golgolGear).toBe(TUNING.fillers.campGear);
    expect(b.log.some((l) => l.type === 'filler' && l.detail === 'gear:auto')).toBe(true);
    // 캠프 체력이 깎여 있으면 기어·회복 2장 선택창
    b.camp.mental = 50;
    (b as any).queueChoice('camp');
    expect(b.paused).toBe(true);
    expect(b.pending[0].offers.map((o) => (o.kind === 'filler' ? o.id : o.kind)).sort()).toEqual(['gear', 'mental']);
  });
});

describe('일반 구간 → 엘리트/보스 전환 (§2)', () => {
  const ready = () => {
    const b = fresh();
    b.mode = 'wave';
    b.rightLimit = b.player.x;
    (b as any).spawnEnemy('dustSlime', 0, true, b.player.x + 300);
    b.waves[0].normalKills = CHAPTER_1.waves[0].normal.killTarget;
    return b;
  };

  test('적 투사체·장판·예고와 호냥이 예약 공격 제거, 보호막·버프·쿨타임 유지, 드롭 자동 회수', () => {
    const b = ready();
    b.hazards.push({ kind: 'campShot', style: 'lob', x: b.player.x + 100, y: 80, vx: 0, progress: 0.2, startX: b.player.x + 200, targetX: b.camp.x, radius: 10, damage: 9, hp: 1, maxHp: 1, duration: 2, startY: 30, endY: 50, arc: 100, hitPlayer: false, done: false });
    (b as any).scheduled.push({ at: b.t + 5, skill: {}, damage: 10, stun: 0 });
    (b as any).addEffect({ kind: 'aim', x1: 0, x2: 1, y1: 0, y2: 0, ttl: 1 });
    b.camp.shield = 30;
    b.slowAll = 3;
    b.skillCd.udada = 4;
    const loot = (b as any).dropPickup('loot', b.player.x + 3000, 2);
    loot.lootId = 'oldYarn';
    const behind = (b as any).dropPickup('loot', b.player.x - 3000, 1);
    behind.lootId = 'smallStone';
    b.update(DT, NO_INPUT);
    expect(b.enemies).toHaveLength(0);
    expect(b.hazards).toHaveLength(0);
    expect((b as any).scheduled).toHaveLength(0);
    expect(b.effects.some((f) => f.kind === 'aim')).toBe(false);
    expect(b.camp.shield).toBeGreaterThan(29);
    expect(b.slowAll).toBeGreaterThan(2.9);
    expect(b.skillCd.udada).toBe(4);
    expect(b.loot.oldYarn).toBe(2);
    expect(b.loot.smallStone).toBe(1);
    expect(b.pickups).toHaveLength(0);
  });

  test('회수 경험치 레벨업 선택 → 등장 연출(전투 타이머 정지) → 엘리트 등장', () => {
    const b = ready();
    b.heroXp = b.heroXpNeeded - 1;
    (b as any).dropPickup('catnip', b.player.x + 3000, 1);
    b.skillCd.udada = 4;
    b.applyHeroStatus({ tag: 'poison', source: '시험', intensity: 1, duration: 9 });
    b.update(DT, NO_INPUT);
    expect(b.paused).toBe(true); // 선택 먼저
    expect(b.introTimer).toBe(0);
    expect(b.enemies.some((e) => e.role === 'finale')).toBe(false);
    b.choose(0);
    b.update(DT, NO_INPUT); // 연출 시작
    expect(b.introTimer).toBeGreaterThan(0);
    const t0 = b.t, cd0 = b.skillCd.udada, st0 = b.heroStatus.get('poison')!.remaining, hp0 = b.player.hp;
    for (let k = 0; k < Math.floor(TUNING.waves.finaleIntro / DT) - 2; k++) b.update(DT, NO_INPUT);
    expect(b.t).toBe(t0);
    expect(b.skillCd.udada).toBe(cd0);
    expect(b.heroStatus.get('poison')!.remaining).toBe(st0);
    expect(b.player.hp).toBe(hp0);
    expect(b.enemies.some((e) => e.role === 'finale')).toBe(false);
    step(b, 0.2);
    expect(b.enemies.some((e) => e.role === 'finale')).toBe(true);
  });
});

describe('웨이브·챕터 종료 경험치 (§3)', () => {
  test('엘리트 처치 후 다음 웨이브가 있으면 레벨업 선택을 처리한 뒤 진행', () => {
    const b = fresh();
    b.mode = 'wave';
    b.waves[0].phase = 'finale';
    b.waves[0].finaleSpawned = true;
    const el = (b as any).spawnEnemy('rollingRat', 0, true, b.player.x + 40);
    el.role = 'finale';
    b.heroXp = b.heroXpNeeded - 1;
    (b as any).hitEnemy(el, 99999, 0);
    for (let i = 0; i < 120 && !b.paused; i++) b.update(DT, NO_INPUT);
    expect(b.paused).toBe(true);
    expect(b.clearConfirmed).toBe(false);
    b.choose(0);
    step(b, 0.2);
    expect(b.waveIndex).toBe(1);
    expect(b.mode).toBe('travel');
  });

  const finalBoss = (b: Battle) => {
    b.mode = 'wave';
    b.waveIndex = 2;
    b.waves[0].cleared = b.waves[1].cleared = true;
    b.waves[2].started = true;
    b.waves[2].phase = 'finale';
    b.waves[2].finaleSpawned = true;
    const boss = (b as any).spawnEnemy(b.chapter.waves[2].finale, 2, true, b.player.x + 40);
    boss.role = 'finale';
    return boss;
  };

  test('마지막 처치와 경험치 획득이 같은 틱이어도 클리어 확정이 우선: 선택창·레벨업 없음', () => {
    const b = fresh();
    const boss = finalBoss(b);
    boss.hp = 1;
    b.player.basicTimer = 0;
    b.heroXp = b.heroXpNeeded - 1;
    b.campXp = b.campXpNeeded - 1;
    // 같은 틱에 수집될 경험치(호냥이 몸 위)
    const c = (b as any).dropPickup('catnip', b.player.x, 1); c.y = 20; c.vy = 0; c.age = 1;
    const g = (b as any).dropPickup('gear', b.player.x, 1); g.y = 20; g.vy = 0; g.age = 1;
    const lvl = b.heroLevel, clvl = b.campLevel;
    b.update(DT, NO_INPUT);
    expect(b.log.some((l) => l.type === 'kill' && l.detail === boss.def.name)).toBe(true);
    expect(b.clearConfirmed).toBe(true);
    expect(b.paused).toBe(false);
    expect(b.pending).toHaveLength(0);
    expect(b.heroLevel).toBe(lvl);
    expect(b.campLevel).toBe(clvl);
    expect(b.autoCollectedXp.hero).toBeGreaterThanOrEqual(1);
    expect(b.autoCollectedXp.camp).toBeGreaterThanOrEqual(1);
    const confirmIdx = b.log.findIndex((l) => l.type === 'clearConfirmed');
    expect(b.log.slice(confirmIdx).some((l) => l.type === 'levelUp' || l.type === 'campLevelUp')).toBe(false);
  });

  test('이미 대기 중이던 선택도 클리어 확정 때 닫힌다', () => {
    const b = fresh();
    const boss = finalBoss(b);
    b.pending.push({ track: 'camp', offers: [{ kind: 'filler', id: 'gear' }, { kind: 'filler', id: 'mental' }] });
    (b as any).hitEnemy(boss, 99999, 0);
    expect(b.clearConfirmed).toBe(true);
    expect(b.paused).toBe(false);
  });

  test('필수 분열체가 남아 있으면 확정하지 않고, 마지막 분열체 처치 때 확정', () => {
    const ch: ChapterDef = { ...CHAPTER_1, rescue: undefined, waves: [CHAPTER_1.waves[0], CHAPTER_1.waves[1], { ...CHAPTER_1.waves[2], finale: 'kingDustSlime' }] };
    const b = fresh(3, undefined, ch);
    const king = finalBoss(b);
    (b as any).hitEnemy(king, 99999, 0);
    expect(b.clearConfirmed).toBe(false);
    const kids = b.enemies.filter((e) => e.role === 'minion');
    expect(kids).toHaveLength(3);
    for (const k of kids.slice(0, 2)) (b as any).hitEnemy(k, 99999, 0);
    expect(b.clearConfirmed).toBe(false);
    (b as any).hitEnemy(kids[2], 99999, 0);
    expect(b.clearConfirmed).toBe(true);
    step(b, 0.2);
    expect(b.mode).toBe('victory');
  });

  test('확정 뒤 남은 재화·재료 정산, 경험치 환산 없음, 열쇠·감옥 개방·구출 연출 후 결과', () => {
    const b = fresh();
    const boss = finalBoss(b);
    const far = (b as any).dropPickup('loot', b.player.x + 5000, 4);
    far.lootId = 'smoothStone';
    const jelly0 = b.loot.nyangJelly ?? 0;
    (b as any).hitEnemy(boss, 99999, 0);
    expect(b.clearConfirmed).toBe(true);
    expect(b.loot.smoothStone).toBeGreaterThanOrEqual(4); // 보스 드롭 포함 자동 회수
    expect(b.pickups.every((p) => p.kind === 'key')).toBe(true); // 열쇠는 기존 구출 순서
    b.damageCamp(9999); // 확정 뒤에는 패배하지 않는다
    expect(b.camp.mental).toBeGreaterThan(0);
    b.quit(); // 나가기로 결과를 바꿀 수 없다
    expect(b.mode).not.toBe('defeat');
    const order: string[] = [];
    for (let i = 0; i < 60 * 60 && !b.finished; i++) {
      b.update(DT, { jump: false, ult: null });
      const last = b.log[b.log.length - 1];
      if (last && ['key', 'jailOpen', 'victory'].includes(last.type) && order[order.length - 1] !== last.type) order.push(last.type);
    }
    expect(b.mode).toBe('victory');
    expect(order).toEqual(['key', 'jailOpen', 'victory']);
    expect(b.result().rescued).toBe('kosyot');
    // 경험치는 재화로 바뀌지 않는다
    expect((b.loot.nyangJelly ?? 0) - jelly0).toBe(b.result().loot.nyangJelly! - jelly0);
    expect(b.log.some((l) => l.type === 'levelUp' && l.t > b.log.find((x) => x.type === 'clearConfirmed')!.t)).toBe(false);
  });
});
