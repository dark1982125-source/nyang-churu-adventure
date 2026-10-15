import { TUNING, type PassPolicy } from '../config/tuning';
import { CHAPTER_1, requiredKillCount, type ChapterDef } from '../data/chapters';
import { BOSS_PATTERNS, ENEMIES, ROLL_PATTERN, type EnemyCcKind, type EnemyDef, type EnemyKind } from '../data/enemies';
import { MEDICINES, MEDICINE_FOR, STATUS_NAMES, type DotTag, type MedicineId } from '../data/medicines';
import type { LootId } from '../data/items';
import { COMPANIONS, type CompanionId } from '../data/companions';
import { GLOVE, ULTIMATES, type CampSkillId, type ExclusiveSkillDef, type PassiveId, type UltimateId, type WeaponDef } from '../data/skills';
import type { Loadout } from '../meta/save';
import {
  campOffers, heroOffers, isAutoGrant, type FillerOffer, type Offer, type PendingChoice, type RunSkills,
} from './choices';
import { Rng } from './rng';
import { enemyCritDamage, heroCampMinGap, heroKnockback, resistedDuration } from './armorRules';
import { prescriptionOrder, StatusSet, type StatusApply } from './status';

/**
 * 한 판(챕터 1개)의 전투 시뮬레이션. Phaser와 분리된 순수 로직이라
 * 테스트에서 화면 없이 끝까지 돌릴 수 있다. 좌표: x는 오른쪽이 +, y는 지면(0)에서 위로 +.
 */

/** 플레이어 입력. 전진은 자동(확정)이라 전진 입력이 없다. */
export interface InputState {
  /** 점프(이번 틱에 눌렸으면 true) */
  jump: boolean;
  /** 궁극기 슬롯 번호(0~2), 없으면 null */
  ult: number | null;
}

export const NO_INPUT: InputState = { jump: false, ult: null };

export type Mode = 'travel' | 'wave' | 'toJail' | 'opening' | 'revealed' | 'victory' | 'defeat';
export type DefeatCause = 'hero' | 'camp' | 'quit';
/**
 * 피해 구분 태그. direct(접촉·근접·투사체·폭발)에만 회피·방어력이 적용된다.
 * dot(독·화상·출혈)·terrain(용암·위험지형 지속 피해)은 회피·방어·치명타 제외.
 */
export type DamageKind = 'direct' | 'dot' | 'terrain';
/** 호냥이 공격 출처. 공격력/스킬 피해 패시브 적용 범위가 다르다 */
export type AttackSource = 'basic' | 'skill' | 'ult';

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  vy: number;
  hp: number;
  wave: number;
  /** 지정 처치 대상(일반 구간 잡몹·엘리트/보스 본체). 분열·소환체는 false */
  required: boolean;
  /** normal: 일반 구간 잡몹, finale: 엘리트/보스 본체, minion: 분열·소환체 */
  role: 'normal' | 'finale' | 'minion';
  parentId: number | null;
  generation: number;
  contactCd: number;
  /** 행동 정지(수면·기절·빙결) 남은 시간. 보스는 걸리지 않는다(짧은 감속으로 대체) */
  cc: number;
  ccKind: EnemyCcKind | null;
  /** 감속 남은 시간과 속도 배율 */
  slow: number;
  slowMul: number;
  /** 적 지속 피해(전 등급 적용). 같은 종류는 강한 쪽 유지·시간 갱신 */
  dots: { tag: DotTag; dps: number; remaining: number; source: string }[];
  /** 캠프 조준 적: 던진 횟수 */
  shots: number;
  passed: boolean;
  /** 패턴 상태 */
  state: 'walk' | 'telegraph' | 'roll' | 'stomp' | 'throw' | 'hop' | 'aim';
  stateTimer: number;
  cdA: number;
  cdB: number;
  rollTarget: number;
  hopTimer: number;
  flash: number;
}

export interface Hazard {
  /**
   * shockwave: 지면 충격파(점프 회피). bigRock: 보스가 캠프로 던지는 큰 돌(공중 펀치로 파괴).
   * campShot: 캠프 위협 시험 적의 캠프 조준 투사체(펀치·기술·몸으로 요격).
   */
  kind: 'shockwave' | 'bigRock' | 'campShot';
  /** campShot 궤적: lob(지상 투척) / drop(공중 투하) */
  style?: 'lob' | 'drop';
  maxHp: number;
  /** 진행 시간(초) */
  duration: number;
  startY: number;
  endY: number;
  arc: number;
  x: number;
  y: number;
  vx: number;
  /** bigRock: 진행도 0~1 */
  progress: number;
  startX: number;
  targetX: number;
  radius: number;
  damage: number;
  hp: number;
  hitPlayer: boolean;
  done: boolean;
}

export type PickupKind = 'catnip' | 'gear' | 'loot' | 'bell' | 'key' | 'capsule' | 'medicine';
export interface Pickup {
  id: number;
  kind: PickupKind;
  lootId?: LootId;
  medId?: MedicineId;
  x: number;
  y: number;
  vy: number;
  age: number;
  lifetime: number | null;
  value: number;
}

export interface Effect {
  kind: 'hit' | 'zone' | 'beam' | 'telegraph' | 'text' | 'laser' | 'banner' | 'shield' | 'ult' | 'aim' | 'dropMark';
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  ttl: number;
  maxTtl: number;
  text?: string;
  color?: number;
}

export interface LogEntry {
  t: number;
  type:
    | 'waveStart' | 'waveClear' | 'eliteSpawn' | 'kill' | 'split' | 'pass' | 'outOfBounds' | 'missedPickup'
    | 'levelUp' | 'campLevelUp' | 'skill' | 'ult' | 'revive' | 'bell' | 'key' | 'jailOpen' | 'victory' | 'defeat'
    | 'evade' | 'crit' | 'enemyCrit' | 'rockBroken' | 'rockHitCamp' | 'loot' | 'cleanup' | 'quit' | 'filler'
    | 'status' | 'statusImmune' | 'cure' | 'prescribe' | 'enemyCc' | 'shotBroken' | 'shotHitCamp' | 'autoCollect'
    | 'transition' | 'finaleIntro' | 'clearConfirmed';
  detail?: string;
  value?: number;
}

interface ScheduledHit {
  at: number;
  skill: ExclusiveSkillDef;
  /** chain: 그 시점 가장 가까운 전방 적 1명 */
  chainRange?: number;
  area?: { x1: number; x2: number; y1: number; y2: number };
  damage: number;
  stun: number;
}

export interface WaveRuntime {
  started: boolean;
  cleared: boolean;
  /** normal: 잡몹 계속 생성, finale: 엘리트/보스 구간 */
  phase: 'normal' | 'finale';
  /** 일반 구간 처치 수(목표 카운트) */
  normalKills: number;
  spawnTimer: number;
  finaleSpawned: boolean;
  finaleId: number | null;
  /** 목표 달성 후 처치·보상 없이 제거한 잔여 잡몹 수 */
  cleanedUp: number;
}

export interface RunResult {
  runId: number;
  chapterId: number;
  outcome: 'victory' | 'defeat';
  defeatCause: DefeatCause | null;
  /** 실제로 수집한 영구 재화·재료만 들어 있다 */
  loot: Partial<Record<LootId, number>>;
  rescued: CompanionId | null;
  time: number;
  kills: { required: number; requiredTotal: number; children: number };
  heroLevel: number;
}

export interface BattleOptions {
  runId: number;
  seed: number;
  loadout: Loadout;
  chapter?: ChapterDef;
  weapon?: WeaponDef;
  /** 테스트용 강제 다시냥 방울 드롭 */
  forceBellDrop?: boolean;
}

/** 패시브와 출격 능력치를 합친 현재 판의 호냥이 수치 */
export interface HeroStats {
  attackMul: number;
  skillDamageMul: number;
  basicInterval: number;
  critChance: number;
  critMultiplier: number;
  /** 표시용 초당 환산 회복량(= 틱당 회복량 / 틱 간격). 실제 회복은 틱 단위 */
  hpRegen: number;
  /** 자연 회복 틱 간격(초). 회복 수단이 없으면 Infinity */
  regenInterval: number;
  /** 합산 방어력(영구 + 장비 + 판 임시) */
  defense: number;
  /** 직접 피해 배율 = 100/(100+방어력) */
  damageTaken: number;
  evasion: number;
  energyRegen: number;
  luck: number;
  pickupRadius: number;
  cooldownMul: number;
}

export class Battle {
  readonly chapter: ChapterDef;
  readonly weapon: WeaponDef;
  readonly loadout: Loadout;
  readonly runId: number;
  readonly rng: Rng;
  passPolicy: PassPolicy;
  /** 교전 정차 중(전방 적이 기본 공격 유효 사거리 안). 일반 구간 자동 전진을 멈춘다 */
  engaged = false;
  /** 웨이브 시작 지점(실행 중 갱신: 다음 웨이브는 앞 웨이브를 정리한 지점 + 이동 거리) */
  waveX: number[];
  /** 감옥 위치(실행 중 갱신: 마지막 보스 처치 지점 + 거리) */
  jailX: number;

  t = 0;
  mode: Mode = 'travel';
  defeatCause: DefeatCause | null = null;
  modeTimer = 0;

  player = {
    x: 160, y: 0, vy: 0, hp: 0, maxHp: 0, invuln: 0,
    energy: TUNING.player.maxEnergy as number, maxEnergy: TUNING.player.maxEnergy as number,
    basicTimer: 0, attackAnim: 0, maxXReached: 160, hurt: 0,
    /** 밀쳐내기 경직 남은 시간 */
    stagger: 0,
    /** 자연 회복 틱 누적 시간(최대 HP면 0으로, 저축 없음) */
    regenTimer: 0,
  };
  camp = { x: 0, mental: 0, maxMental: 0, shield: 0, moving: false };

  heroLevel = 1;
  heroXp = 0;
  campLevel = 1;
  campXp = 0;
  ultGauge = 0;
  hasBell = false;
  revivesUsed = 0;
  hasKey = false;
  slowAll = 0;
  /** 호냥이 상태이상 */
  heroStatus = new StatusSet();
  /** 판 임시 방어 보너스(패시브 외 판 안 효과용, 지금은 0) */
  runDefenseBonus = 0;
  /** 클리어 확정 뒤 회수된 경험치. 확정: 레벨업·선택창 없이, 다른 재화로 환산하지 않고 기록만 한다 */
  autoCollectedXp = { hero: 0, camp: 0 };
  /** 호냥이 뒤로 놓친 재화·재료·경험치. 성공 시 자동 회수 대상(TEMP 해석), 실패 시 사라진다 */
  behindDrops: Pickup[] = [];
  /**
   * 챕터 클리어 확정(최종 보스와 필수 분열·소환체 전멸 순간). 이후 레벨업 선택·패배 판정 없음,
   * 경험치는 다른 재화로 환산하지 않고 기록만 한다.
   */
  clearConfirmed = false;
  /** 엘리트/보스 등장 연출 남은 시간. 이 동안 전투 시간·쿨타임·지속시간 전부 정지 */
  introTimer = 0;
  private introWave = -1;

