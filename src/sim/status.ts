import { TUNING } from '../config/tuning';
import { DOT_TAGS, type DotTag, type StatusTag } from '../data/medicines';

/**
 * 호냥이 상태이상. 태그·출처·강도·시간을 따로 보관한다(확정 요구).
 *
 * 확정 규칙
 * - 같은 독/화상/출혈: 피해 중첩 없음, 강한 효과 유지, 지속 시간 갱신.
 * - 같은 빙결/감속: 강도 중첩 없이 지속 시간 갱신.
 * - 서로 다른 종류는 동시에 걸린다.
 * - 빙결 해제 뒤 짧은 재빙결 면역(시간 TEMP). 빙결 자체에도 시간 제한.
 * 미정(TEMP): 약한 효과 재적용의 연장 시간, 적에게도 같은 규칙을 쓸지.
 */

/** enemySkill: 적 기술 감속 등 치료 대상. terrain: 지형 둔화 등 치료 제외 */
export type StatusOrigin = 'enemySkill' | 'terrain';

export interface StatusEffect {
  tag: StatusTag;
  /** 건 쪽(적 이름·패턴 등) */
  source: string;
  origin: StatusOrigin;
  /** DOT: 초당 피해. 감속: 감속 비율(0.5 = 50% 느려짐). 빙결: 1 */
  intensity: number;
  remaining: number;
  /** 걸린 뒤 흐른 시간(빙결 최대 시간 판정용) */
  elapsed: number;
}

export interface StatusApply {
  tag: StatusTag;
  source: string;
  origin?: StatusOrigin;
  intensity: number;
  duration: number;
}

export type ApplyResult = 'applied' | 'stronger' | 'refreshed' | 'immune';

export class StatusSet {
  effects: StatusEffect[] = [];
  /** 재빙결 면역 남은 시간 */
  refreezeImmune = 0;

  get(tag: StatusTag, origin?: StatusOrigin): StatusEffect | undefined {
    return this.effects.find((e) => e.tag === tag && (origin === undefined || e.origin === origin));
  }

  has(tag: StatusTag): boolean { return this.effects.some((e) => e.tag === tag); }

  get frozen(): boolean { return this.has('freeze'); }

  /** 현재 이동 속도 배율(가장 강한 감속 하나만, 중첩 없음) */
  get moveMul(): number {
    const s = Math.max(0, ...this.effects.filter((e) => e.tag === 'slow').map((e) => e.intensity));
    return 1 - s;
  }

  dps(tag: DotTag): number { return this.get(tag)?.intensity ?? 0; }

  apply(a: StatusApply): ApplyResult {
    const S = TUNING.status;
    const origin = a.origin ?? 'enemySkill';
    if (a.tag === 'freeze' && this.refreezeImmune > 0) return 'immune';
    const cur = this.get(a.tag, origin);
    if (!cur) {
      const dur = a.tag === 'freeze' ? Math.min(a.duration, S.freezeMaxDuration) : a.duration;
      this.effects.push({ tag: a.tag, source: a.source, origin, intensity: a.intensity, remaining: dur, elapsed: 0 });
      return 'applied';
    }
    const cap = a.tag === 'freeze' ? S.freezeMaxDuration - cur.elapsed : Infinity;
    if (a.intensity > cur.intensity) {
      cur.intensity = a.intensity;
      cur.source = a.source;
      cur.remaining = Math.min(cap, Math.max(cur.remaining, a.duration));
      return 'stronger';
    }
    if (S.weakerRefreshes) cur.remaining = Math.min(cap, Math.max(cur.remaining, a.duration));
    return 'refreshed';
  }

  /**
   * 치료: 지정한 종류를 푼다. 감속은 적 기술 감속(enemySkill)만, 지형 둔화는 남긴다.
   * @returns 실제로 풀린 종류
   */
  cure(tags: StatusTag[]): StatusTag[] {
    const removed: StatusTag[] = [];
    this.effects = this.effects.filter((e) => {
      const hit = tags.includes(e.tag) && e.origin === 'enemySkill';
      if (hit) removed.push(e.tag);
      return !hit;
    });
    if (removed.includes('freeze')) this.refreezeImmune = TUNING.status.refreezeImmunity;
    return removed;
  }

  /** 시간 경과. 반환값은 이번 틱 DOT 피해 합(종류별 1개씩, 같은 종류 중첩 없음) */
  tick(dt: number): number {
    this.refreezeImmune = Math.max(0, this.refreezeImmune - dt);
    let dot = 0;
    let freezeEnded = false;
    for (const e of this.effects) {
      const step = Math.min(dt, e.remaining);
      if ((DOT_TAGS as StatusTag[]).includes(e.tag)) dot += e.intensity * step;
      e.remaining -= dt;
      e.elapsed += dt;
      if (e.tag === 'freeze' && e.remaining <= 0) freezeEnded = true;
    }
    this.effects = this.effects.filter((e) => e.remaining > 0);
    if (freezeEnded) this.refreezeImmune = TUNING.status.refreezeImmunity;
    return dot;
  }

  /** 코숏 약으로 풀 수 있는 현재 증상 */
  curable(): StatusTag[] {
    return [...new Set(this.effects.filter((e) => e.origin === 'enemySkill').map((e) => e.tag))];
  }

  clear(): void { this.effects = []; this.refreezeImmune = 0; }
}

/**
 * 증상별 처방 순서(확정): 빙결 → 감속 → 독/화상/출혈 중 현재 초당 피해 최대.
 * 동률 순서는 미정이라 TUNING.supports.dotTieOrder(TEMP)를 쓴다.
 */
export function prescriptionOrder(s: StatusSet): StatusTag[] {
  const cur = s.curable();
  const out: StatusTag[] = [];
  if (cur.includes('freeze')) out.push('freeze');
  if (cur.includes('slow')) out.push('slow');
  const tie = TUNING.supports.dotTieOrder as readonly DotTag[];
  const dots = DOT_TAGS.filter((t) => cur.includes(t))
    .sort((a, b) => (s.dps(b) - s.dps(a)) || (tie.indexOf(a) - tie.indexOf(b)));
  return [...out, ...dots];
}
