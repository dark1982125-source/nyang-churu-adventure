import { describe, expect, test } from 'vitest';
import { heroOffers, nextStep, rollNewGrade, type RunSkills } from '../src/sim/choices';
import { GLOVE } from '../src/data/skills';
import { Rng } from '../src/sim/rng';

const empty = (): RunSkills => ({ basicLevel: 1, exclusives: [], passives: {}, camp: {} });

describe('선택지', () => {
  test('등급 진행: 일반 Lv1~3 → 유니크 Lv1~3 → 전설, 전설 이후 없음', () => {
    const seq: string[] = [];
    let cur: { grade: any; level: number } | null = { grade: 'normal', level: 1 };
    while (cur) { seq.push(`${cur.grade}${cur.level}`); cur = nextStep(cur.grade, cur.level); }
    expect(seq).toEqual(['normal1', 'normal2', 'normal3', 'unique1', 'unique2', 'unique3', 'legend1']);
  });

  test('전용 슬롯 3칸이 차면 미보유 전용 기술은 후보에서 제외', () => {
    const s = empty();
    s.exclusives = [
      { id: 'udada', grade: 'normal', level: 1 },
      { id: 'uppercut', grade: 'normal', level: 1 },
      { id: 'straight', grade: 'normal', level: 1 },
    ];
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      for (const o of heroOffers(s, GLOVE, 0, rng)) {
        if (o.kind === 'exclusive') expect(['udada', 'uppercut', 'straight']).toContain(o.id);
      }
    }
  });

  test('항상 3개, 서로 다른 후보', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 100; i++) {
      const offers = heroOffers(empty(), GLOVE, 0, rng);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => JSON.stringify({ k: o.kind, id: (o as any).id }))).size).toBe(3);
    }
  });

  test('기본 공격은 최대 레벨(TEMP)에 도달하면 후보에서 빠진다', () => {
    const s = empty();
    s.basicLevel = 5;
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) expect(heroOffers(s, GLOVE, 0, rng).some((o) => o.kind === 'basic')).toBe(false);
  });

  test('행운이 높을수록 새 기술의 유니크/전설 직접 제시가 늘어난다', () => {
    const count = (luck: number) => {
      const rng = new Rng(9);
      let rare = 0;
      for (let i = 0; i < 5000; i++) if (rollNewGrade(rng, luck).grade !== 'normal') rare++;
      return rare;
    };
    expect(count(10)).toBeGreaterThan(count(0) * 1.5);
  });

  test('유니크 직접 획득은 Lv.1', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 2000; i++) {
      const g = rollNewGrade(rng, 20);
      if (g.grade === 'unique') expect(g.level).toBe(1);
    }
  });
});