  skills: RunSkills = { basicLevel: 1, exclusives: [], passives: {}, camp: {} };
  skillCd: Record<string, number> = {};
  pending: PendingChoice[] = [];

  enemies: Enemy[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  effects: Effect[] = [];
  log: LogEntry[] = [];
  loot: Partial<Record<LootId, number>> = {};

  waveIndex = 0;
  waves: WaveRuntime[];
  rightLimit: number;
  killsRequired = 0;
  readonly requiredTotal: number;
  childrenSpawned = 0;
  childrenKilled = 0;

  private nextId = 1;
  private scheduled: ScheduledHit[] = [];
  private supportTimers = { barrier: 2, laser: 1.5, capsule: 6, prescription: 1.5 };
  private panaceaCd = 0;
  private forceBellDrop: boolean;

  constructor(opts: BattleOptions) {
    this.chapter = opts.chapter ?? CHAPTER_1;
    this.weapon = opts.weapon ?? GLOVE;
    this.loadout = opts.loadout;
    this.runId = opts.runId;
    this.rng = new Rng(opts.seed);
    this.passPolicy = opts.loadout.passPolicy;
    this.forceBellDrop = opts.forceBellDrop ?? false;

    this.player.maxHp = this.player.hp = opts.loadout.maxHp;
    this.camp.maxMental = this.camp.mental = opts.loadout.campMaxMental;
    this.camp.x = this.player.x - TUNING.camp.followGap;
    this.requiredTotal = requiredKillCount(this.chapter);

    this.waves = this.chapter.waves.map(() => ({
      started: false, cleared: false, phase: 'normal' as const, normalKills: 0, spawnTimer: 0.6, finaleSpawned: false, finaleId: null, cleanedUp: 0,
    }));
    this.waveX = this.chapter.waves.map((w) => w.triggerX);
    this.jailX = this.chapter.rescue?.jailX ?? 0;
    this.rightLimit = this.waveX[0];

    if (this.chapter.rescue) {
      this.banner('저 멀리 무언가 갇혀 있다… 동료 발견! 보스를 물리치고 감옥 열쇠를 획득하세요.', 4);
    }
  }

  // ───────────────────────── 조회용

  get paused(): boolean { return this.pending.length > 0; }
  get finished(): boolean { return this.mode === 'victory' || this.mode === 'defeat'; }
  get heroXpNeeded(): number { return TUNING.growth.heroXpCurve(this.heroLevel); }
  get campXpNeeded(): number { return TUNING.growth.campXpCurve(this.campLevel); }
  get grounded(): boolean { return this.player.y <= 0; }
  get rescued(): CompanionId[] { return this.loadout.rescued; }
  get luck(): number { return this.stats().luck; }

  passiveLevel(id: PassiveId): number { return this.skills.passives[id] ?? 0; }

  stats(): HeroStats {
    const P = TUNING.passives;
    const lv = (id: PassiveId) => this.passiveLevel(id);
    const B = TUNING.basicAttack;
    const basicBase = Math.max(0.2, B.interval - B.intervalPerLevel * (this.skills.basicLevel - 1));
    // 액세서리(출격 시 계산)는 판 안 패시브와 합친 뒤 상한(TEMP) 적용. 세트 보너스 없음.
    const A = this.loadout.accessory;
    const AC = TUNING.accessory.caps;
    // 자연 회복(확정 8차): 틱당 회복량은 고정, 회복 속도는 틱 간격으로만 바뀐다.
    // 회복 패시브: 레벨별 초당 회복량을 간격으로 환산. 햇살 방울 브로치: 단독으로 느린 회복, 패시브가 있으면 간격 추가 단축.
    const R = TUNING.regen;
    const passiveRate = P.hpRegen * lv('hpRegen');
    let regenBase = passiveRate > 0 ? R.tickHeal / passiveRate : Infinity;
    if (A.regenInterval > 0) regenBase = Math.min(regenBase, R.broochSoloInterval);
    const regenInterval = regenBase * (1 - Math.min(AC.regenInterval, A.regenInterval));
    return {
      attackMul: this.loadout.damageMul * this.loadout.weaponAttackMul * (1 + P.attack * lv('attack') + A.attack),
      skillDamageMul: 1 + P.skillDamage * lv('skillDamage'),
      basicInterval: basicBase * (1 - Math.min(AC.attackSpeed, P.attackSpeed * lv('attackSpeed') + A.attackSpeed)),
      critChance: Math.min(P.caps.critChance, TUNING.player.baseCritChance + P.critChance * lv('critChance') + A.critChance),
      critMultiplier: TUNING.player.baseCritMultiplier + P.critDamage * lv('critDamage') + A.critDamage,
      hpRegen: Number.isFinite(regenInterval) ? R.tickHeal / regenInterval : 0,
      regenInterval,
      defense: this.totalDefense(),
      damageTaken: 100 / (100 + this.totalDefense()),
      // 보호구 회피(스니커)와 판 안 회피 패시브를 합쳐 상한(미정, TEMP) 적용
      evasion: Math.min(P.caps.evasion, this.loadout.armor.evasion + P.evasion * lv('evasion')),
      energyRegen: TUNING.player.energyRegen * (1 + Math.min(AC.energyRegen, P.energyRegen * lv('energyRegen') + A.energyRegen)),
      luck: this.loadout.baseLuck + P.luck * lv('luck'),
      pickupRadius: TUNING.pickups.magnetRadius * (1 + P.pickupRadius * lv('pickupRadius')),
      cooldownMul: 1 - Math.min(P.caps.cooldown, P.cooldown * lv('cooldown') + A.cooldown),
    };
  }

  /** 최종 방어력 = 영구 스탯 + 장비(출격 시 loadout) + 판 임시 보너스(패시브 포함). 음수 방어는 미정 → 0으로 자름(TEMP) */
  totalDefense(): number {
    const d = this.loadout.defense + TUNING.passives.defense * this.passiveLevel('defense') + this.runDefenseBonus;
    return Math.max(TUNING.defense.minDefense, d);
  }

  /** 남은 지정 처치 대상(스폰 대기 포함) */
  get requiredRemaining(): number { return this.requiredTotal - this.killsRequired; }
  /** 살아 있는 분열·소환체 수(엘리트/보스 부하 잔여). 표시 형식은 미정. */
  get childrenAlive(): number { return this.enemies.filter((e) => e.role === 'minion').length; }

  /** 현재 웨이브 일반 구간 목표 카운트 */
  normalProgress(i = this.waveIndex): { kills: number; target: number } {
    const def = this.chapter.waves[Math.min(i, 2)];
    return { kills: this.waves[Math.min(i, 2)].normalKills, target: def.normal.killTarget };
  }

  /** 웨이브를 끝내려면 남은 처치 수(일반 구간 목표 잔여 + 본체 + 살아 있는 부하) */
  waveRemaining(i: number): number {
    const w = this.waves[i];
    const def = this.chapter.waves[i];
    const normalLeft = Math.max(0, def.normal.killTarget - w.normalKills);
    const finaleAlive = this.enemies.filter((e) => e.wave === i && e.role !== 'normal').length;
    return normalLeft + (w.finaleSpawned ? 0 : 1) + finaleAlive;
  }

  result(): RunResult {
    return {
      runId: this.runId,
      chapterId: this.chapter.id,
      outcome: this.mode === 'victory' ? 'victory' : 'defeat',
      defeatCause: this.defeatCause,
      loot: { ...this.loot },
      rescued: this.mode === 'victory' && this.chapter.rescue ? this.chapter.rescue.companion : null,
      time: this.t,
      kills: { required: this.killsRequired, requiredTotal: this.requiredTotal, children: this.childrenKilled },
      heroLevel: this.heroLevel,
    };
  }

  // ───────────────────────── 선택창

  /**
   * 선택 대기열. 확정: 호냥이 선택부터, 그다음 캠프. 후보는 그 선택 차례가 올 때 현재 보유·레벨로 만든다.
   * 대기열이 비면 전투 재개. 선택 중에는 update()가 아무것도 진행하지 않아 전투 시간 전체가 멈춘다.
   */
  choose(index: number): void {
    const p = this.pending[0];
    if (!p) return;
    const o = p.offers[Math.max(0, Math.min(index, p.offers.length - 1))];
    this.applyOffer(o);
    this.pending.shift();
    this.activateNextChoice();
  }

  private queueChoice(track: 'hero' | 'camp'): void {
    // 챕터 클리어가 확정된 뒤에는 레벨업 선택을 띄우지 않는다
    if (this.clearConfirmed) return;
    this.pending.push({ track, offers: [] });
    // 현재 열린 선택창은 그대로 두고, 대기 중인 것만 호냥이 → 캠프 순으로 정렬
    const [head, ...rest] = this.pending;
    if (head.offers.length > 0) {
      rest.sort((a, b) => (a.track === b.track ? 0 : a.track === 'hero' ? -1 : 1));
      this.pending = [head, ...rest];
    } else {
      this.pending.sort((a, b) => (a.track === b.track ? 0 : a.track === 'hero' ? -1 : 1));
      this.activateNextChoice();
    }
  }

  private activateNextChoice(): void {
    for (;;) {
      const p = this.pending[0];
      if (!p || p.offers.length > 0) return;
      p.offers = p.track === 'hero'
        ? heroOffers(this.skills, this.weapon, this.luck, this.rng)
        : campOffers(this.skills, this.availableCampSkills(), this.rng, this.camp.mental >= this.camp.maxMental);
      // 확정: 캠프 후보가 골골기어 하나뿐이면 선택창 없이 자동 지급하고 다음 차례로
      if (!isAutoGrant(p.offers)) return;
      this.applyFiller('gear', true);
      this.pending.shift();
    }
  }

  private applyOffer(o: Offer): void {
    const s = this.skills;
    const P = TUNING.passives;
    switch (o.kind) {
      case 'basic': s.basicLevel = o.nextLevel; break;
      case 'exclusive': {
        const owned = s.exclusives.find((e) => e.id === o.id);
        if (owned) { owned.grade = o.grade; owned.level = o.level; }
        else { s.exclusives.push({ id: o.id, grade: o.grade, level: o.level }); this.skillCd[o.id] = 0.5; }
        break;
      }
      case 'passive':
        s.passives[o.id] = o.nextLevel;
        // 최대치 증가분만큼 현재치도 증가(완전 회복 아님)
        if (o.id === 'maxHp') { this.player.maxHp += P.maxHp; this.player.hp += P.maxHp; }
        if (o.id === 'maxEnergy') { this.player.maxEnergy += P.maxEnergy; this.player.energy += P.maxEnergy; }
        break;
      case 'filler': this.applyFiller(o.id); break;
      case 'camp': s.camp[o.id] = o.nextLevel; break;
    }
  }

  /** 대체 보상 즉시 적용. 상한을 넘지 않는다. 재화는 판 획득물로 들어가 정산된다. */
  private applyFiller(id: FillerOffer['id'], auto = false): void {
    const F = TUNING.fillers;
    const p = this.player;
    if (id === 'jelly') this.loot.nyangJelly = (this.loot.nyangJelly ?? 0) + F.heroJelly;
    else if (id === 'heal') p.hp = Math.min(p.maxHp, p.hp + F.heroHeal);
    else if (id === 'energy') p.energy = Math.min(p.maxEnergy, p.energy + F.heroEnergy);
    else if (id === 'gear') this.loot.golgolGear = (this.loot.golgolGear ?? 0) + F.campGear;
    else this.camp.mental = Math.min(this.camp.maxMental, this.camp.mental + F.campMental);
    this.logEvent('filler', auto ? `${id}:auto` : id);
  }

  private availableCampSkills(): CampSkillId[] {
    // 처음부터 동행하는 지원 동료 + 구출해 합류한 전투 지원 동료. 슬롯 제한 없음.
    const list: CampSkillId[] = ['barrier', 'laser'];
    // 구출한 동료만 다음 출격부터 지원. 미래 동료는 활성화하지 않는다.
    // 닥터 코숏: 캣닢 캡슐(HP)과 증상별 처방 두 갈래
    if (this.loadout.rescued.includes('kosyot')) list.push('capsule', 'prescription');
    return list;
  }

  // ───────────────────────── 메인 루프

  update(dtRaw: number, input: InputState): void {
    if (this.finished || this.paused) return;
    const dt = Math.min(dtRaw, 1 / 20);
    // 엘리트/보스 등장 연출: 전투 시간·쿨타임·지속시간 정지. 배너 연출만 흐른다.
    if (this.introTimer > 0) {
      this.introTimer -= dt;
      for (const e of this.effects) if (e.kind === 'banner') e.ttl -= dt;
      this.effects = this.effects.filter((e) => e.ttl > 0);
      if (this.introTimer <= 0) this.spawnFinale(this.introWave);
      return;
    }
    this.t += dt;
    this.tickEffects(dt);

    if (this.mode === 'opening' || this.mode === 'revealed') {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) {
        if (this.mode === 'opening') {
          this.mode = 'revealed';
          this.modeTimer = 3;
          const name = this.chapter.rescue ? COMPANIONS[this.chapter.rescue.companion].name : '';
          this.banner(`${name}을(를) 구출했습니다!`, 3);
          this.logEvent('jailOpen', name);
        } else {
          this.finish('victory');
        }
      }
      return;
    }

    const st = this.stats();
    this.updatePlayer(dt, input, st);
    this.updateCamp(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateHazards(dt);
    this.updateCombat(dt, st);
    this.updateSupports(dt);
    this.updatePickups(dt, st);
    if (input.ult !== null) this.useUltimate(input.ult);
    this.checkDefeat();
    this.checkJail();
  }

  private updatePlayer(dt: number, input: InputState, st: HeroStats): void {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.attackAnim = Math.max(0, p.attackAnim - dt);
    // 상태이상: 독·화상·출혈 지속 피해는 회피·방어·무적 시간과 무관하게 들어간다(DOT 태그)
    const dot = this.heroStatus.tick(dt);
    if (dot > 0) this.damagePlayer(dot, 'dot');
    const frozen = this.heroStatus.frozen;
    // 기력: 기본 자연 회복 + 패시브 가속
    p.energy = Math.min(p.maxEnergy, p.energy + st.energyRegen * dt);
    // HP 자연 회복: 틱 방식. 최대 HP일 때는 시간을 쌓지 않아 피격 직후 몰아서 회복하지 않는다.
    if (Number.isFinite(st.regenInterval) && p.hp > 0 && p.hp < p.maxHp) {
      p.regenTimer += dt;
      if (p.regenTimer >= st.regenInterval) {
        p.regenTimer -= st.regenInterval;
        p.hp = Math.min(p.maxHp, p.hp + TUNING.regen.tickHeal);
      }
    } else p.regenTimer = 0;

    // 자동 전진(확정): 일반 구간·이동 구간에서 캠프와 함께 오른쪽으로 전진. 기본 공격이 닿는 전방 적이 있으면
    // 함께 정차해 싸우고, 가까운 적을 정리하면 재개(재개 판정 여유 TEMP). 엘리트/보스 구간도 같은 방식(10차):
    // 기본 공격이 닿을 때까지 함께 다가가고, 적이 물러나거나 호냥이가 밀려나면 다시 다가간다.
    p.stagger = Math.max(0, p.stagger - dt);
    this.updateEngage();
    // 밀쳐내기 뒤에는 경직이 끝나면 원래 호위 위치까지 먼저 복귀(그동안 캠프는 제자리)
    const escortX = this.camp.x + TUNING.camp.followGap;
    const returning = p.x < escortX - 0.5;
    let wantMove = returning || !this.engaged;
    if (frozen || p.stagger > 0) wantMove = false;

    if (wantMove) {
      const speed = (returning ? Math.max(TUNING.heroKnockback.returnSpeed, TUNING.player.moveSpeed) : TUNING.player.moveSpeed) * this.heroStatus.moveMul;
      let nx = p.x + speed * dt;
      // 복귀 중에는 호위 위치까지만, 그 뒤에는 구간 한계(다음 웨이브 지점·감옥 앞)까지
      nx = Math.min(nx, returning ? escortX : this.rightLimit);
      // 적에게 막힌다. 확정 규칙(frontBlock)에서는 점프 중에도 적을 뛰어넘어 뒤에 남기지 않는다.
      // 비교 도구(jumpPass)에서만 공중에서 넘어갈 수 있다.
      for (const e of this.enemies) {
        if (e.passed || e.x < p.x) continue;
        if (this.passPolicy === 'jumpPass' && !this.verticalOverlap(e)) continue;
        if (e.def.flying) continue; // 공중 적은 지면 전진을 막지 않는다
        nx = Math.min(nx, e.x - (TUNING.player.width + e.def.width) / 2);
      }
      p.x = Math.max(p.x, nx);
    }
    p.maxXReached = Math.max(p.maxXReached, p.x);

    if (input.jump && this.grounded && !frozen) p.vy = TUNING.player.jumpVelocity;
    p.vy -= TUNING.world.gravity * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y <= 0 && p.vy < 0) p.vy = 0;
  }

