import { TUNING } from '../config/tuning';
import type { StatusTag } from '../data/medicines';
import type { StatusOrigin } from './status';

/**
 * 보호구 저항 적용 규칙. 확정: 지속시간 감소는 면역이 아니고, 감속 저항은 적 스킬 감속에만(지형 감속 제외).
 * 미정(TUNING.undecided): 같은 종류 합산 방식·상한(forge.combineResist), 빙결 최대시간과의 적용 순서,
 * 적 치명타 규칙, 호냥이 밀쳐내기와 캠프 동기 이동의 관계. 아래 함수는 옵션 값만 바꿔 비교할 수 있게 분리했다.
 */

export interface HeroResist { bleed: number; burn: number; freeze: number; slow: number; stun: number; knockback: number; critDamage: number }

/** 상태이상 지속시간에 보호구 저항 적용. 면역이 아니므로 결과는 항상 0보다 크다(저항 상한 < 1). */
export function resistedDuration(
  tag: StatusTag, origin: StatusOrigin, duration: number, resist: HeroResist,
  freezeOrder: 'resistThenCap' | 'capThenResist' = TUNING.undecided.resist.freezeOrder,
): number {
  let r = 0;
  if (tag === 'bleed') r = resist.bleed;
  else if (tag === 'burn') r = resist.burn;
  else if (tag === 'freeze') r = resist.freeze;
  else if (tag === 'slow' && origin === 'enemySkill') r = resist.slow; // 지형 감속 제외(확정)
  r = Math.min(r, 0.95); // 면역 아님
  if (tag === 'freeze' && freezeOrder === 'capThenResist') return Math.min(duration, TUNING.status.freezeMaxDuration) * (1 - r);
  return duration * (1 - r); // resistThenCap: 최대시간 제한은 StatusSet.apply에서
}

/** 호냥이 기절 시간(기절 거는 적·호냥이 기절 상태는 아직 없다. 헬멧 수치 확인용) */
export function heroStunDuration(duration: number, resist: HeroResist): number {
  return duration * (1 - Math.min(resist.stun, 0.95));
}

/**
 * [미정 옵션] 적 치명타. enabled=false(기본)면 원래 피해 그대로이고 난수도 쓰지 않는다.
 * 켜면 chance로 치명타, 조끼 +10 '받는 치명타 피해 감소'는 bonusOnly(추가분만)/wholeHit(치명타 피해 전체) 중 하나로 적용.
 */
export function enemyCritDamage(
  n: number, roll: () => number, critReduction: number,
  opts: { enabled: boolean; chance: number; multiplier: number; reduction: 'bonusOnly' | 'wholeHit' } = TUNING.undecided.enemyCrit,
): { dmg: number; crit: boolean } {
  if (!opts.enabled) return { dmg: n, crit: false };
  if (roll() >= opts.chance) return { dmg: n, crit: false };
  const crit = n * opts.multiplier;
  if (opts.reduction === 'wholeHit') return { dmg: crit * (1 - critReduction), crit: true };
  return { dmg: n + (crit - n) * (1 - critReduction), crit: true };
}

/**
 * [미정 옵션] 호냥이 밀쳐내기(왼쪽으로). 거리 감소 저항 적용 후,
 * campStays: 캠프는 제자리, 호냥이는 캠프 앞 최소 간격까지만 밀림(후방 통과 없음).
 * campPushed: 캠프도 같은 거리만큼 밀려 간격 유지.
 */
export function heroKnockback(
  heroX: number, campX: number, dist: number, knockbackResist: number,
  opts: { campSync: 'campStays' | 'campPushed'; minGap: number } = TUNING.undecided.heroKnockback,
): { heroX: number; campX: number; moved: number } {
  const d = Math.max(0, dist * (1 - Math.min(knockbackResist, 0.95)));
  if (opts.campSync === 'campPushed') return { heroX: heroX - d, campX: campX - d, moved: d };
  const nx = Math.max(campX + opts.minGap, heroX - d);
  return { heroX: nx, campX, moved: heroX - nx };
}
