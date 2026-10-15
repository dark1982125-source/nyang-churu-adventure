import { TUNING, type Grade } from '../config/tuning';
import { CAMP_SKILLS, PASSIVES, type CampSkillId, type ExclusiveSkillId, type PassiveId, type WeaponDef } from '../data/skills';
import type { Rng } from './rng';

/** 판 안 임시 성장 상태. 판 종료 시 통째로 버린다. */
export interface OwnedExclusive { id: ExclusiveSkillId; grade: Grade; level: number }

export interface RunSkills {
  basicLevel: number;
  exclusives: OwnedExclusive[];
  passives: Partial<Record<PassiveId, number>>;
  camp: Partial<Record<CampSkillId, number>>;
}

/** 대체 보상: 후보가 부족한 칸만 채운다. 종류 확정(호냥이 3종·캠프 2종), 양 TEMP. 슬롯 없음·즉시 적용. */
export type HeroFillerId = 'jelly' | 'heal' | 'energy';
export type CampFillerId = 'gear' | 'mental';
export type FillerOffer = { kind: 'filler'; id: HeroFillerId | CampFillerId };

export type HeroOffer =
  | { kind: 'basic'; nextLevel: number }
  | { kind: 'exclusive'; id: ExclusiveSkillId; isNew: boolean; grade: Grade; level: number }
  | { kind: 'passive'; id: PassiveId; nextLevel: number }
  | FillerOffer;

export type CampOffer = { kind: 'camp'; id: CampSkillId; nextLevel: number } | FillerOffer;

export type Offer = HeroOffer | CampOffer;

export interface PendingChoice {
  track: 'hero' | 'camp';
  offers: Offer[];
}

/** 일반 Lv.1~3 → 유니크 Lv.1~3 → 전설(최종) 순서 */
const STEPS: { grade: Grade; level: number }[] = [
  { grade: 'normal', level: 1 }, { grade: 'normal', level: 2 }, { grade: 'normal', level: 3 },
  { grade: 'unique', level: 1 }, { grade: 'unique', level: 2 }, { grade: 'unique', level: 3 },
  { grade: 'legend', level: 1 },
];

export function stepIndex(grade: Grade, level: number): number {
  return STEPS.findIndex((s) => s.grade === grade && s.level === level);
}