  private verticalOverlap(e: Enemy): boolean {
    return this.player.y < e.y + e.def.height && e.y < this.player.y + TUNING.player.height;
  }

  /**
   * 교전 정차 판정. 정차 거리 = 기본 공격 사거리(실제로 닿는 거리)와 같다. 공중 적은 지상 펀치 높이에 있을 때만 센다
   * (높이 떠 있는 적·사거리 밖 원거리 적 때문에 멈춰 서지 않는다). 재개는 사거리 + 여유(TEMP) 밖으로 비었을 때.
   */
  private updateEngage(): void {
    const extra = this.engaged ? TUNING.advance.resumeMargin : 0;
    const range = TUNING.basicAttack.range + extra;
    if (this.reachableEnemies(range, true).length > 0) { this.engaged = true; return; }
    // 엘리트/보스 구간: 필수 적(본체·분열·소환체)은 높이 떠 있어도 가로로 닿는 거리에 오면 멈춘다(지나쳐 걷지 않고 점프 펀치로 친다)
    const w = this.mode === 'wave' ? this.waves[this.waveIndex] : undefined;
    this.engaged = !!w && w.phase === 'finale' && this.frontEnemies(range).some((e) => e.wave === this.waveIndex && e.role !== 'normal');
  }

  /** 기본 공격이 닿는 전방 적. groundTop이면 착지 상태 기준 높이(점프로 판정이 바뀌지 않게) */
  private reachableEnemies(range: number, groundTop = false): Enemy[] {
    const top = groundTop ? TUNING.player.height + TUNING.player.punchReachUp : this.punchTop();
    return this.frontEnemies(range).filter((e) => !e.def.flying || e.y <= top);
  }

  /** 확정: 호냥이와 캠프는 함께 움직이고 함께 멈추며 일정 간격을 유지한다(간격 수치 TEMP). 캠프는 지상. */
  private updateCamp(_dt: number): void {
    const c = this.camp;
    const target = this.player.x - TUNING.camp.followGap;
    c.moving = target > c.x + 0.01;
    c.x = Math.max(c.x, target);
  }

  // ───────────────────────── 웨이브

  private updateWaves(dt: number): void {
    if (this.mode === 'travel' && this.waveIndex < 3) {
      if (this.player.x >= this.waveX[this.waveIndex] - 1) this.startWave();
    }
    if (this.mode !== 'wave') return;

    const i = this.waveIndex;
    const w = this.waves[i];
    const def = this.chapter.waves[i];
    if (w.phase === 'normal') {
      if (w.normalKills >= def.normal.killTarget) {
        this.endNormalPhase(i);
      } else {
        // 목표 처치 수를 채울 때까지 잡몹 계속 생성. 동시 수·간격으로 제어(TEMP)
        w.spawnTimer -= dt;
        const alive = this.enemies.filter((e) => e.wave === i && e.role === 'normal').length;
        if (w.spawnTimer <= 0 && alive < def.normal.maxAlive) {
          this.spawnEnemy(this.pickNormal(def.normal.pool), i, true);
          w.spawnTimer = def.normal.interval;
        }
      }
      return;
    }
    if (!w.finaleSpawned) {
      // 회수 경험치 선택(일시정지)을 마친 뒤 짧은 등장 연출 → 연출이 끝나면 등장
      if (this.introWave !== i) {
        const fd = ENEMIES[def.finale];
        this.introWave = i;
        this.introTimer = TUNING.waves.finaleIntro;
        this.banner(`${fd.rank === 'boss' ? '보스' : '엘리트'} 등장! ${fd.name}`, TUNING.waves.finaleIntro + 1);
        this.logEvent('finaleIntro', fd.name);
      }
    } else if (!this.enemies.some((e) => e.wave === i)) {
      // 엘리트/보스 본체와 분열·소환체까지 전부 처치해야 웨이브 종료
      this.clearWave();
    }
  }

