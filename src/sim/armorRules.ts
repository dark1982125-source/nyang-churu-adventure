import { TUNING } from '../config/tuning';
import type { StatusTag } from '../data/medicines';
import type { StatusOrigin } from './status';

/**
 * 보호구 저항 적용 규칙. 확정: 지속시간 감소는 면역이 아니고, 감속 저항은 적 스킬 감속에만(지형 감속 제외).
 * 확정(8차): 같은 상태 저항은 곱연산(forge.combineResist), 빙결은 최대시간 제한 뒤 저항으로 단축.
 * 적 치명타는 보류(꺼짐). 호냥이 밀쳐내기는 호냥이만 밀리고 캠프는 제자리.
 */

export interface HeroResist { bleed: number; burn: number; freeze: number; slow: number; stun: number; knockback: number; critDamage: number }

/**
 * 상태이상 지속시간에 보호구 저항 적용. 면역이 아니므로 결과는 항상 0보다 크다(저항 상한 < 1).
 * 빙결(확정): min(원래 시간, 최대 빙결시간) × (1 - R). 최대시간 숫자는 TEMP.
 */
export function resistedDuration(tag: StatusTag, origin: StatusOrigin, duration: number, resist: HeroResist): number {
  let r = 0;
  if (tag === 'bleed') r = resist.bleed;
  else if (tag === 'burn') r = resist.burn;
  else if (tag === 'freeze') r = resist.freeze;
  else if (tag === 'slow' && origin === 'enemySkill') r = resist.slow; // 지형 감속 제외(확정)
  r = Math.min(r, TUNING.resist.cap); // 면역 아님
  if (tag === 'freeze') return Math.min(duration, TUNING.status.freezeMaxDuration) * (1 - r);
  return duration * (1 - r);
}

/** 호냥이 기절 시간(기절 거는 적·호냥이 기절 상태는 아직 없다. 헬멧 수치 확인용) */
export function heroStunDuration(duration: number, resist: HeroResist): number {
  return duration * (1 - Math.min(resist.stun, TUNING.resist.cap));
}

/**
 * 적 치명타(보류·꺼짐). enabled=false면 원래 피해 그대로이고 난수도 쓰지 않는다.
 * 켜면 chance로 치명타, 조끼 +10 '받는 치명타 피해 감소'는 bonusOnly(추가분만)/wholeHit(치명타 피해 전체) 중 하나로 적용.
 */
export function enemyCritDamage(
  n: number, roll: () => number, critReduction: number,
  opts: { enabled: boolean; chance: number; multiplier: number; reduction: 'bonusOnly' | 'wholeHit' } = TUNING.enemyCrit,
): { dmg: number; crit: boolean } {
  if (!opts.enabled) return { dmg: n, crit: false };
  if (roll() >= opts.chance) return { dmg: n, crit: false };
  const crit = n * opts.multiplier;
  if (opts.reduction === 'wholeHit') return { dmg: crit * (1 - critReduction), crit: true };
  return { dmg: n + (crit - n) * (1 - critReduction), crit: true };
}

/** 호냥이와 캠프가 겹치지 않는 최소 중심 간격 */
export function heroCampMinGap(): number {
  return (TUNING.camp.width + TUNING.player.width) / 2 + TUNING.heroKnockback.minGapMargin;
}

/**
 * 호냥이 밀쳐내기(왼쪽으로). 확정: 호냥이만 밀리고 캠프는 제자리, 캠프와 겹치지 않는 범위까지만.
 * 밀쳐내기 저항은 밀리는 거리를 줄인다(상한 TUNING.resist.cap).
 */
export function heroKnockback(heroX: number, campX: number, dist: number, knockbackResist: number): { heroX: number; campX: number; moved: number } {
  const d = Math.max(0, dist * (1 - Math.min(knockbackResist, TUNING.resist.cap)));
  const nx = Math.max(campX + heroCampMinGap(), heroX - d);
  return { heroX: Math.min(heroX, nx), campX, moved: Math.max(0, heroX - nx) };
}