export function nextStep(grade: Grade, level: number): { grade: Grade; level: number } | null {
  const i = stepIndex(grade, level);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

export function luckChances(luck: number): { unique: number; legend: number } {
  const L = TUNING.luck;
  return {
    unique: Math.min(L.uniqueCap, L.baseUniqueChance + luck * L.uniquePerLuck),
    legend: Math.min(L.legendCap, L.baseLegendChance + luck * L.legendPerLuck),
  };
}

/** 새 전용 기술 후보의 등급 추첨. 유니크 직접 획득은 Lv.1, 전설은 최종 완성. */
export function rollNewGrade(rng: Rng, luck: number): { grade: Grade; level: number } {
  const c = luckChances(luck);
  const r = rng.next();
  if (r < c.legend) return { grade: 'legend', level: 1 };
  if (r < c.legend + c.unique) return { grade: 'unique', level: 1 };
  return { grade: 'normal', level: 1 };
}

export function heroOffers(skills: RunSkills, weapon: WeaponDef, luck: number, rng: Rng): HeroOffer[] {
  const pool: HeroOffer[] = [];
  if (skills.basicLevel < TUNING.basicAttack.maxLevel) pool.push({ kind: 'basic', nextLevel: skills.basicLevel + 1 });

  const slotsFull = skills.exclusives.length >= TUNING.growth.exclusiveSlots;
  for (const def of weapon.exclusives) {
    const owned = skills.exclusives.find((e) => e.id === def.id);
    if (owned) {
      // 미정: 보유 기술의 상위 등급 직접 제시·중복 처리. 지금은 한 단계씩만 올린다.
      const nxt = nextStep(owned.grade, owned.level);
      if (nxt) pool.push({ kind: 'exclusive', id: def.id, isNew: false, ...nxt });
    } else if (!slotsFull) {
      // 슬롯이 차면 미보유 전용 기술은 후보에서 제외(확정)
      pool.push({ kind: 'exclusive', id: def.id, isNew: true, ...rollNewGrade(rng, luck) });
    }
  }

  const passiveIds = Object.keys(PASSIVES) as PassiveId[];
  const ownedPassiveCount = passiveIds.filter((p) => (skills.passives[p] ?? 0) > 0).length;
  const limit = TUNING.growth.passiveSlotLimit;
  for (const p of passiveIds) {
    const lvl = skills.passives[p] ?? 0;
    if (lvl >= TUNING.growth.passiveMaxLevel) continue;
    if (lvl === 0 && ownedPassiveCount >= limit) continue;
    pool.push({ kind: 'passive', id: p, nextLevel: lvl + 1 });
  }

  rng.shuffle(pool);
  const picked: HeroOffer[] = pool.slice(0, 3);
  // 성장 후보를 먼저 채우고, 부족한 칸만 대체 보상(서로 다른 종류)
  const fillers = rng.shuffle<HeroFillerId>(['jelly', 'heal', 'energy']);
  for (let k = 0; picked.length < 3; k++) picked.push({ kind: 'filler', id: fillers[k] });
  return picked;
}

/**
 * 캠프 후보(캠프보상-전환-클리어-확정 §1, 확정): 해당 판 임시 강화. 강화 가능한 서로 다른 기술을 먼저 최대 3개,
 * 부족한 칸만 골골기어/캠프 체력(멘탈) 즉시 회복으로 채운다. 중복·빈칸·새 혼합 보상 없음 → 유효 선택지가 2개면 2장.
 * 캠프 체력이 최대면 회복 카드 제외. 골골기어만 남으면 선택창 없이 자동 지급(Battle에서 처리).
 * 기술 2개일 때 남는 한 칸에 기어/회복 중 무엇을 보일지는 문서에 없어 무작위(TEMP).
 */
export function campOffers(skills: RunSkills, available: CampSkillId[], rng: Rng, campFull = false): CampOffer[] {
  const pool: CampOffer[] = [];
  for (const id of available) {
    const lvl = skills.camp[id] ?? 0;
    if (lvl >= TUNING.growth.campSkillMaxLevel) continue;
    pool.push({ kind: 'camp', id, nextLevel: lvl + 1 });
  }
  rng.shuffle(pool);
  const picked = pool.slice(0, 3);
  const fillers = rng.shuffle<CampFillerId>(campFull ? ['gear'] : ['gear', 'mental']);
  for (let k = 0; picked.length < 3 && k < fillers.length; k++) picked.push({ kind: 'filler', id: fillers[k] });
  return picked;
}

/** 골골기어 하나만 남은 캠프 후보 → 선택창 없이 자동 지급 */
export function isAutoGrant(offers: Offer[]): boolean {
  return offers.length === 1 && offers[0].kind === 'filler' && offers[0].id === 'gear';
}

export const FILLER_LABELS: Record<HeroFillerId | CampFillerId, { title: string; detail: () => string }> = {
  jelly: { title: '냥젤리', detail: () => `냥젤리 +${TUNING.fillers.heroJelly} (판 획득물, TEMP 양)` },
  heal: { title: '츄르 한 입', detail: () => `HP ${TUNING.fillers.heroHeal} 즉시 회복 (TEMP 양)` },
  energy: { title: '기운 충전', detail: () => `냥기력 ${TUNING.fillers.heroEnergy} 즉시 회복 (TEMP 양)` },
  gear: { title: '골골기어', detail: () => `골골기어 +${TUNING.fillers.campGear} (판 획득물, TEMP 양)` },
  mental: { title: '캠프 체력 회복', detail: () => `캠프 멘탈 ${TUNING.fillers.campMental} 즉시 회복 (TEMP 양)` },
};

export function offerLabel(o: Offer, weapon: WeaponDef): { title: string; detail: string } {
  const gradeName = (g: Grade) => (g === 'normal' ? '일반' : g === 'unique' ? '유니크' : '전설');
  switch (o.kind) {
    case 'basic':
      return { title: `${weapon.basicAttack.name} Lv.${o.nextLevel}`, detail: `기본 공격 강화 (무소모, 최대 Lv.${TUNING.basicAttack.maxLevel} TEMP)` };
    case 'exclusive': {
      const def = weapon.exclusives.find((e) => e.id === o.id)!;
      const lv = o.grade === 'legend' ? '' : ` Lv.${o.level}`;
      return { title: `${def.name} [${gradeName(o.grade)}${lv}]${o.isNew ? ' NEW' : ''}`, detail: def.desc };
    }
    case 'passive':
      return { title: `${PASSIVES[o.id].name} Lv.${o.nextLevel}/${TUNING.growth.passiveMaxLevel}`, detail: `${PASSIVES[o.id].desc}${o.nextLevel === 1 ? ' (NEW, 공통 패시브)' : ''}` };
    case 'filler':
      return { title: `${FILLER_LABELS[o.id].title} (대체 보상)`, detail: `${FILLER_LABELS[o.id].detail()} · 슬롯 없이 즉시 적용` };
    case 'camp':
      return { title: `${CAMP_SKILLS[o.id].name} Lv.${o.nextLevel}/${TUNING.growth.campSkillMaxLevel}`, detail: CAMP_SKILLS[o.id].desc };
  }
}