  private spawnFinale(i: number): void {
    const w = this.waves[i];
    if (w.finaleSpawned) return;
    // 엘리트/보스는 화면 안쪽에서 등장해 정차 상태에서 오래 기다리지 않게 한다(거리 TEMP)
    const e = this.spawnEnemy(this.chapter.waves[i].finale, i, true, this.player.x + TUNING.waves.finaleSpawnAhead);
    e.role = 'finale';
    w.finaleSpawned = true;
    w.finaleId = e.id;
    this.logEvent('eliteSpawn', e.def.name);
  }

  private pickNormal(allPool: { kind: EnemyKind; weight: number }[]): EnemyKind {
    // 캠프 위협 시험 적(TEMP)은 설정에서 끌 수 있다
    const pool = this.loadout.campThreatTest ? allPool : allPool.filter((p) => !ENEMIES[p.kind].temp);
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = this.rng.next() * total;
    for (const p of pool) { r -= p.weight; if (r < 0) return p.kind; }
    return pool[pool.length - 1].kind;
  }

  /**
   * 목표 처치 수 달성(캠프보상-전환-클리어-확정 §2):
   * - 잡몹 스폰 중단, 남은 잡몹은 처치 수·드롭·경험치 없이 제거.
   * - 적 투사체·공격 장판·예고, 호냥이/캠프의 진행 중 공격(예약 타격) 제거.
   * - 보호막·버프·남은 쿨타임은 유지(초기화·즉시 재사용 없음).
   * - 필드 드롭 자동 회수 → 회수 경험치 레벨업 선택 → 등장 연출(전투 타이머 정지) → 엘리트/보스.
   */
  private endNormalPhase(i: number): void {
    const w = this.waves[i];
    const leftovers = this.enemies.filter((e) => e.wave === i && e.role === 'normal');
    for (const e of leftovers) {
      this.addEffect({ kind: 'hit', x1: e.x - 16, x2: e.x + 16, y1: e.y, y2: e.y + 32, ttl: 0.35, color: 0xdfd6ff });
    }
    this.enemies = this.enemies.filter((e) => !leftovers.includes(e));
    w.cleanedUp = leftovers.length;
    w.phase = 'finale';
    // 엘리트/보스 구간(10차 수정): 제자리 고정을 없앤다. 등장한 엘리트/보스에게 기본 공격이 닿을 때까지
    // 캠프와 함께 전진하고, 닿는 거리에서 함께 멈춘다. 밀려나거나 적이 물러나면 다시 다가간다(updateEngage).
    this.rightLimit = Infinity;
    this.logEvent('cleanup', `${i + 1}`, leftovers.length);
    const removedAttacks = this.hazards.length + this.scheduled.length;
    this.hazards = [];
    this.scheduled = [];
    this.effects = this.effects.filter((f) => !['telegraph', 'aim', 'dropMark', 'zone', 'beam', 'laser'].includes(f.kind));
    this.logEvent('transition', `${i + 1}`, removedAttacks);
    this.collectAllDrops();
  }

  /** 전환 시 자동 회수: 필드·뒤에 남은 드롭을 모두 정상 획득 처리(경험치는 레벨업 선택으로 이어진다). 열쇠 제외 */
  private collectAllDrops(): void {
    const all = [...this.pickups.filter((p) => p.kind !== 'key'), ...this.behindDrops];
    this.pickups = this.pickups.filter((p) => p.kind === 'key');
    this.behindDrops = [];
    for (const pk of all) this.collect(pk);
    this.logEvent('autoCollect', 'transition', all.length);
  }

  private startWave(): void {
    const i = this.waveIndex;
    this.waves[i].started = true;
    this.mode = 'wave';
    // 일반 구간: 자동 전진하며 교전(구간 끝 없음). 엘리트/보스 구간에 들어서면 그 자리에 정차한다.
    this.rightLimit = Infinity;
    this.logEvent('waveStart', `${i + 1}`);
    this.banner(`웨이브 ${i + 1} / 3`, 1.8);
  }

  /**
   * 챕터 마지막 보스와 필수 분열·소환체 전멸 순간 클리어를 먼저 확정한다(§3).
   * 같은 틱의 경험치 획득·대기 중 선택보다 우선: 대기 선택을 지우고 이후 레벨업 선택을 막는다.
   * 남은 드롭은 자동 회수(재화·재료 정산, 경험치는 환산 없이 기록만), 적 공격은 제거해 패배가 끼어들지 않게 한다.
   */
  private confirmClear(): void {
    if (this.clearConfirmed) return;
    this.clearConfirmed = true;
    this.pending = [];
    this.hazards = [];
    this.scheduled = [];
    this.logEvent('clearConfirmed');
    this.autoCollectOnVictory();
  }

  /** 마지막 웨이브 엘리트/보스 구간에서 그 웨이브 적이 하나도 안 남았는지 */
  private finalWaveDone(): boolean {
    const i = this.waves.length - 1;
    const w = this.waves[i];
    return this.mode === 'wave' && this.waveIndex === i && w.phase === 'finale' && w.finaleSpawned && !this.enemies.some((e) => e.wave === i);
  }

  private clearWave(): void {
    const i = this.waveIndex;
    if (i === this.waves.length - 1) this.confirmClear();
    this.waves[i].cleared = true;
    this.logEvent('waveClear', `${i + 1}`);
    this.waveIndex++;
    const here = Math.max(this.player.x, this.camp.x + TUNING.camp.followGap);
    if (this.waveIndex < 3) {
      this.mode = 'travel';
      // 다음 웨이브는 앞 웨이브를 정리한 지점에서 이동 거리(TEMP)만큼 앞(일반 구간 전진 거리와 무관하게 일정)
      this.waveX[this.waveIndex] = here + TUNING.advance.travelGap;
      this.rightLimit = this.waveX[this.waveIndex];
      this.banner(`웨이브 ${i + 1} 돌파! 캠프 전진`, 1.8);
    } else if (this.chapter.rescue) {
      this.mode = 'toJail';
      this.jailX = here + TUNING.advance.jailGap;
      this.rightLimit = this.jailX - 50;
      this.banner('감옥 열쇠를 챙겨 감옥으로!', 2.5);
    } else {
      this.finish('victory');
    }
  }

  private spawnEnemy(kind: EnemyKind, wave: number, required: boolean, x?: number, parent?: Enemy): Enemy {
    const def = ENEMIES[kind];
    // 호냥이 전방 화면 끝 근처에서 등장(자동 전진 중이면 그 지점 기준)
    const spawnX = x ?? this.player.x + TUNING.waves.spawnAhead;
    const e: Enemy = {
      id: this.nextId++, def, x: spawnX, y: def.flying?.altitude ?? 0, vy: 0, hp: def.hp, wave, required,
      parentId: parent?.id ?? null, generation: parent ? parent.generation + 1 : 0,
      role: parent ? 'minion' : 'normal',
      contactCd: 0, cc: 0, ccKind: null, slow: 0, slowMul: 1, dots: [], shots: 0, passed: false, state: 'walk', stateTimer: 0,
      cdA: 2, cdB: 3.5, rollTarget: 0, hopTimer: this.rng.range(0.5, 1.5), flash: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ───────────────────────── 적

  private updateEnemies(dt: number): void {
    const p = this.player;
    const slowMul = this.slowAll > 0 ? 0.5 : 1;
    this.slowAll = Math.max(0, this.slowAll - dt);
    const campFront = this.camp.x + TUNING.camp.width / 2;

    // 적 지속 피해: 일반·엘리트·보스 모두 적용, 수면을 깨우지 않는다
    for (const e of [...this.enemies]) {
      let dmg = 0;
      for (const d of e.dots) { dmg += d.dps * Math.min(dt, d.remaining); d.remaining -= dt; }
      e.dots = e.dots.filter((d) => d.remaining > 0);
      if (dmg > 0) { e.hp -= dmg; if (e.hp <= 0) this.killEnemy(e); }
    }

    for (const e of this.enemies) {
      e.contactCd = Math.max(0, e.contactCd - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.slow = Math.max(0, e.slow - dt);
      // 낙하(공중 적 제외)
      if (!e.def.flying && (e.y > 0 || e.vy > 0)) {
        e.vy -= TUNING.world.gravity * dt;
        e.y = Math.max(0, e.y + e.vy * dt);
        if (e.y === 0) e.vy = 0;
      }
      if (e.cc <= 0) {
        const speed = e.def.speed * slowMul * (e.slow > 0 ? e.slowMul : 1);
        if (e.def.kind === 'rollingRat') this.updateRollingRat(e, dt, speed);
        else if (e.def.kind === 'stompSole') this.updateBoss(e, dt, speed);
        else if (e.def.campShot) this.updateShooter(e, dt, speed);
        else {
          if (e.def.kind === 'spikyBug') {
            e.hopTimer -= dt;
            if (e.hopTimer <= 0 && e.y === 0) { e.vy = 300; e.hopTimer = 1.4; } // TEMP 깡충
          }
          this.walkLeft(e, speed * dt);
        }
      } else {
        e.cc -= dt;
        if (e.cc <= 0) { e.cc = 0; e.ccKind = null; }
      }

      // 전방 전투안(TEMP 시험): 적은 호냥이 앞면에서 멈춘다. 호냥이가 점프 중이어도 아래로 지나가지 못해,
      // 착지할 때 적 위에 겹치지 않는다. 점프는 구르기·충격파 회피와 공중 펀치용이다.
      if (this.passPolicy === 'frontBlock' && !e.passed) {
        const minX = p.x + (TUNING.player.width + e.def.width) / 2 - 2;
        if (e.x < minX) e.x = minX;
      }

      // 캠프에 붙은 적은 멘탈을 깎는다
      if (e.x - e.def.width / 2 <= campFront + 1) {
        e.x = Math.max(e.x, campFront + e.def.width / 2);
        this.damageCamp(TUNING.camp.contactDps * dt);
      }

      // 호냥이 접촉 피해(적의 직접 공격)
      const overlapX = Math.abs(e.x - p.x) < (TUNING.player.width + e.def.width) / 2;
      if (overlapX && e.def.contactDamage > 0 && this.verticalOverlap(e) && e.contactCd <= 0 && e.cc <= 0) {
        this.damagePlayer(e.def.contactDamage, 'direct', this.testStatus(e.def.testStatus, e.def.name));
        e.contactCd = e.def.contactInterval; // 회피·무적도 공격 1회로 본다
      }

      // 통과·이탈 감지(자동 처치/도주 처리 없이 기록만 한다)
      if (!e.passed && e.x < p.x) {
        e.passed = true;
        this.logEvent('pass', e.def.name);
      }
      if (e.x < this.camp.x - 200 || e.x > this.rightLimit + 2000) {
        this.logEvent('outOfBounds', e.def.name);
        e.x = Math.max(campFront + e.def.width / 2, Math.min(e.x, this.rightLimit + 600));
      }
    }
  }

  /** 왼쪽으로 걷기. 지상의 호냥이 앞에서는 막힌다. */
  private walkLeft(e: Enemy, step: number): void {
    const p = this.player;
    let nx = e.x - step;
    if (!e.passed && e.x >= p.x && this.verticalOverlap(e)) {
      nx = Math.max(nx, p.x + (TUNING.player.width + e.def.width) / 2 - 2);
    }
    e.x = Math.min(e.x, nx);
  }

  private updateRollingRat(e: Enemy, dt: number, speed: number): void {
    const p = this.player;
    e.cdA -= dt;
    if (e.state === 'walk') {
      this.walkLeft(e, speed * dt);
      if (e.cdA <= 0 && e.x - p.x < 420) {
        e.state = 'telegraph';
        e.stateTimer = ROLL_PATTERN.telegraph;
        this.addEffect({ kind: 'telegraph', x1: p.x, x2: e.x, y1: 0, y2: 8, ttl: ROLL_PATTERN.telegraph, text: '구르기!' });
      }
    } else if (e.state === 'telegraph') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.state = 'roll';
        // 구르기 목표: 예고 종료 시점 호냥이 바로 앞. 호냥이 뒤로는 넘어가지 않는다.
        e.rollTarget = p.x + (TUNING.player.width + e.def.width) / 2 - 4;
      }
    } else if (e.state === 'roll') {
      e.x = Math.max(e.rollTarget, e.x - ROLL_PATTERN.speed * dt);
      const touching = Math.abs(e.x - p.x) < (TUNING.player.width + e.def.width) / 2;
      if (touching && this.verticalOverlap(e)) {
        this.damagePlayer(ROLL_PATTERN.damage, 'direct');
        e.x += ROLL_PATTERN.bounce;
        e.state = 'walk';
        e.cdA = ROLL_PATTERN.cooldown;
      } else if (e.x <= e.rollTarget) {
        e.state = 'walk';
        e.cdA = ROLL_PATTERN.cooldown;
      }
    }
  }

  /**
   * 캠프 위협 시험 적(TEMP). 호냥이 앞 standoff 거리에 머물며 예고(조준선/낙하 그림자) 뒤 캠프로 투사체를 보낸다.
   * 호냥이 뒤로 넘어가지 않는다. 정해진 횟수를 던진 뒤에는 앞까지 다가온다(지상: 근접, 공중: 머리 위에서 계속 투하).
   */
  private updateShooter(e: Enemy, dt: number, speed: number): void {
    const C = e.def.campShot!;
    const p = this.player;
    const close = e.shots >= C.shotsBeforeAdvance;
    if (close && !e.def.flying) { this.walkLeft(e, speed * dt); return; }
    const holdX = p.x + (close ? (TUNING.player.width + e.def.width) / 2 + 10 : C.standoff);
    e.cdA -= dt;
    if (e.state === 'walk') {
      if (e.x > holdX) e.x = Math.max(holdX, e.x - speed * dt);
      const ready = e.x - holdX < 40 && e.x - p.x < TUNING.world.viewAhead - 60;
      if (ready && e.cdA <= 0) {
        e.state = 'aim';
        e.stateTimer = C.telegraph;
        if (C.style === 'lob') this.addEffect({ kind: 'aim', x1: this.camp.x, x2: e.x, y1: 60, y2: e.y + e.def.height / 2, ttl: C.telegraph, text: '캠프 조준!' });
        else this.addEffect({ kind: 'dropMark', x1: this.camp.x - 40, x2: this.camp.x + 40, y1: 0, y2: 0, ttl: C.telegraph + C.duration, text: '낙하 예고!' });
      }
    } else if (e.state === 'aim') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        const sx = e.x - e.def.width / 2;
        this.hazards.push({
          kind: 'campShot', style: C.style, x: sx, y: C.startY, vx: 0, progress: 0, startX: sx, targetX: this.camp.x,
          radius: C.radius, damage: C.campDamage, hp: C.hp, maxHp: C.hp, duration: C.duration, startY: C.style === 'drop' ? e.y : C.startY,
          endY: C.endY, arc: C.arc, hitPlayer: false, done: false,
        });
        e.shots++;
        e.cdA = C.cooldown;
        e.state = 'walk';
      }
    }
  }

  private updateBoss(e: Enemy, dt: number, speed: number): void {
    const p = this.player;
    const gap = e.x - e.def.width / 2 - (p.x + TUNING.player.width / 2);
    e.cdA -= dt;
    e.cdB -= dt;
    const onScreen = e.x - p.x < TUNING.world.viewAhead - 60;
    if (e.state === 'walk') {
      if (gap > 20) this.walkLeft(e, speed * dt);
      if (!onScreen) return;
      if (e.cdB <= 0) {
        // 돌 투척 예고: 돌을 들어 올린다
        e.state = 'throw';
        e.stateTimer = BOSS_PATTERNS.rockThrow.telegraph;
        this.addEffect({ kind: 'telegraph', x1: e.x - 50, x2: e.x + 50, y1: 0, y2: 10, ttl: e.stateTimer, text: '돌 투척! 점프해서 부숴요' });
        // 캠프 대상 공격(확정): 대상을 명확히 예고
        this.addEffect({ kind: 'aim', x1: this.camp.x, x2: e.x, y1: 60, y2: e.def.height, ttl: e.stateTimer, text: '캠프 조준!' });
        e.cdB = BOSS_PATTERNS.rockThrow.cooldown;
      } else if (e.cdA <= 0) {
        e.state = 'stomp';
        e.stateTimer = BOSS_PATTERNS.shockwave.telegraph;
        // 호냥이 대상 공격(확정): 예고한 위치(호냥이 등 뒤 끝)까지 가서 끝난다. 피해도 캠프로 넘어가지 않는다.
        e.rollTarget = p.x - TUNING.player.width / 2;
        this.addEffect({ kind: 'telegraph', x1: e.rollTarget, x2: e.x, y1: 0, y2: 10, ttl: e.stateTimer, text: '쿵! 충격파(점프)' });
      }
    } else if (e.state === 'stomp') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        const S = BOSS_PATTERNS.shockwave;
        this.hazards.push({ kind: 'shockwave', x: e.x - e.def.width / 2, y: 0, vx: -S.speed, progress: 0, startX: 0, targetX: e.rollTarget, radius: S.width / 2, damage: S.damage, hp: 0, maxHp: 0, duration: 0, startY: 0, endY: 0, arc: 0, hitPlayer: false, done: false });
        e.state = 'walk';
        e.cdA = S.cooldown;
      }
    } else if (e.state === 'throw') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        const R = BOSS_PATTERNS.rockThrow;
        const sx = e.x - e.def.width / 2;
        this.hazards.push({ kind: 'bigRock', x: sx, y: R.startY, vx: 0, progress: 0, startX: sx, targetX: this.camp.x, radius: R.radius, damage: R.campDamage, hp: R.hp, maxHp: R.hp, duration: R.duration, startY: R.startY, endY: R.endY, arc: R.arc, hitPlayer: false, done: false });
        e.state = 'walk';
      }
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    const S = BOSS_PATTERNS.shockwave;
    const slow = this.slowAll > 0 ? 0.5 : 1;
    for (const h of this.hazards) {
      if (h.kind === 'shockwave') {
        h.x += h.vx * dt * slow;
        const hit = Math.abs(h.x - p.x) < h.radius + TUNING.player.width / 2 && p.y < S.height;
        if (hit && !h.hitPlayer) { this.damagePlayer(h.damage, 'direct', this.testStatus(S.testStatus, '충격파')); h.hitPlayer = true; }
        // 예고 위치에서 종료. 점프로 피해도 뒤 캠프에 전가·관통하지 않는다(양측 관통 공격은 초반 제외).
        if (h.x <= h.targetX) h.done = true;
      } else {
        // 큰 돌·캠프 조준 투사체: 던진 곳에서 캠프까지 포물선. 캠프에 닿으면 멘탈 피해.
        h.progress = Math.min(1, h.progress + (dt * slow) / h.duration);
        const s = h.progress;
        h.x = h.startX + (h.targetX - h.startX) * s;
        h.y = h.startY + (h.endY - h.startY) * s + 4 * h.arc * s * (1 - s);
        // 캠프 조준 투사체는 호냥이 몸(점프 포함)에 닿으면 요격된다. 큰 돌은 몸에 맞지 않는다(펀치로 파괴).
        if (h.kind === 'campShot' && Math.abs(h.x - p.x) < h.radius + TUNING.player.width / 2
          && h.y + h.radius >= p.y && h.y - h.radius <= p.y + TUNING.player.height) {
          this.breakShot(h, 'body');
          continue;
        }
        if (s >= 1) {
          this.damageCamp(h.damage);
          this.logEvent(h.kind === 'bigRock' ? 'rockHitCamp' : 'shotHitCamp');
          this.addEffect({ kind: 'hit', x1: h.x - 30, x2: h.x + 30, y1: h.y - 30, y2: h.y + 30, ttl: 0.3, color: 0x9a8f7a });
          h.done = true;
        }
      }
    }
    this.hazards = this.hazards.filter((h) => !h.done);
  }

  // ───────────────────────── 호냥이 공격

  /** 호냥이 직접 타격 피해 계산(치명타 포함). 지속 피해는 치명타 제외 */
  private rollDamage(base: number, source: AttackSource, st: HeroStats): { dmg: number; crit: boolean } {
    let dmg = base * st.attackMul;
    if (source === 'skill') dmg *= st.skillDamageMul;
    const crit = this.rng.chance(st.critChance);
    if (crit) dmg *= st.critMultiplier;
    return { dmg, crit };
  }

  private frontEnemies(range: number): Enemy[] {
    const front = this.player.x + TUNING.player.width / 2;
    return this.enemies
      .filter((e) => !e.passed && e.x >= this.player.x && e.x - e.def.width / 2 <= front + range)
      .sort((a, b) => a.x - b.x);
  }

  /** 기본 공격 사거리 안의 큰 돌·캠프 조준 투사체(공중 펀치 대상) */
  private rockInPunchReach(range: number): Hazard | undefined {
    const p = this.player;
    const front = p.x + TUNING.player.width / 2;
    const top = this.punchTop();
    return this.hazards.find((h) => h.kind !== 'shockwave' && !h.done && h.x >= p.x - h.radius && h.x - h.radius <= front + range && h.y - h.radius <= top && h.y + h.radius >= p.y);
  }

  /** 기본 공격이 닿는 높이(머리 위 공중 펀치 포함) */
  private punchTop(): number {
    return this.player.y + TUNING.player.height + TUNING.player.punchReachUp;
  }

  private breakShot(h: Hazard, by: 'punch' | 'body' | 'skill'): void {
    if (h.done) return;
    h.done = true;
    this.logEvent('shotBroken', by);
    this.addEffect({ kind: 'hit', x1: h.x - 16, x2: h.x + 16, y1: h.y - 16, y2: h.y + 16, ttl: 0.25, color: 0xe8e0c8 });
    this.addEffect({ kind: 'text', x1: h.x, x2: h.x, y1: h.y + 24, y2: 0, ttl: 0.5, text: '요격!' });
  }

  private hitRock(h: Hazard, dmg: number): void {
    if (h.kind === 'campShot') { h.hp -= dmg; if (h.hp <= 0) this.breakShot(h, 'punch'); return; }
    h.hp -= dmg;
    if (h.hp <= 0 && !h.done) {
      h.done = true;
      this.logEvent('rockBroken');
      this.addEffect({ kind: 'hit', x1: h.x - 26, x2: h.x + 26, y1: h.y - 26, y2: h.y + 26, ttl: 0.3, color: 0xd9c9a8 });
      this.addEffect({ kind: 'text', x1: h.x, x2: h.x, y1: h.y + 30, y2: 0, ttl: 0.6, text: '파괴!' });
    }
  }

  private updateCombat(dt: number, st: HeroStats): void {
    const p = this.player;
    const B = TUNING.basicAttack;
    const lvl = this.skills.basicLevel;

    // 빙결 중에는 기본 공격·전용 기술 정지(쿨타임은 흐른다)
    const frozen = this.heroStatus.frozen;
    // 기본 공격: 무소모 자동 전방 공격. 날아오는 큰 돌·투사체가 닿으면 먼저 친다(공중 펀치).
    p.basicTimer -= dt;
    if (p.basicTimer <= 0 && !frozen) {
      const rock = this.rockInPunchReach(B.range);
      // 공중 적은 펀치가 닿는 높이일 때만(점프해서 친다)
      const target = rock ? null : this.reachableEnemies(B.range)[0];
      if (rock || target) {
        const { dmg, crit } = this.rollDamage(B.damage * (1 + B.damagePerLevel * (lvl - 1)), 'basic', st);
        if (rock) this.hitRock(rock, dmg);
        else this.hitEnemy(target!, dmg, 0, crit);
        p.attackAnim = 0.15;
        p.basicTimer = st.basicInterval;
        if (TUNING.ultimate.basicAttackCharges) this.chargeUlt(TUNING.ultimate.basicAttackChargeAmount);
      }
    }

    // 전용 기술: 냥기력과 쿨타임이 모두 준비되고 전방에 적이 있을 때 자동 발동
    for (const owned of this.skills.exclusives) {
      const def = this.weapon.exclusives.find((d) => d.id === owned.id)!;
      this.skillCd[def.id] = Math.max(0, (this.skillCd[def.id] ?? 0) - dt);
      if (frozen || this.skillCd[def.id] > 0 || p.energy < def.energy) continue;
      if (this.frontEnemies(def.triggerRange).length === 0) continue;
      const gi = owned.level - 1;
      const dmgMul = TUNING.growth.gradeDamage[owned.grade][gi];
      const cdMul = TUNING.growth.gradeCooldown[owned.grade][gi];
      // 실제 발동 시에만 차감·쿨타임 시작. 쿨타임 감소 패시브는 전용 기술에만.
      p.energy -= def.energy;
      this.skillCd[def.id] = def.cooldown * cdMul * st.cooldownMul;
      this.chargeUlt(def.ultCharge);
      this.castSkill(def, def.damage * dmgMul);
      this.logEvent('skill', def.name);
    }

    // 예약된 타격 처리(타격마다 치명타 판정)
    const due = this.scheduled.filter((s) => s.at <= this.t);
    this.scheduled = this.scheduled.filter((s) => s.at > this.t);
    for (const s of due) {
      if (s.chainRange !== undefined) {
        const target = this.frontEnemies(s.chainRange)[0];
        if (target) {
          const { dmg, crit } = this.rollDamage(s.damage, 'skill', st);
          this.hitEnemy(target, dmg, 0, crit);
          this.addEffect({ kind: 'hit', x1: target.x - 8, x2: target.x + 8, y1: 20, y2: 36, ttl: 0.15, color: 0xffb3d1 });
        }
      } else if (s.area) {
        const a = s.area;
        for (const e of [...this.enemies]) {
          if (e.passed) continue;
          const l = e.x - e.def.width / 2, r = e.x + e.def.width / 2;
          if (r >= a.x1 && l <= a.x2 && e.y + e.def.height >= a.y1 && e.y <= a.y2) {
            const { dmg, crit } = this.rollDamage(s.damage, 'skill', st);
            this.hitEnemy(e, dmg, s.stun, crit);
          }
        }
        for (const h of this.hazards) {
          if (h.kind !== 'shockwave' && h.x + h.radius >= a.x1 && h.x - h.radius <= a.x2 && h.y + h.radius >= a.y1 && h.y - h.radius <= a.y2) {
            this.hitRock(h, this.rollDamage(s.damage, 'skill', st).dmg);
          }
        }
      }
    }
  }

  private castSkill(def: ExclusiveSkillDef, damage: number): void {
    const px = this.player.x;
    const sh = def.shape;
    if (sh.kind === 'chain') {
      for (let k = 0; k < sh.shots; k++) this.scheduled.push({ at: this.t + k * sh.shotInterval, skill: def, chainRange: sh.range, damage, stun: 0 });
      this.addEffect({ kind: 'text', x1: px, x2: px, y1: 70, y2: 70, ttl: 0.6, text: def.name });
    } else if (sh.kind === 'zone') {
      const area = { x1: px + sh.x1, x2: px + sh.x2, y1: sh.y1, y2: sh.y2 };
      if (sh.telegraph > 0) this.addEffect({ kind: 'telegraph', ...area, y2: 10, ttl: sh.telegraph, text: def.name });
      for (let k = 0; k < sh.hits; k++) {
        this.scheduled.push({ at: this.t + sh.telegraph + k * sh.hitInterval, skill: def, area, damage, stun: 0 });
        this.addEffect({ kind: 'zone', ...area, ttl: sh.telegraph + k * sh.hitInterval + 0.18, color: 0xffd38a });
      }
      if (sh.telegraph === 0) this.addEffect({ kind: 'text', x1: px, x2: px, y1: 70, y2: 70, ttl: 0.6, text: def.name });
    } else {
      const area = { x1: px, x2: px + sh.length, y1: 0, y2: sh.height };
      this.addEffect({ kind: 'telegraph', ...area, y2: 10, ttl: sh.telegraph, text: def.name });
      this.scheduled.push({ at: this.t + sh.telegraph, skill: def, area, damage, stun: sh.stun });
      this.addEffect({ kind: 'beam', ...area, ttl: sh.telegraph + 0.3, color: 0x9be7ff });
    }
  }

  private hitEnemy(e: Enemy, dmg: number, stun: number, crit = false): void {
    if (!this.enemies.includes(e)) return;
    e.hp -= dmg;
    e.flash = 0.1;
    // 직접 피격은 수면을 깨운다(DOT는 깨우지 않음)
    if (e.ccKind === 'sleep') { e.cc = 0; e.ccKind = null; }
    if (stun > 0) this.applyEnemyCc(e, 'stun', stun);
    if (crit) this.logEvent('crit');
    this.addEffect({ kind: 'text', x1: e.x, x2: e.x, y1: e.def.height + 10, y2: 0, ttl: 0.5, text: crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, color: crit ? 0xffd34d : undefined });
    if (e.hp <= 0) this.killEnemy(e);
  }

  // ───────────────────────── 적 제어·지속 피해(등급별 저항)

  /**
   * 수면·기절·빙결. 일반: 그대로, 엘리트: 시간 단축, 보스: 행동정지 대신 짧은 감속(패턴 취소 없음).
   * 보스 기절로 패턴을 끊는 예외는 미확정이라 만들지 않는다.
   */
  applyEnemyCc(e: Enemy, kind: EnemyCcKind, duration: number): void {
    const C = TUNING.enemyCc;
    if (e.def.rank === 'boss') {
      e.slow = Math.max(e.slow, C.bossSlowDuration);
      e.slowMul = C.bossSlowMul;
      this.logEvent('enemyCc', `${e.def.name}:${kind}→slow`);
      return;
    }
    const dur = e.def.rank === 'elite' ? duration * C.eliteDurationMul : duration;
    if (dur > e.cc) { e.cc = dur; e.ccKind = kind; }
    this.logEvent('enemyCc', `${e.def.name}:${kind}`, dur);
  }

  /** 밀쳐내기(오른쪽). 일반: 그대로, 엘리트: 거리 감소, 보스: 위치 이동 면역 */
  knockback(e: Enemy, dist: number): void {
    if (e.def.rank === 'boss') return;
    e.x += e.def.rank === 'elite' ? dist * TUNING.enemyCc.eliteKnockbackMul : dist;
  }

  /** 적 지속 피해. 전 등급 적용. 같은 종류는 강한 쪽 유지·시간 갱신(호냥이와 같은 규칙을 임시 적용) */
  applyEnemyDot(e: Enemy, tag: DotTag, dps: number, duration: number, source: string): void {
    const cur = e.dots.find((d) => d.tag === tag);
    if (!cur) { e.dots.push({ tag, dps, remaining: duration, source }); return; }
    if (dps > cur.dps) { cur.dps = dps; cur.source = source; }
    cur.remaining = Math.max(cur.remaining, duration);
  }

  private killEnemy(e: Enemy): void {
    if (!this.enemies.includes(e)) return;
    this.enemies = this.enemies.filter((x) => x !== e);
    if (e.role === 'normal') {
      const w = this.waves[e.wave];
      // 같은 순간 여러 마리가 죽어도 목표 카운트는 목표치까지만 센다(초과분은 처치 기록·드롭만)
      if (w.phase === 'normal' && w.normalKills < this.chapter.waves[e.wave].normal.killTarget) { w.normalKills++; this.killsRequired++; }
    } else if (e.role === 'finale') this.killsRequired++;
    else this.childrenKilled++;
    this.logEvent('kill', e.def.name, e.required ? 1 : 0);

    // 분열: 자식까지 추적. 세대 상한으로 무한 분열 방지.
    if (e.def.splitInto && e.generation < TUNING.waves.maxSplitGeneration) {
      for (let k = 0; k < e.def.splitInto.count; k++) {
        this.spawnEnemy(e.def.splitInto.kind, e.wave, false, e.x + 20 + k * 30, e);
        this.childrenSpawned++;
      }
      this.logEvent('split', e.def.name, e.def.splitInto.count);
    }

    // 경험치 드롭(작은 개다래 / 작은 톱니)
    for (let k = 0; k < e.def.catnip; k++) this.dropPickup('catnip', e.x + this.rng.range(-20, 20), 1);
    if (this.rng.chance(e.def.gearChance)) this.dropPickup('gear', e.x, e.def.rank === 'normal' ? 1 : 4);

    // 영구 재화·재료도 실제 드롭. 수집 반경 안에서 흡인되어 호냥이에게 닿아야 판 획득물이 된다.
    for (const roll of e.def.loot) {
      if (!this.rng.chance(roll.chance)) continue;
      const n = this.rng.int(roll.min, roll.max);
      const pk = this.dropPickup('loot', e.x + this.rng.range(-24, 24), n);
      pk.lootId = roll.id;
    }

    if (e.def.rank !== 'normal' && !this.hasBell && this.revivesUsed === 0) {
      const p = TUNING.revive.eliteDropChance * (1 + this.luck * TUNING.luck.rareDropPerLuck);
      if (this.forceBellDrop || this.rng.chance(p)) this.dropPickup('bell', e.x, 1);
    }
    if (e.def.rank === 'boss' && this.chapter.rescue) this.dropPickup('key', e.x, 1);
    // 마지막 처치 순간 바로 클리어 확정(같은 틱 경험치 획득보다 우선)
    if (this.finalWaveDone()) this.confirmClear();
  }

  private chargeUlt(n: number): void {
    // 궁극기 자체 재충전 없음: 기술 발동에서만 충전
    if (!this.loadout.ultimateEnabled) return;
    this.ultGauge = Math.min(TUNING.ultimate.gaugeMax, this.ultGauge + n);
  }

  useUltimate(slot: number): boolean {
    if (!this.loadout.ultimateEnabled || this.ultGauge < TUNING.ultimate.gaugeMax) return false;
    const id: UltimateId | undefined = this.loadout.ultimates[slot];
    if (!id) return false;
    this.ultGauge = 0;
    const p = this.player;
    const st = this.stats();
    const visible = this.enemies.filter((e) => e.x - p.x < TUNING.world.viewAhead && e.x > this.camp.x);
    switch (id) {
      case 'atkArea':
        for (const e of [...visible]) { const r = this.rollDamage(60, 'ult', st); this.hitEnemy(e, r.dmg, 0, r.crit); }
        break;
      case 'atkSingle': {
        const t = [...this.frontEnemies(TUNING.world.viewAhead)].sort((a, b) => b.hp - a.hp)[0];
        if (t) { const r = this.rollDamage(220, 'ult', st); this.hitEnemy(t, r.dmg, 0, r.crit); }
        break;
      }
      case 'defSlow': this.slowAll = 5; break;
      case 'defReflect':
        this.hazards = [];
        for (const e of this.enemies) if (!e.passed) this.knockback(e, 120);
        break;
      case 'healHero': p.hp = p.maxHp; break;
      case 'healCamp': this.camp.mental = this.camp.maxMental; break;
    }
    this.addEffect({ kind: 'ult', x1: p.x - 300, x2: p.x + 700, y1: 0, y2: 400, ttl: 0.6, text: ULTIMATES[id].name });
    this.logEvent('ult', id);
    return true;
  }

  // ───────────────────────── 동료 지원

  private updateSupports(dt: number): void {
    const S = TUNING.supports;
    const lv = (id: CampSkillId) => this.skills.camp[id] ?? 0;

    // 수염할아버지 골골송 배리어: 캠프 보호(확정 목적). 호냥이에게는 적용하지 않는다.
    this.supportTimers.barrier -= dt;
    if (this.supportTimers.barrier <= 0) {
      this.camp.shield = Math.max(this.camp.shield, S.barrier.shield + S.barrier.levelShield * lv('barrier'));
      this.supportTimers.barrier = S.barrier.interval - S.barrier.levelInterval * lv('barrier');
      this.addEffect({ kind: 'shield', x1: this.camp.x - 50, x2: this.camp.x + 50, y1: 0, y2: 90, ttl: 0.8 });
    }

    // 삐콩이 서치 레이저. jumpPass 비교안에서만 뒤로 넘어간 적을 우선 조준한다.
    this.supportTimers.laser -= dt;
    if (this.supportTimers.laser <= 0) {
      const behind = this.passPolicy === 'jumpPass' ? this.enemies.filter((e) => e.passed).sort((a, b) => a.x - b.x)[0] : undefined;
      const target = behind ?? this.frontEnemies(420)[0];
      if (target) {
        this.addEffect({ kind: 'laser', x1: this.camp.x, x2: target.x, y1: 60, y2: target.y + 14, ttl: 0.25 });
        this.hitEnemy(target, S.laser.damage + S.laser.levelDamage * lv('laser'), 0);
        this.supportTimers.laser = S.laser.interval - S.laser.levelInterval * lv('laser');
      } else {
        this.supportTimers.laser = 0.3;
      }
    }

    // 닥터 코숏: 구출 이후 출격부터. 두 갈래 — 캣닢 캡슐(HP) / 증상별 처방(상태이상 약)
    if (this.loadout.rescued.includes('kosyot')) {
      this.supportTimers.capsule -= dt;
      if (this.supportTimers.capsule <= 0) {
        const pk = this.dropPickup('capsule', this.player.x + S.capsule.dropAhead, S.capsule.heal + S.capsule.levelHeal * lv('capsule'));
        pk.lifetime = S.capsule.lifetime;
        pk.y = 160;
        this.supportTimers.capsule = S.capsule.interval - S.capsule.levelInterval * lv('capsule');
      }
      this.panaceaCd = Math.max(0, this.panaceaCd - dt);
      this.supportTimers.prescription -= dt;
      if (this.supportTimers.prescription <= 0) {
        const med = this.choosePrescription();
        if (med) {
          const pk = this.dropPickup('medicine', this.player.x + S.prescription.dropAhead, 0);
          pk.medId = med;
          pk.lifetime = S.prescription.lifetime;
          pk.y = 160;
          if (med === 'panacea') this.panaceaCd = S.panacea.cooldown;
          this.logEvent('prescribe', med);
          this.supportTimers.prescription = S.prescription.interval - S.prescription.levelInterval * lv('prescription');
        } else {
          this.supportTimers.prescription = S.prescription.retry;
        }
      }
    }
  }

  /**
   * 증상별 처방(확정): 빙결 → 감속 → 독/화상/출혈 중 초당 피해 최대. 한 번에 한 개, 다음 처방 때 다시 판단.
   * 같은 약이 이미 바닥·비행 중이면 중복 투하를 피한다(그때 다음 증상/대기는 TEMP 설정).
   * 만능 처방약(진화)과 개별 약의 대체/병행은 미정이라 TUNING.supports.panacea.policy(TEMP)로 고른다.
   */
  choosePrescription(): MedicineId | null {
    const order = prescriptionOrder(this.heroStatus);
    if (order.length === 0) return null;
    const S = TUNING.supports;
    const inField = new Set(this.pickups.filter((p) => p.kind === 'medicine').map((p) => p.medId));
    if (inField.has('panacea')) return null; // 만능약이 오는 중이면 전부 해결될 예정
    if (this.loadout.panacea) {
      const wantPanacea = S.panacea.policy === 'replace' || order.length >= S.panacea.minSymptoms;
      if (wantPanacea && this.panaceaCd <= 0) return 'panacea';
      if (S.panacea.policy === 'replace') return null;
    }
    for (const tag of order) {
      const id = MEDICINE_FOR[tag];
      if (!inField.has(id)) return id;
      if (S.prescriptionOnDuplicate === 'wait') return null;
    }
    return null;
  }

  // ───────────────────────── 드롭·수집

  private dropPickup(kind: PickupKind, x: number, value: number): Pickup {
    const pk: Pickup = { id: this.nextId++, kind, x, y: 20, vy: 220, age: 0, lifetime: null, value };
    this.pickups.push(pk);
    return pk;
  }

  /**
   * 수집 반경 안의 모든 드롭(경험치·재화·재료·보급·방울)이 호냥이에게 끌려와 닿을 때 획득·사용된다.
   * 감옥 열쇠는 놓치면 진행 불가가 되므로 거리와 상관없이 끌려온다(구출 이벤트 별도 처리).
   */
  private updatePickups(dt: number, st: HeroStats): void {
    const p = this.player;
    const keep: Pickup[] = [];
    for (const pk of this.pickups) {
      pk.age += dt;
      const dx = p.x - pk.x;
      const dy = p.y + 20 - pk.y;
      const inRadius = Math.hypot(dx, dy) < st.pickupRadius;
      const magnet = pk.kind === 'key' || (inRadius && pk.age > 0.25);
      if (magnet) {
        const d = Math.max(1, Math.hypot(dx, dy));
        const step = Math.min(d, TUNING.pickups.magnetSpeed * dt);
        pk.x += (dx / d) * step;
        pk.y = Math.max(0, pk.y + (dy / d) * step);
        pk.vy = 0;
      } else {
        pk.vy -= TUNING.world.gravity * 0.6 * dt;
        pk.y = Math.max(0, pk.y + pk.vy * dt);
        if (pk.y === 0) pk.vy = 0;
      }
      if (Math.abs(p.x - pk.x) < 22 && Math.abs(p.y + 20 - pk.y) < 50) {
        this.collect(pk);
        continue;
      }
      const expired = pk.lifetime !== null && pk.age > pk.lifetime;
      const leftBehind = pk.kind !== 'key' && pk.x < p.x - TUNING.pickups.missedBehind;
      if (expired || leftBehind) {
        this.logEvent('missedPickup', pk.lootId ?? pk.medId ?? pk.kind, pk.value);
        // 뒤로 놓친 재화·재료·경험치는 성공 시 자동 회수 대상으로 남긴다(TEMP 해석). 시간 제한 보급은 사라진다.
        if (leftBehind && !expired && (pk.kind === 'loot' || pk.kind === 'catnip' || pk.kind === 'gear')) this.behindDrops.push(pk);
        continue;
      }
      keep.push(pk);
    }
    this.pickups = keep;
  }

  private collect(pk: Pickup): void {
    switch (pk.kind) {
      case 'catnip':
        if (this.clearConfirmed) { this.autoCollectedXp.hero += pk.value; break; }
        this.heroXp += pk.value;
        while (this.heroXp >= this.heroXpNeeded) {
          this.heroXp -= this.heroXpNeeded;
          this.heroLevel++;
          this.logEvent('levelUp', `${this.heroLevel}`);
          this.queueChoice('hero');
        }
        break;
      case 'gear':
        if (this.clearConfirmed) { this.autoCollectedXp.camp += pk.value; break; }
        this.campXp += pk.value;
        while (this.campXp >= this.campXpNeeded) {
          this.campXp -= this.campXpNeeded;
          this.campLevel++;
          this.logEvent('campLevelUp', `${this.campLevel}`);
          this.queueChoice('camp');
        }
        break;
      case 'loot':
        if (pk.lootId) {
          this.loot[pk.lootId] = (this.loot[pk.lootId] ?? 0) + pk.value;
          this.logEvent('loot', pk.lootId, pk.value);
        }
        break;
      case 'bell':
        // 미정: 이미 소모한 방울 추가 습득 처리. 지금은 판당 1회 부활 규칙에 따라 부활 후엔 보유만 표시하지 않는다.
        if (this.revivesUsed === 0) this.hasBell = true;
        this.logEvent('bell');
        this.banner('다시냥 방울 획득!', 1.6);
        break;
      case 'key':
        this.hasKey = true;
        this.logEvent('key');
        this.banner('감옥 열쇠 획득!', 1.6);
        break;
      case 'capsule':
        // 확정: 도착 즉시 소모, 보관 없음, HP 상한 초과 없음(가득이면 그대로 소모)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + pk.value);
        this.addEffect({ kind: 'text', x1: this.player.x, x2: 0, y1: 80, y2: 0, ttl: 0.7, text: `+${pk.value}`, color: 0x8ef0a0 });
        break;
      case 'medicine': {
        // 확정: 필요 없어도 도착 즉시 소모, 보관 없음. 해당 약은 해당 증상만 푼다.
        const med = MEDICINES[pk.medId!];
        const removed = this.heroStatus.cure(med.cures);
        this.logEvent('cure', med.id, removed.length);
        this.addEffect({ kind: 'text', x1: this.player.x, x2: 0, y1: 92, y2: 0, ttl: 0.9, text: removed.length ? `${med.name}! ${removed.map((t) => STATUS_NAMES[t]).join('·')} 해제` : med.name, color: 0xbff7c0 });
        break;
      }
    }
  }

  /**
   * 확정: 성공 시 필드에 남은 드롭 자동 회수(감옥은 직접 상호작용이라 제외).
   * 재화·재료는 판 획득물로 정산. 경험치는 확정 규칙대로 레벨업·선택창·환산 없이 기록만 한다.
   * 보급(캡슐·약)·방울은 판이 끝나 효과가 없어 그대로 사라진다.
   */
  private autoCollectOnVictory(): void {
    const all = [...this.pickups.filter((p) => p.kind !== 'key'), ...this.behindDrops];
    let n = 0;
    for (const pk of all) {
      if (pk.kind === 'loot' && pk.lootId) {
        this.loot[pk.lootId] = (this.loot[pk.lootId] ?? 0) + pk.value;
        this.logEvent('loot', pk.lootId, pk.value);
        n++;
      } else if (pk.kind === 'catnip') { this.autoCollectedXp.hero += pk.value; n++; }
      else if (pk.kind === 'gear') { this.autoCollectedXp.camp += pk.value; n++; }
    }
    this.pickups = this.pickups.filter((p) => p.kind === 'key');
    this.behindDrops = [];
    if (n > 0 || !this.clearConfirmed) this.logEvent('autoCollect', 'victory', n);
  }

  /** [시험] 적 상태이상: 설정에서 켰을 때만 공격에 상태이상을 붙인다 */
  private testStatus(spec: { tag: StatusApply['tag']; intensity: number; duration: number } | undefined, source: string): StatusApply | undefined {
    if (!spec || !this.loadout.statusTest) return undefined;
    return { ...spec, source };
  }

  /**
   * 호냥이 상태이상 적용(외부·테스트용 진입점 포함). 회피는 damagePlayer에서 이미 걸러진다.
   */
  applyHeroStatus(a: StatusApply): void {
    // 보호구 지속시간 감소(면역 아님). 감속 저항은 적 스킬 감속만, 지형 감속 제외
    const duration = resistedDuration(a.tag, a.origin ?? 'enemySkill', a.duration, this.loadout.armor.resist);
    const r = this.heroStatus.apply({ ...a, duration });
    if (r === 'immune') { this.logEvent('statusImmune', a.tag); return; }
    this.logEvent('status', `${a.tag}:${r}`, a.intensity);
    if (r === 'applied') this.addEffect({ kind: 'text', x1: this.player.x, x2: 0, y1: 104, y2: 0, ttl: 0.7, text: STATUS_NAMES[a.tag], color: 0xd0a0ff });
  }

  // ───────────────────────── 피해·패배·구출

  /**
   * 호냥이 피해. 직접 공격은 회피 판정(성공 시 피해·동반 상태이상 무효), 방어력 감소 적용.
   * @returns 실제로 피해를 받았는지
   */
  damagePlayer(n: number, kind: DamageKind = 'direct', status?: StatusApply): boolean {
    const p = this.player;
    if (this.finished || this.clearConfirmed || p.hp <= 0) return false;
    // 지속 피해(DOT·지형): 회피·방어력·피격 무적과 무관
    if (kind !== 'direct') {
      p.hp -= n;
      if (p.hp <= 0) p.hp = 0;
      return true;
    }
    if (p.invuln > 0) return false;
    const st = this.stats();
    // 회피 성공 시 피해와 그 공격의 상태이상 모두 무효
    if (st.evasion > 0 && this.rng.chance(st.evasion)) {
      this.logEvent('evade');
      this.addEffect({ kind: 'text', x1: p.x, x2: 0, y1: 70, y2: 0, ttl: 0.5, text: '회피!', color: 0xbff7ff });
      return false;
    }
    // [미정 옵션] 적 치명타: 기본 꺼짐(난수도 쓰지 않음). 켜면 조끼 +10 받는 치명타 피해 감소 적용
    const ec = enemyCritDamage(n, () => this.rng.next(), this.loadout.armor.resist.critDamage);
    if (ec.crit) this.logEvent('enemyCrit', undefined, ec.dmg);
    // 확정 공식: 원래 피해 × 100/(100+방어력). 반올림은 미정(TEMP 옵션)
    const raw = ec.dmg * st.damageTaken;
    p.hp -= TUNING.defense.round ? Math.round(raw) : raw;
    p.invuln = TUNING.player.contactInvuln;
    p.hurt = 0.25;
    if (status) this.applyHeroStatus(status);
    // HP 0 처리(방울 부활 포함)는 이 틱 끝 resolveDefeat()에서 캠프 판정 뒤에 한다
    if (p.hp <= 0) p.hp = 0;
    return true;
  }

  /**
   * 호냥이 밀쳐내기(확정 8차). 호냥이만 뒤로 밀리고 캠프는 제자리, 캠프와 겹치지 않는 데까지만.
   * 경직(TEMP)이 끝나면 원래 호위 위치로 복귀한 뒤 동기 전진을 재개하고, 엘리트/보스 구간이면 복귀 뒤에도 정차한다.
   * 밀쳐내기 저항은 밀리는 거리를 줄인다. 지금 Ch 1에는 호냥이를 미는 적 공격이 없다(규칙·시험 진입점).
   */
  knockbackHero(dist: number): number {
    if (this.finished || this.clearConfirmed) return 0;
    const r = heroKnockback(this.player.x, this.camp.x, dist, this.loadout.armor.resist.knockback);
    this.player.x = r.heroX;
    if (r.moved > 0) this.player.stagger = TUNING.heroKnockback.stagger;
    return r.moved;
  }

  /** 호냥이-캠프 최소 간격(겹침 금지) */
  get heroCampMinGap(): number { return heroCampMinGap(); }

  damageCamp(n: number): void {
    if (this.clearConfirmed) return;
    let left = n;
    if (this.camp.shield > 0) {
      const absorbed = Math.min(this.camp.shield, left);
      this.camp.shield -= absorbed;
      left -= absorbed;
    }
    this.camp.mental -= left;
    // 캠프 파괴는 그 순간 패배(호냥이 HP·방울 무관)
    if (this.camp.mental <= 0 && !this.finished) this.checkDefeat();
  }

  /**
   * 확정: 캠프 멘탈 0이면 호냥이 HP·방울과 무관하게 즉시 패배. 같은 틱에 둘 다 0이어도 캠프 우선, 방울 미발동.
   * 캠프가 멀쩡할 때만 호냥이 HP 0에 다시냥 방울(HP 50%, 3초 무적, 판당 1회)을 쓴다.
   */
  private checkDefeat(): void {
    if (this.finished || this.clearConfirmed) return;
    if (this.camp.mental <= 0) { this.camp.mental = 0; this.defeatCause = 'camp'; this.finish('defeat'); return; }
    const p = this.player;
    if (p.hp > 0) return;
    if (this.hasBell && this.revivesUsed < TUNING.revive.perRun) {
      this.hasBell = false;
      this.revivesUsed++;
      p.hp = p.maxHp * TUNING.revive.hpRatio;
      p.invuln = TUNING.revive.invuln;
      this.logEvent('revive');
      this.banner('다시냥 방울! 부활!', 1.8);
      return;
    }
    p.hp = 0;
    this.defeatCause = 'hero';
    this.finish('defeat');
  }

  /**
   * 판 도중 나가기(앱 종료 포함). 이미 주운 영구 재화·재료만 남기고 패배와 같은 정산 대상으로 끝낸다.
   * 임시 성장·미사용 방울은 사라지고 신규 구출·클리어 보상은 없다. 이어하기 없음.
   */
  quit(): void {
    // 클리어가 확정된 뒤(감옥으로 가는 중)는 나가기로 결과를 바꿀 수 없다
    if (this.finished || this.clearConfirmed) return;
    this.defeatCause = 'quit';
    this.logEvent('quit');
    this.finish('defeat');
  }

  private checkJail(): void {
    const r = this.chapter.rescue;
    if (this.mode !== 'toJail' || !r) return;
    if (this.hasKey && this.player.x >= this.rightLimit - 2) {
      this.mode = 'opening';
      this.modeTimer = 1.6;
      this.banner('열쇠로 감옥을 여는 중…', 1.6);
    }
  }

  private finish(outcome: 'victory' | 'defeat'): void {
    if (outcome === 'victory') this.autoCollectOnVictory();
    this.mode = outcome;
    this.pending = [];
    this.logEvent(outcome, this.defeatCause ?? undefined);
  }

  // ───────────────────────── 연출 보조

  private addEffect(e: Omit<Effect, 'maxTtl'>): void {
    this.effects.push({ ...e, maxTtl: e.ttl });
  }

  banner(text: string, ttl: number): void {
    this.effects = this.effects.filter((e) => e.kind !== 'banner');
    this.addEffect({ kind: 'banner', x1: 0, x2: 0, y1: 0, y2: 0, ttl, text });
  }

  private tickEffects(dt: number): void {
    for (const e of this.effects) e.ttl -= dt;
    this.effects = this.effects.filter((e) => e.ttl > 0);
  }

  private logEvent(type: LogEntry['type'], detail?: string, value?: number): void {
    this.log.push({ t: Math.round(this.t * 100) / 100, type, detail, value });
  }
}
